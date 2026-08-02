#!/usr/bin/env node
// Asserts that the runner passes what it should and fails exactly what it should.
//
// The fault demo is the evidence that this runner can fail, so the demo itself has to be
// checked. Otherwise it decays the ordinary way: a fault stops firing because a case was
// renamed, the run still prints FAIL for the other seven, and nobody notices that the
// eighth check went quiet. Every expectation below is an exact set, never a count and
// never "at least" — a superset passes a count and hides a regression.

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = mkdtempSync(resolve(tmpdir(), 'servanda-conformance-'));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail) console.log(`      ${detail}`); }
};
const setEq = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

function run(label, args) {
  const json = resolve(OUT, `${label}.json`);
  const r = spawnSync('node', [resolve(HERE, 'run.mjs'), '--json', json, ...args], {
    cwd: HERE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return { exit: r.status, report: JSON.parse(readFileSync(json, 'utf8')) };
}

const STUB = ['--', 'node', resolve(HERE, 'fixtures/replay-stub.mjs')];
const JCS = ['--', 'node', resolve(HERE, 'fixtures/jcs-node-stub.mjs')];

// 1. A correct implementation passes, and the levels the vectors cannot reach say so.
{
  const { exit, report } = run('clean', STUB);
  const verdicts = Object.fromEntries(report.levels.map((l) => [l.id, l.verdict]));
  check('clean replay: exit 0', exit === 0, `exit ${exit}`);
  check('clean replay: no failed cases', report.passed === report.total,
    `${report.total - report.passed} failed`);
  check('clean replay: node passes', verdicts.node === 'pass', verdicts.node);
  check('clean replay: federating-node passes', verdicts['federating-node'] === 'pass');
  check('clean replay: hub is not assessable, never pass', verdicts.hub === 'not-assessable');
  check('clean replay: client tops out at partial', verdicts.client === 'partial');
}

// 2. The faults fire, and ONLY the faults fire.
{
  const EXPECTED = [
    // v0.2: ninth fault. The signatures family pinned no verdict until now, so a `return true`
    // verifier had nothing to fail — this entry is the one the suite previously could not catch.
    'signatures#signed-by-a-different-key',
    'canonicalization#string-escapes-solidus',
    'transitions-invalid#owner-self-confirms',
    'node-surface-actions#open-owner',
    'node-surface-brief-slots#invalid-label-on-the-primary-action',
    'recovery#bare-rotation-is-not-a-proof',
    'addressing-inbox#invalid-signed-by-hub',
    'envelope-bounds#payload-string-over-the-limit',
    'node-surface-verification-levels#negative-name-not-shown-at-ext',
    // v0.2, tenth and eleventh: the two families that closed M-4, M-8 and M-9. Both faults are
    // the permissive reading of their rule — serve a member an edge nobody published, and report
    // an undecomposed collective edge as verifiable — which is what an implementation that
    // skipped the rule entirely would answer.
    'visibility#a-scope-member-is-refused-an-UNPUBLISHED-edge',
    'transitions-invalid#collective-edge-with-neither-children-nor-coordinator',
  ];
  const { exit, report } = run('faults', ['--claim', 'node,federating-node', ...STUB,
    '--fault-set', 'default']);
  const failed = report.results.filter((r) => !r.pass).map((r) => r.id);
  check('faults: caught exactly the injected set', setEq(failed, EXPECTED),
    `got ${JSON.stringify(failed)}`);
  check('faults: exit 2 (a claimed level was refused)', exit === 2, `exit ${exit}`);
  check('faults: both claims refused', report.claims.every((c) => !c.granted));

  const byId = Object.fromEntries(report.levels.map((l) => [l.id, l]));
  check('faults: node fails on its eight', setEq(byId.node.failed, [
    'signatures#signed-by-a-different-key',
    'canonicalization#string-escapes-solidus',
    'transitions-invalid#owner-self-confirms',
    'transitions-invalid#collective-edge-with-neither-children-nor-coordinator',
    'node-surface-actions#open-owner',
    'envelope-bounds#payload-string-over-the-limit',
    'node-surface-verification-levels#negative-name-not-shown-at-ext',
    'visibility#a-scope-member-is-refused-an-UNPUBLISHED-edge',
  ]), JSON.stringify(byId.node.failed));
  check('faults: the §6 families land on federating-node only',
    byId['federating-node'].failed.length === byId.node.failed.length + 2);
  // The hole this found in its own grader: a required family with no results contributed zero
  // cases and zero failures, so a level whose requirements named a family the loader did not know
  // graded PASS on the strength of never having run it. Reachable by a one-line edit to
  // levels.json, which is exactly how it happened.
  {
    const levels = JSON.parse(readFileSync(new URL('./levels.json', import.meta.url), 'utf8'));
    levels.levels.find((l) => l.id === 'node').required.push('a-family-nobody-implemented');
    const tmp = join(mkdtempSync(join(tmpdir(), 'servanda-runner-')), 'levels.json');
    writeFileSync(tmp, JSON.stringify(levels));
    const { exit, report } = run('missing-family', ['--claim', 'node', '--levels', tmp, ...STUB]);
    const node = report.levels.find((l) => l.id === 'node');
    check('missing family: the level is not graded', node.verdict === 'not-assessable',
      `verdict ${node.verdict}`);
    check('missing family: the reason names it',
      node.unreachable.some((u) => u.includes('a-family-nobody-implemented')));
    check('missing family: the claim is refused', exit === 2 && report.claims.every((c) => !c.granted));
  }

  check('faults: brief-slots is advisory at node, required at client',
    byId.node.advisory.failed.length === 1
    && byId.client.failed.includes('node-surface-brief-slots#invalid-label-on-the-primary-action'));
  check('faults: hub stays not-assessable regardless of failures',
    byId.hub.verdict === 'not-assessable');
  // The derived check must fire on its own, not merely ride along with the pin.
  const actions = report.results.find((r) => r.id === 'node-surface-actions#open-owner');
  check('faults: must_not_advertise fires as its own check',
    actions.details.some((d) => d.startsWith('must_not_advertise')));
}

// 3. A declined op is a failure with a name, not a silence.
{
  const { exit, report } = run('declined', JCS);
  const canon = report.results.filter((r) => r.family === 'canonicalization');
  const declined = report.results.filter((r) => r.details.some((d) => d.startsWith('declined:')));
  check('jcs-only: canonicalization passes on merit', canon.every((r) => r.pass));
  check('jcs-only: every other case fails', report.passed === canon.length);
  check('jcs-only: the failures are named `declined`',
    declined.length === report.total - canon.length);
  check('jcs-only: exit 1', exit === 1, `exit ${exit}`);
}

// 4. An implementation that dies mid-run does not leave the rest looking untested.
{
  const { exit, report } = run('crash', ['--only', 'recovery', ...STUB,
    '--die-at', 'recovery#bare-rotation-is-not-a-proof']);
  const noAnswer = report.results.filter((r) => r.details.some((d) => d.includes('process-exited')));
  check('crash: every case after the exit is a failure', noAnswer.length === 4,
    `${noAnswer.length} of ${report.total}`);
  check('crash: exit 1', exit === 1, `exit ${exit}`);
}

// 5. --only must not be a way to mint a green verdict from the families you happen to pass.
{
  const { exit, report } = run('filtered', ['--only', 'canonicalization', ...STUB]);
  check('--only: no level is graded, even with every run case passing',
    report.passed === report.total && report.levels.every((l) => l.verdict === 'not-assessable'),
    JSON.stringify(report.levels.map((l) => l.verdict)));
  const claimed = run('filtered-claim', ['--only', 'canonicalization', '--claim', 'node', ...STUB]);
  check('--only: a claim over a filtered run is refused', claimed.exit === 2, `exit ${claimed.exit}`);
  check('--only: a clean filtered run still exits 0 without a claim', exit === 0, `exit ${exit}`);
}

// 6. The runner carries no expected values of its own. If it did, pointing it at an empty
//    vectors directory would still produce answers.
{
  const r = spawnSync('node', [resolve(HERE, 'run.mjs'), '--vectors', OUT, ...STUB],
    { cwd: HERE, encoding: 'utf8' });
  check('no built-in oracle: the runner cannot run without vectors/',
    r.status !== 0 && /ENOENT/.test(r.stderr), `exit ${r.status}`);
}

console.log(failures === 0 ? '\nall selftests passed' : `\n${failures} selftest(s) failed`);
process.exit(failures === 0 ? 0 : 1);
