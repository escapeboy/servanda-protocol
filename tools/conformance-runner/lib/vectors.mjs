// Turns vector files into cases: a request to send, and the pins to compare the answer
// against. Every pin's expected value is read out of the vector at run time. Nothing in
// this file is a literal from a case, because a runner that restates the oracle is a
// second place for the oracle to be wrong — and the second place is the one nobody
// regenerates.
//
// What this file DOES contain is the shape of each request: which members of a case go
// into `input`, and which members of the response are compared to which pins. That is a
// reading of vectors/README.md ("how to consume them") and is the runner's own claim.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return deepEqual(ka, kb) && ka.every((k) => deepEqual(a[k], b[k]));
}

const pin = (field, expected) => ({ field, expected });

// Every adapter returns { doc, cases }. A case is:
//   { name, op, input, pins, derived?, unverified? }
// `derived` checks are properties the vector states about a case rather than pinning as a
// response field — same_hash_as_base, must_not_advertise. They read the vector too.
const ADAPTERS = {
  canonicalization: (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'canonicalize',
    input: { json_text: c.input },
    pins: [pin('canonical', c.canonical), pin('sha256', c.sha256)],
  })),

  derivation: (doc) => [
    {
      name: 'seed',
      op: 'bip39_seed',
      input: { mnemonic: doc.mnemonic, passphrase: doc.passphrase },
      pins: [pin('seed', doc.seed)],
    },
    ...doc.personas.map((p) => ({
      name: `persona-${p.persona_index}`,
      op: 'derive_key',
      input: { mnemonic: doc.mnemonic, passphrase: doc.passphrase, path: p.path },
      pins: [
        pin('path', p.path),
        pin('chain_code', p.chain_code),
        pin('private_key', p.private_key),
        pin('public_key', p.public_key),
        pin('persona_id', p.persona_id),
      ],
    })),
    // The org root carries its own mnemonic and its own seed but no passphrase member.
    // Passing the file-level passphrase is an assumption, and `seed` is the pin that
    // catches it if it is wrong — which is why the seed is asked for separately.
    {
      name: 'org-root-seed',
      op: 'bip39_seed',
      input: { mnemonic: doc.org_root.mnemonic, passphrase: doc.passphrase },
      pins: [pin('seed', doc.org_root.seed)],
    },
    {
      name: 'org-root',
      op: 'derive_key',
      input: { mnemonic: doc.org_root.mnemonic, passphrase: doc.passphrase, path: doc.org_root.path },
      pins: [
        pin('path', doc.org_root.path),
        pin('private_key', doc.org_root.private_key),
        pin('public_key', doc.org_root.public_key),
        pin('persona_id', doc.org_root.persona_id),
      ],
    },
  ],

  signatures: (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'signing_preimage',
    input: { signed_object: c.signed_object },
    pins: [pin('canonical', c.canonical), pin('sha256_preimage', c.sha256_preimage)],
    // No verdict is asked for: the file pins `signature` and `signer.persona_id` but
    // states no expectation about verifying them, and the runner does not invent one.
    // See README.md findings/3.
    unverified: ['no verification verdict is pinned by this family (README.md findings/3)'],
  })),

  hashing: (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'commitment_hash',
    input: { commitment: c.commitment },
    pins: [
      pin('commitment_hash', c.commitment_hash),
      pin('hash_preimage_canonical', c.hash_preimage_canonical),
      pin('hash_preimage_hex', c.hash_preimage_hex),
    ],
    derived: [{
      label: 'same_hash_as_base',
      expected: c.same_hash_as_base,
      actual: (r) => r.commitment_hash === doc.base_commitment_hash,
    }],
  })),

  'envelope-id': (doc) => [
    ...doc.cases.map((c) => ({
      name: c.name,
      op: 'envelope_id',
      input: { envelope: c.envelope_sans_id },
      pins: [pin('id', c.id), pin('canonical', c.canonical), pin('id_preimage_hex', c.id_preimage_hex)],
      derived: [{
        label: 'same_id_as_base',
        expected: c.same_id_as_base,
        actual: (r) => r.id === doc.base_id,
      }],
    })),
    // The one case the file says cannot be written as a patch: an envelope that already
    // carries `id` must hash to the base id once `id` is taken out.
    {
      name: 'id-removal',
      op: 'envelope_id',
      input: { envelope: doc.id_removal.envelope_with_id },
      pins: [pin('id', doc.id_removal.id_after_removal)],
    },
  ],

  'envelope-bounds': (doc) => [
    ...doc.cases.map((c) => ({
      name: c.name,
      op: 'envelope_bounds',
      input: { envelope: c.envelope_sans_id, bound: c.bound },
      pins: [pin('measured', c.measured), pin('within_bounds', c.within_bounds)],
    })),
    // §2's scalar-boundary rule. The example names no bound of its own, so the limit is
    // read from bounds.payload_string_octets — see README.md findings/4.
    {
      name: 'clipping-scalar-boundary',
      op: 'clip_to_octets',
      input: {
        value: doc.clipping.scalar_boundary_example.source,
        limit_octets: doc.bounds.payload_string_octets,
      },
      pins: [pin('clipped', doc.clipping.scalar_boundary_example.clipped)],
      derived: [{
        label: 'clipped_to_octets',
        expected: doc.clipping.scalar_boundary_example.clipped_to_octets,
        actual: (r) => (typeof r.clipped === 'string' ? Buffer.byteLength(r.clipped, 'utf8') : null),
      }],
    },
  ],

  transitions: (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'verify_transitions',
    input: { edge: c.edge, assertions: c.assertions },
    pins: [pin('outcomes', c.expected_outcomes), pin('final_state', c.expected_final_state)],
  })),

  'addressing-inbox': (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'verify_inbox_record',
    input: { record: c.record, known_keys: doc.known_keys },
    pins: [pin('canonical', c.canonical), ...expectedPins(c.expected)],
  })),

  'addressing-oob': (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'oob_bootstrap',
    input: { message: c.message },
    pins: [
      pin('canonical', c.canonical),
      pin('payload_b64url', c.payload_b64url),
      pin('url', c.url),
      pin('signature_verifies', c.signature_verifies),
    ],
    // decoded_equals_original / edge_equals_original are pinned false on the tampered
    // case, where decode(encode(m)) == m is nevertheless true. "Original" there means the
    // other case's message, and nothing in the file names that reference — so the runner
    // does not check them rather than guess. README.md findings/5.
    unverified: ['decoded_equals_original', 'edge_equals_original'],
  })),

  recovery: (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'recover_request',
    input: { request: c.request },
    pins: expectedPins(c.expected),
  })),

  'node-surface-actions': (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'advertise_actions',
    input: {
      edge: c.edge,
      assertions: c.assertions,
      viewer: c.viewer,
      window_elapsed: c.window_elapsed,
    },
    pins: [pin('effective_state', c.effective_state), pin('actions', c.expected_actions)],
    derived: [{
      label: 'must_not_advertise',
      expected: [],
      actual: (r) => (Array.isArray(r.actions) ? r.actions : [])
        .map((a) => a && a.act)
        .filter((act) => c.must_not_advertise.includes(act)),
    }],
  })),

  'node-surface-act-tool': (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'act',
    input: {
      edge: c.edge,
      assertions: c.assertions,
      effective_state: c.effective_state,
      call: c.call,
      window_elapsed: c.window_elapsed,
    },
    pins: expectedPins(c.expected),
  })),

  'node-surface-brief-slots': (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'judge_brief_slot',
    input: { slot: c.slot },
    pins: expectedPins(c.expected),
  })),

  'node-surface-verification-levels': (doc) => doc.cases.map((c) => ({
    name: c.name,
    op: 'grade_verification',
    input: { evidence: c.evidence },
    pins: expectedPins(c.expected),
  })),
};

