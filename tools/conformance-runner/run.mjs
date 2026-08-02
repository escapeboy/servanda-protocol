#!/usr/bin/env node
// Servanda conformance runner. See README.md for usage and PROTOCOL.md for the wire format.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFamilies, suiteMetadata, deepEqual, RESPONSE_MEMBERS } from './lib/vectors.mjs';
import { Iut } from './lib/driver.mjs';
import { computeLevels, render } from './lib/report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const sep = argv.indexOf('--');
  if (sep === -1 || sep === argv.length - 1) {
    usage('missing `-- <command>`: the runner needs an implementation to run');
  }
  const opts = {
    vectors: resolve(HERE, '../../vectors'),
    levels: resolve(HERE, 'levels.json'),
    claim: [],
    only: null,
    timeout: 10_000,
    json: null,
    verbose: false,
    command: argv.slice(sep + 1),
  };
  for (let i = 0; i < sep; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? usage(`${a} needs a value`);
    if (a === '--vectors') opts.vectors = resolve(next());
    else if (a === '--levels') opts.levels = resolve(next());
    else if (a === '--claim') opts.claim = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--only') opts.only = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--timeout') opts.timeout = Number(next());
    else if (a === '--json') opts.json = resolve(next());
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--help' || a === '-h') usage();
    else usage(`unknown option ${a}`);
  }
  return opts;
}

function usage(err) {
  const text = `
usage: node run.mjs [options] -- <command> [args...]

  --vectors <dir>    vectors/ directory            (default ../../vectors)
  --levels <file>    level scope map               (default ./levels.json)
  --claim a,b        levels claimed; exit 2 if any is not granted
  --only fam,fam     run only these families (diagnostic; levels still reported)
  --timeout <ms>     per-request timeout           (default 10000)
  --json <file>      write the full report as JSON
  --verbose          show unverified pins even on a clean run

exit: 0 all good  1 a case failed or the pipe broke  2 a claimed level was not granted
`.trim();
  if (err) {
    console.error(`error: ${err}\n\n${text}`);
    process.exit(64);
  }
  console.log(text);
  process.exit(0);
}

function compare(kase, result) {
  const details = [];

  // A result may contain what PROTOCOL.md says it contains, and nothing else.
  //
  // Comparing only the PINNED members let a node return anything beside them. A hostile
  // implementation passed all 195 cases while attaching node-authored affordance copy to
  // `advertise_actions`, a display name to a case pinning `display_name: null`, and an edge
  // preview to every refusal — M-21 and M-12 walked straight through, because the suite was
  // checking what a node SAYS in the fields it was asked about and not what else it says.
  //
  // This cannot stop an implementation that memorises the corpus; no vector family can, since a
  // fixed corpus is always bakeable. It closes the hole an HONEST implementation falls into.
  const permitted = RESPONSE_MEMBERS[kase.op];
  if (permitted !== undefined) {
    const extra = Object.keys(result).filter((k) => !permitted.includes(k));
    if (extra.length > 0) {
      details.push(
        `result carries member(s) \`${extra.join('`, `')}\` that ${kase.op} does not define. ` +
          `PROTOCOL.md permits: \`${permitted.join('`, `')}\``,
      );
    }
  }

  for (const { field, expected } of kase.pins) {
    if (!(field in result)) {
      details.push(`missing field \`${field}\` in result (expected ${show(expected)})`);
      continue;
    }
    if (!deepEqual(result[field], expected)) {
      details.push(`\`${field}\`\n      expected ${show(expected)}\n      actual   ${show(result[field])}`);
    }
  }
  for (const d of kase.derived ?? []) {
    const actual = d.actual(result);
    if (!deepEqual(actual, d.expected)) {
      details.push(`${d.label} (derived)\n      expected ${show(d.expected)}\n      actual   ${show(actual)}`);
    }
  }
  return details;
}

function show(v, limit = 300) {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  return s !== undefined && s.length > limit ? `${s.slice(0, limit)}… (${s.length} chars)` : String(s);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const levelsDoc = JSON.parse(readFileSync(opts.levels, 'utf8'));
  const families = loadFamilies(opts.vectors);
  const meta = suiteMetadata(families);

  let cases = [...families.values()].flatMap((f) => f.cases);
  if (opts.only) cases = cases.filter((c) => opts.only.includes(c.family));

  const iut = new Iut(opts.command[0], opts.command.slice(1), { timeout: opts.timeout });

  let hello = { implementation: '(no handshake)', version: '', ops: null };
  let handshakeError = null;
  try {
    hello = await iut.hello();
  } catch (e) {
    handshakeError = e;
  }

  const results = [];
  for (const kase of cases) {
    const base = {
      id: kase.id,
      family: kase.family,
      file: kase.file,
      op: kase.op,
      unverified: kase.unverified ?? [],
    };

    // A declined op, a dead process and a failed handshake all produce the same thing: a
    // failed case with a reason. §8's suite is what answers a conformance claim, so an
    // implementation that answers nothing for a family must not appear to have passed it.
    if (handshakeError) {
      results.push({ ...base, pass: false, details: [`handshake failed: ${handshakeError.code} — ${handshakeError.message}`] });
      continue;
    }
    if (hello.ops && !hello.ops.includes(kase.op)) {
      results.push({ ...base, pass: false, details: [`declined: op \`${kase.op}\` is not in the implementation's declared ops`] });
      continue;
    }
    if (iut.dead) {
      results.push({ ...base, pass: false, details: [`no answer: ${iut.dead.code} — ${iut.dead.message}`] });
      continue;
    }

    let result;
    try {
      result = await iut.request(kase.id, kase.op, kase.input);
    } catch (e) {
      results.push({ ...base, pass: false, details: [`${e.code}: ${e.message}`] });
      continue;
    }
    const details = compare(kase, result);
    results.push({ ...base, pass: details.length === 0, details });
  }

  iut.close();

  const levels = computeLevels(levelsDoc, results, { filtered: opts.only !== null });
  const byId = new Map(levels.map((l) => [l.id, l]));
  const claims = opts.claim.map((id) => {
    const l = byId.get(id);
    if (!l) usage(`unknown level ${id}; known: ${levels.map((x) => x.id).join(', ')}`);
    return { id, title: l.title, verdict: l.verdict, granted: l.verdict === 'pass' || l.verdict === 'partial' };
  });

  const report = {
    vectors_dir: opts.vectors,
    suite_version: meta.suite_version,
    protocol_version: meta.protocol_version,
    implementation: hello.implementation,
    version: hello.version,
    command: opts.command.join(' '),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    levels,
    claims,
    results,
    stderr: iut.stderr.trim(),
  };

  console.log(render(report, { verbose: opts.verbose }));
  if (opts.json) writeFileSync(opts.json, JSON.stringify(report, null, 2));

  if (claims.some((c) => !c.granted)) process.exit(2);
  if (report.passed !== report.total) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(70);
});
