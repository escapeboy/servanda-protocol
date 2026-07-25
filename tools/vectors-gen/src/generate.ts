/**
 * Deterministic generator for vectors/.
 *
 * Determinism rules: no Date.now(), no randomness, no network. Every key is derived from
 * a committed BIP-39 test mnemonic and every timestamp is a literal.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize, type Json } from './jcs.js';
import {
  ALICE,
  BOB,
  CAROL,
  ORG_MNEMONIC,
  ORG_ROOT,
  PERSONA_MNEMONIC,
  PROTOCOL_VERSION,
  canonicalCommitmentPreimage,
  commitmentHash,
  commitmentHashPreimage,
  edgeId,
  type Commitment,
} from './protocol.js';
import {
  digestHex,
  derivePersona,
  mnemonicToSeed,
  signObject,
  toHex,
  PURPOSE_CONSTANT,
} from './crypto.js';
import { CANONICALIZATION_CASES } from './cases-canonicalization.js';
import {
  INVALID_CASES,
  VALID_CASES,
  baseCommitment,
  type TransitionCase,
} from './cases-transitions.js';
import { verifyChain } from './transitions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const VECTORS_ROOT = join(HERE, '..', '..', '..', 'vectors');

const SUITE_VERSION = '0.1.0-pre';

function banner(spec: string) {
  return {
    suite_version: SUITE_VERSION,
    protocol_version: PROTOCOL_VERSION,
    spec_reference: spec,
    generated_by: 'tools/vectors-gen (deterministic; do not edit by hand)',
  };
}

/** Stable 2-space JSON with a trailing newline, so git diffs stay readable. */
export function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export function buildCanonicalization() {
  return {
    ...banner('spec/00-overview.md (Conventions) — RFC 8785 JCS'),
    description:
      'Canonicalization cases. `input` is raw JSON text; parse it, canonicalize, and compare ' +
      'the result to `canonical` byte for byte. `sha256` is over the UTF-8 bytes of `canonical`.',
    cases: CANONICALIZATION_CASES.map((c) => {
      const parsed = JSON.parse(c.input) as Json;
      const canonical = canonicalize(parsed);
      return {
        name: c.name,
        description: c.description,
        input: c.input,
        canonical,
        sha256: digestHex(parsed),
      };
    }),
  };
}

export function buildHashing() {
  const base = baseCommitment;

  const variant = (
    name: string,
    description: string,
    patch: Partial<Commitment>,
    sameHashAsBase: boolean,
  ) => {
    const c: Commitment = { ...base, ...patch };
    return {
      name,
      description,
      commitment: c as unknown as Json,
      hash_preimage: commitmentHashPreimage(c) as Json,
      hash_preimage_canonical: canonicalCommitmentPreimage(c),
      commitment_hash: commitmentHash(c),
      same_hash_as_base: sameHashAsBase,
    };
  };

  const cases = [
    variant('base', 'Reference commitment; every other case is compared against this hash.', {}, true),

    // --- vault-local fields excluded from the preimage: hash MUST NOT change ---
    variant(
      'differs-only-in-evidence-refs',
      'THE required pair: identical promise, different evidence sets. Two parties agreeing on a ' +
        'promise need not share evidence, so the hash MUST be identical to base.',
      {
        evidence_refs: [
          { kind: 'url', value: 'https://github.com/acme/repo/pull/341' },
          { kind: 'commit', value: '9f2a4c1' },
        ],
      },
      true,
    ),
    variant(
      'differs-only-in-empty-evidence-refs',
      'Evidence removed entirely — still the same promise, still the same hash.',
      { evidence_refs: [] },
      true,
    ),
    variant(
      'differs-only-in-confidence',
      'Extraction confidence is vault-local and excluded from the preimage.',
      { confidence: 0.42 },
      true,
    ),
    variant(
      'differs-only-in-source',
      'How the commitment was captured is vault-local and excluded.',
      { source: 'extracted' },
      true,
    ),
    variant(
      'differs-only-in-conditions',
      'blocked_by references are vault-local and excluded from the wire identity.',
      { conditions: ['0'.repeat(64)] },
      true,
    ),

    // --- the five fields that DO define identity ---
    variant(
      'differs-in-intent',
      'intent is one of the five hashed fields.',
      { intent: 'Add integration tests for InvoiceService' },
      false,
    ),
    variant('differs-in-owner', 'owner is one of the five hashed fields.', { owner: CAROL.personaId }, false),
    variant('differs-in-owed-to', 'owed_to is one of the five hashed fields.', { owed_to: CAROL.personaId }, false),
    variant('differs-in-due', 'due is one of the five hashed fields.', { due: '2026-09-01T00:00:00Z' }, false),
    variant(
      'differs-in-created-at',
      'created_at is one of the five hashed fields.',
      { created_at: '2026-07-26T08:55:00Z' },
      false,
    ),

    // --- null handling and unicode ---
    variant(
      'reflexive-owed-to-null',
      '§3.1: owed_to null is a reflexive commitment. null is hashed as the JSON literal, not omitted.',
      { owed_to: null },
      false,
    ),
    variant('undated-due-null', '§3.1: due null is valid and expected to be the majority case.', { due: null }, false),
    variant(
      'unicode-intent',
      'Non-ASCII intent, exercising JCS string handling inside the hash preimage.',
      { intent: 'Изпрати оферта на Георги — складът, до петък 😀' },
      false,
    ),
  ];

  const baseHash = cases[0].commitment_hash;
  for (const c of cases) {
    const equal = c.commitment_hash === baseHash;
    if (equal !== c.same_hash_as_base) {
      throw new Error(
        `hashing case "${c.name}": expected same_hash_as_base=${c.same_hash_as_base} but got ${equal}`,
      );
    }
  }

  return {
    ...banner('spec/03-commitment.md §3.2'),
    description:
      'commitment_hash = sha256(JCS({intent, owner, owed_to, due, created_at})). Cases with ' +
      'same_hash_as_base=true prove that no other field of the commitment object reaches the hash.',
    hashed_fields: ['intent', 'owner', 'owed_to', 'due', 'created_at'],
    base_commitment_hash: baseHash,
    cases,
  };
}