// Families whose file carries a whole `expected` object get one pin per member of it,
// whatever those members happen to be named. recovery says `reason` where addressing says
// `rejection_reason`; deriving the pins from the file means the runner does not have to
// know that, and does not go stale when a family gains a member.
function expectedPins(expected) {
  return Object.entries(expected).map(([k, v]) => pin(k, v));
}

const FILES = {
  canonicalization: 'canonicalization/jcs.json',
  derivation: 'derivation/persona-keys.json',
  signatures: 'signatures/signatures.json',
  hashing: 'hashing/commitment-hash.json',
  'envelope-id': 'envelope/envelope-id.json',
  'envelope-bounds': 'envelope/bounds.json',
  'transitions-valid': 'transitions/valid.json',
  'transitions-invalid': 'transitions/invalid.json',
  'addressing-inbox': 'addressing/inbox-records.json',
  'addressing-oob': 'addressing/oob-bootstrap.json',
  recovery: 'recovery/proof-of-possession.json',
  'node-surface-actions': 'node-surface/actions.json',
  'node-surface-act-tool': 'node-surface/act-tool.json',
  'node-surface-brief-slots': 'node-surface/brief-slots.json',
  'node-surface-verification-levels': 'node-surface/verification-levels.json',
};

export function loadFamilies(vectorsDir) {
  const families = new Map();
  for (const [family, file] of Object.entries(FILES)) {
    const doc = JSON.parse(readFileSync(join(vectorsDir, file), 'utf8'));
    const adapter = ADAPTERS[family] ?? ADAPTERS[family.replace(/-(valid|invalid)$/, '')];
    const cases = adapter(doc).map((c) => ({ ...c, family, file, id: `${family}#${c.name}` }));
    families.set(family, { family, file, doc, cases });
  }
  return families;
}

export function suiteMetadata(families) {
  const first = families.values().next().value.doc;
  return { suite_version: first.suite_version, protocol_version: first.protocol_version };
}
