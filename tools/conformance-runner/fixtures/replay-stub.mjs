#!/usr/bin/env node
// A fault-injecting fixture, and NOT an example implementation.
//
// It answers every request by reading the answer out of the vectors, then corrupts the
// answers named on its command line. That makes the expected failure set exactly known,
// which is the only way to demonstrate that the runner catches the cases that are wrong
// AND leaves alone the cases that are right. A runner shown only against a correct
// implementation has not been shown to be able to fail; one shown only against a broken
// one has not been shown to be able to pass.
//
// Do not copy this as a starting point. It knows nothing about Servanda; it knows how to
// look up an answer. An implementation that behaved this way would pass the suite and
// implement nothing, which is exactly the failure mode `--fault` exists to make visible.
//
//   --fault <family#case>[:mutation]   corrupt one case (repeatable)
//   --fault-set default                the eight faults the README documents
//   --decline <op>                     omit an op from the handshake
//   --die-at <family#case>             exit before answering that case
//
// Mutations are named per case below; a fault with no known mutation is rejected loudly
// rather than silently doing nothing, because a demo whose faults quietly do not fire
// proves the same nothing as a check that cannot fail.

import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFamilies } from '../lib/vectors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Each entry corrupts a replayed answer the way a plausible implementation bug would.
// The comment on each names the MUST it breaks — that is what the runner should report.
const MUTATIONS = {
  // M-14: escaping the solidus is the classic JSON-escaping-by-habit bug. It changes the
  // canonical form and therefore every hash taken over it.
  'canonicalization#string-escapes-solidus': (r) => {
    const canonical = r.canonical.replaceAll('/', '\\/');
    return { canonical, sha256: createHash('sha256').update(canonical, 'utf8').digest('hex') };
  },
  // M-14: the owner confirms their own proposal and the verifier lets it through — the
  // exact failure vectors/README.md says will still pass every positive test.
  'transitions-invalid#owner-self-confirms': (r) => ({
    outcomes: r.outcomes.map((o) => ({ ...o, accepted: true, rejection_reason: null })),
    final_state: 'open',
  }),
  // M-20: `release` belongs to owed_to alone (§4.3). Offering it to the owner invites an
  // assertion the table discards, while the owner believes they forgave a debt.
  'node-surface-actions#open-owner': (r) => ({
    ...r,
    actions: [...r.actions, { act: 'release', tool: 'act', args: {} }],
  }),
  // M-21: a node-supplied `label` is a node telling a client what to write.
  'node-surface-brief-slots#invalid-label-on-the-primary-action': () => ({
    valid: true,
    rejection_reason: null,
  }),
  // §6.6: accepting a bare published rotation as proof of possession IS the v0.1 defect.
  'recovery#bare-rotation-is-not-a-proof': () => ({ accepted: true, reason: null }),
  // M-17: a hub-signed inbox record moves a persona the hub does not own.
  'addressing-inbox#invalid-signed-by-hub': (r) => ({
    ...r, accepted: true, rejection_reason: null, actual_signer: null,
  }),
  // M-19: measuring right and judging wrong — the reason the bound and the measurement
  // are both pinned.
  'envelope-bounds#payload-string-over-the-limit': (r) => ({ ...r, within_bounds: true }),
  // M-12: emitting an attested display name at a level that does not carry one.
  'node-surface-verification-levels#negative-name-not-shown-at-ext': (r) => ({
    ...r, display_name: 'Georgi Petrov', name_bearing: true,
  }),
};

const DEFAULT_FAULTS = Object.keys(MUTATIONS);

function parseArgs(argv) {
  const opts = { faults: [], decline: [], dieAt: null, vectors: resolve(HERE, '../../../vectors') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--fault') opts.faults.push(next());
    else if (a === '--fault-set') opts.faults.push(...(next() === 'default' ? DEFAULT_FAULTS : []));
    else if (a === '--decline') opts.decline.push(next());
    else if (a === '--die-at') opts.dieAt = next();
    else if (a === '--vectors') opts.vectors = resolve(next());
    else {
      process.stderr.write(`replay-stub: unknown option ${a}\n`);
      process.exit(64);
    }
  }
  for (const f of opts.faults) {
    if (!MUTATIONS[f]) {
      process.stderr.write(`replay-stub: no mutation defined for fault ${f}\n`);
      process.exit(64);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const faults = new Set(opts.faults);

// The answer key: every case's pinned fields, reassembled into the result the protocol
// asks for. Reading it from the same loader the runner uses guarantees the fixture
// answers the question that was actually asked.
const answers = new Map();
for (const family of loadFamilies(opts.vectors).values()) {
  for (const kase of family.cases) {
    answers.set(kase.id, Object.fromEntries(kase.pins.map((p) => [p.field, p.expected])));
  }
}

const ALL_OPS = [
  'canonicalize', 'commitment_hash', 'envelope_id', 'envelope_bounds', 'clip_to_octets',
  'bip39_seed', 'derive_key', 'signing_preimage', 'verify_transitions',
  'verify_inbox_record', 'oob_bootstrap', 'recover_request', 'advertise_actions', 'act',
  'judge_brief_slot', 'grade_verification',
];

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const { id, op } = JSON.parse(line);

  if (op === 'hello') {
    const ops = ALL_OPS.filter((o) => !opts.decline.includes(o));
    const result = { implementation: 'replay-stub', version: '0.0.1', protocol: 1, ops };
    process.stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`);
    continue;
  }

  if (opts.dieAt === id) {
    process.stderr.write(`replay-stub: exiting at ${id} as instructed\n`);
    process.exit(3);
  }

  const answer = answers.get(id);
  if (!answer) {
    const error = { code: 'unknown-case', message: `no replay answer for ${id}` };
    process.stdout.write(`${JSON.stringify({ id, ok: false, error })}\n`);
    continue;
  }

  const result = faults.has(id) ? MUTATIONS[id](answer) : answer;
  process.stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`);
}