export function buildSignatures() {
  const sign = (name: string, description: string, unsigned: Record<string, Json>, signer: typeof ALICE) => {
    const sig = signObject(unsigned, signer.privateKey);
    return {
      name,
      description,
      signer: { persona_id: signer.personaId, derivation_path: signer.path },
      unsigned_object: unsigned as Json,
      canonical: canonicalize(unsigned as Json),
      sha256_preimage: digestHex(unsigned as Json),
      signature: sig,
      signed_object: { ...unsigned, sig } as Json,
    };
  };

  const edge = {
    commitment_hash: commitmentHash(baseCommitment),
    proposed_at: '2026-07-25T09:00:00Z',
  };
  const eid = edgeId(edge.commitment_hash, ALICE.personaId, BOB.personaId, edge.proposed_at);

  const assertion = (state: string, asserted_at: string, by: string, evidence_hash: string | null) => ({
    v: PROTOCOL_VERSION,
    type: 'assertion',
    edge_id: eid,
    state,
    asserted_at,
    by,
    evidence_hash,
  });

  return {
    ...banner('spec/00-overview.md (Conventions), §1.3, §1.7, §4.2'),
    description:
      'Ed25519 over sha256(JCS(object without its `sig` field)). Verify by recomputing ' +
      '`sha256_preimage` from `unsigned_object` and checking `signature` against the signer key.',
    signing_rule: 'ed25519_sign(sha256(JCS(object minus "sig")), private_key)',
    cases: [
      sign(
        'attestation-by-org-root',
        '§1.3: an org root attests that a persona key carries these claims.',
        {
          v: PROTOCOL_VERSION,
          type: 'attestation',
          org: ORG_ROOT.personaId,
          subject: ALICE.personaId,
          subject_kind: 'persona',
          claims: { display_name: 'Maria Ivanova', handle: 'maria@acme.com' },
          issued_at: '2026-07-01T00:00:00Z',
          expires_at: '2027-07-01T00:00:00Z',
        },
        ORG_ROOT,
      ),
      sign(
        'assertion-proposed',
        '§4.3: the owner proposes. One signature — socially nothing until confirmed.',
        assertion('proposed', '2026-07-25T09:00:00Z', ALICE.personaId, null),
        ALICE,
      ),
      sign(
        'assertion-confirmed',
        '§4.3: the counterparty confirms. The edge now exists.',
        assertion('confirmed', '2026-07-25T10:00:00Z', BOB.personaId, null),
        BOB,
      ),
      sign(
        'assertion-closed-with-evidence',
        '§4.4: closure carries the hash of the evidence bundle, never the bundle itself (M-7).',
        assertion(
          'closed',
          '2026-08-02T12:00:00Z',
          ALICE.personaId,
          digestHex('pr#341 merged; 11 tests' as Json),
        ),
        ALICE,
      ),
      sign(
        'rotation-statement',
        '§1.7: signed by the OLD key, transferring continuity to the new one (sig_old).',
        {
          v: PROTOCOL_VERSION,
          type: 'rotation',
          old: ALICE.personaId,
          new: CAROL.personaId,
          rotated_at: '2026-09-01T00:00:00Z',
        },
        ALICE,
      ),
    ],
  };
}

export function buildDerivation() {
  const seed = mnemonicToSeed(PERSONA_MNEMONIC);
  const indexes = [0, 1, 2, 7, 100];

  return {
    ...banner('spec/01-identity.md §1.1–§1.2'),
    description:
      'BIP-39 mnemonic → 64-byte seed → SLIP-0010 hardened ed25519 derivation at m/7391\'/{i}\'. ' +
      'persona_id = hex(public_key).',
    warning:
      'TEST VECTORS ONLY. These mnemonics are published BIP-39 test values (all-zero and all-0x7f ' +
      'entropy). Every private key here is public knowledge — never use them for anything real.',
    purpose_constant: PURPOSE_CONSTANT,
    mnemonic: PERSONA_MNEMONIC,
    passphrase: '',
    seed: toHex(seed),
    personas: indexes.map((i) => {
      const p = derivePersona(seed, i);
      return {
        persona_index: i,
        path: p.path,
        chain_code: toHex(p.chainCode),
        private_key: toHex(p.privateKey),
        public_key: toHex(p.publicKey),
        persona_id: p.personaId,
      };
    }),
    org_root: (() => {
      const seedOrg = mnemonicToSeed(ORG_MNEMONIC);
      const p = derivePersona(seedOrg, 0);
      return {
        description: 'Separate root used as the attesting organization in the signature vectors.',
        mnemonic: ORG_MNEMONIC,
        seed: toHex(seedOrg),
        path: p.path,
        private_key: toHex(p.privateKey),
        public_key: toHex(p.publicKey),
        persona_id: p.personaId,
      };
    })(),
  };
}

function buildTransitionGroup(cases: TransitionCase[], kind: 'valid' | 'invalid') {
  return cases.map((c) => {
    const result = verifyChain(c.edge, c.assertions);

    // The expected outcomes are hand-declared in cases-transitions.ts. If the reference
    // verifier disagrees, generation fails loudly rather than silently recording the bug.
    if (result.outcomes.length !== c.expected.length) {
      throw new Error(`transition case "${c.name}": outcome/expectation length mismatch`);
    }
    c.expected.forEach((want, i) => {
      const got = result.outcomes[i];
      const gotReason = got.accepted ? null : (got.reason ?? null);
      if (gotReason !== want) {
        throw new Error(
          `transition case "${c.name}" assertion[${i}]: expected ${want ?? 'ACCEPT'}, got ${gotReason ?? 'ACCEPT'}`,
        );
      }
    });
    if (result.finalState !== c.expectedFinalState) {
      throw new Error(
        `transition case "${c.name}": expected final state ${c.expectedFinalState}, got ${result.finalState}`,
      );
    }
    if (kind === 'invalid' && result.rejectedCount === 0) {
      throw new Error(`transition case "${c.name}" is in the invalid set but rejects nothing`);
    }

    return {
      name: c.name,
      description: c.description,
      edge: c.edge as unknown as Json,
      assertions: c.assertions as unknown as Json,
      expected_outcomes: result.outcomes.map((o, i) => ({
        index: i,
        accepted: o.accepted,
        rejection_reason: o.accepted ? null : (o.reason ?? null),
      })),
      expected_final_state: result.finalState,
    };
  });
}

export function buildTransitionsValid() {
  return {
    ...banner('spec/04-edge.md §4.3–§4.5'),
    description:
      'Assertion sequences a conforming node MUST accept, with the resulting effective edge state.',
    note:
      'Effective state folds `confirmed` into `open` (§4.3 marks confirmed ≡ open) and adds ' +
      '`pending-acceptance` to model the §4.4 acceptance window, which §4.3 has no row for. ' +
      'See vectors/README.md — this is an interpretation, not normative.',
    cases: buildTransitionGroup(VALID_CASES, 'valid'),
  };
}

export function buildTransitionsInvalid() {
  return {
    ...banner('spec/04-edge.md §4.3, conformance M-14'),
    description:
      'Assertion sequences a conforming node MUST reject. §4.3: "Any assertion violating this table ' +
      'is invalid and MUST be discarded." These cases are the operative definition of M-14 — a ' +
      'verifier that accepts any of them is non-conforming.',
    cases: buildTransitionGroup(INVALID_CASES, 'invalid'),
  };
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export function buildAll(): GeneratedFile[] {
  return [
    { path: 'canonicalization/jcs.json', content: serialize(buildCanonicalization()) },
    { path: 'hashing/commitment-hash.json', content: serialize(buildHashing()) },
    { path: 'signatures/signatures.json', content: serialize(buildSignatures()) },
    { path: 'derivation/persona-keys.json', content: serialize(buildDerivation()) },
    { path: 'transitions/valid.json', content: serialize(buildTransitionsValid()) },
    { path: 'transitions/invalid.json', content: serialize(buildTransitionsInvalid()) },
  ];
}

export function writeAll(root: string): GeneratedFile[] {
  const files = buildAll();
  for (const f of files) {
    const target = join(root, f.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content, 'utf8');
  }
  return files;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const files = writeAll(VECTORS_ROOT);
  for (const f of files) console.log(`wrote vectors/${f.path}`);
  console.log(`\n${files.length} vector files generated.`);
}
