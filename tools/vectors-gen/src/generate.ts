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
  DOMAIN_TAG,
  HUB_OPERATOR,
  ORG_MNEMONIC,
  ORG_ROOT,
  PERSONA_MNEMONIC,
  PROTOCOL_VERSION,
  canonicalCommitmentPreimage,
  commitmentHash,
  commitmentHashPreimage,
  edgeId,
  makeAssertion,
  makeEdge,
  type Commitment,
} from './protocol.js';
import {
  OOB_URL_PREFIX,
  decodeOob,
  encodeOob,
  makeInboxRecord,
  oobUrl,
  payloadFromOobUrl,
  sameObject,
  verifyInboxRecord,
  type InboxRecord,
  type KnownKey,
} from './addressing.js';
import {
  digestHex,
  derivePersona,
  mnemonicToSeed,
  signObject,
  toHex,
  verifyObject,
  PURPOSE_CONSTANT,
} from './crypto.js';
import { buildEnvelopeId, buildEnvelopeBounds } from './envelope.js';
import { buildRecovery } from './recovery.js';
import { CANONICALIZATION_CASES } from './cases-canonicalization.js';
import {
  INVALID_CASES,
  VALID_CASES,
  baseCommitment,
  type TransitionCase,
} from './cases-transitions.js';
import { verifyChain } from './transitions.js';
import { ACT_CASES, ACTIONS_CASES, BRIEF_SLOT_CASES, LEVEL_CASES } from './cases-node-surface.js';
import {
  ACT_TOOL,
  ACT_VOCABULARY,
  LEVEL_ORDER,
  LEVEL_RANK,
  actionsFor,
  evaluateAct,
  grade,
  roleOf,
} from './node-surface.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const VECTORS_ROOT = join(HERE, '..', '..', '..', 'vectors');

const SUITE_VERSION = '0.2.0-pre';

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

/**
 * §2 envelope families. The bodies live in ./envelope.ts; these wrappers exist only to attach the
 * same banner every other family carries.
 */
export function buildEnvelopeIdFamily() {
  return {
    ...banner('spec/02-signal-envelope.md §2, spec/00-overview.md (domain separation)'),
    ...buildEnvelopeId(),
  };
}

export function buildEnvelopeBoundsFamily() {
  return {
    ...banner('spec/02-signal-envelope.md §2 (bounds), spec/08-conformance.md M-19'),
    ...buildEnvelopeBounds(),
  };
}

/** §6.6 recovery. Body in ./recovery.ts; this wrapper only attaches the banner. */
export function buildRecoveryFamily() {
  return {
    ...banner('spec/06-reconciliation-federation.md §6.6 (proof of possession)'),
    ...buildRecovery(),
  };
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
      hash_preimage_hex:
        toHex(new TextEncoder().encode(DOMAIN_TAG.commitment_hash)) +
        '00' +
        toHex(new TextEncoder().encode(canonicalCommitmentPreimage(c))),
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
    ...banner('spec/03-commitment.md §3.2, spec/00-overview.md (domain separation)'),
    description:
      'commitment_hash = sha256("servanda/0.1:commitment_hash" || 0x00 || ' +
      'JCS({intent, owner, owed_to, due, created_at})). Cases with same_hash_as_base=true prove ' +
      'that no other field of the commitment object reaches the hash. `hash_preimage_hex` is the ' +
      'complete preimage as octets, tag and separator included, so the domain tag is checkable ' +
      'without reconstructing it.',
    hashed_fields: ['intent', 'owner', 'owed_to', 'due', 'created_at'],
    domain_tag: {
      tag: DOMAIN_TAG.commitment_hash,
      separator: '0x00',
      note:
        '§0: identifier preimages are domain-separated by a fixed ASCII tag followed by one 0x00 ' +
        'octet. The tag contains no 0x00, so it is self-delimiting. Signing preimages are NOT tagged.',
    },
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

/** Labels every addressing vector shares, so a rejection reason can name the actual signer. */
const ADDRESSING_KNOWN_KEYS: KnownKey[] = [
  { label: 'alice', personaId: ALICE.personaId },
  { label: 'bob', personaId: BOB.personaId },
  { label: 'hub-operator', personaId: HUB_OPERATOR.personaId },
];

export function buildAddressingInbox() {
  const record = (
    name: string,
    description: string,
    opts: {
      persona: string;
      hubs: string[];
      /** Defaults to the SIGNER's key — which is what makes the hub-signed case an attack. */
      dh_key?: string;
      issued_at: string;
      signer: typeof ALICE;
      signerLabel: string;
      corruptSignature?: boolean;
    },
  ) => {
    const rec: InboxRecord = makeInboxRecord({
      v: PROTOCOL_VERSION,
      ...opts,
      dh_key: opts.dh_key ?? toHex(opts.signer.dhPublicKey),
    });
    const outcome = verifyInboxRecord(rec, ADDRESSING_KNOWN_KEYS);
    const { sig: _sig, ...unsigned } = rec;
    return {
      name,
      description,
      signed_by: { label: opts.signerLabel, persona_id: opts.signer.personaId },
      record: rec as unknown as Json,
      canonical: canonicalize(unsigned as unknown as Json),
      expected: {
        accepted: outcome.accepted,
        rejection_reason: outcome.accepted ? null : (outcome.reason ?? null),
        actual_signer: outcome.signerLabel ?? null,
      },
    };
  };

  const cases = [
    record(
      'valid-self-signed',
      'The base case: a persona declares one hub and signs the record with its own key. ' +
        'The signature verifies against `persona` itself (§1.2: persona_id IS the public key), ' +
        'so no registry and no hub cooperation is needed to accept it.',
      {
        persona: ALICE.personaId,
        hubs: ['https://hub.example/servanda'],
        issued_at: '2026-07-25T09:00:00Z',
        signer: ALICE,
        signerLabel: 'alice',
      },
    ),
    record(
      'valid-self-signed-multi-hub',
      'Two declared hubs. §6.7 (as resolved) makes the declared order the priority order: a ' +
        'sender MUST attempt hubs[0] first and walk the list in order, and MUST NOT reorder it ' +
        'by its own latency or success measurements. The order is the persona\'s own statement ' +
        'about where it wants its mail.',
      {
        persona: BOB.personaId,
        hubs: ['https://hub.example/servanda', 'https://backup.hub.example/servanda'],
        issued_at: '2026-07-25T09:05:00Z',
        signer: BOB,
        signerLabel: 'bob',
      },
    ),
    record(
      'invalid-signed-by-hub',
      'THE negative case for M-17, and it now carries a second attack in the same object. The ' +
        'record names Alice but is signed by a hub key: it rewrites her hub list to a hub she ' +
        'never chose, AND advertises a `dh_key` the hub holds the private half of. §6.7: "Only ' +
        'the persona key may change its own hubs (a hub cannot \'move\' its users)." A verifier ' +
        'that accepts this lets any hub redirect another hub\'s users — and, since §6.3 seals to ' +
        'the key in this record, read everything addressed to them. MUST be rejected.',
      {
        persona: ALICE.personaId,
        hubs: ['https://hub.attacker.example/servanda'],
        issued_at: '2026-07-25T09:10:00Z',
        signer: HUB_OPERATOR,
        signerLabel: 'hub-operator',
      },
    ),
    record(
      'invalid-corrupted-signature',
      'Control: a record self-signed by the persona whose signature has one flipped nibble. ' +
        'Rejected for a different reason than the hub-signed case, which is how an implementer ' +
        'can tell the two failures apart.',
      {
        persona: ALICE.personaId,
        hubs: ['https://hub.example/servanda'],
        issued_at: '2026-07-25T09:15:00Z',
        signer: ALICE,
        signerLabel: 'alice',
        corruptSignature: true,
      },
    ),
  ];

  const hubSigned = cases.find((c) => c.name === 'invalid-signed-by-hub')!;
  if (hubSigned.expected.accepted || hubSigned.expected.rejection_reason !== 'signer-is-not-the-persona') {
    throw new Error('inbox vectors: the hub-signed record must be rejected as signer-is-not-the-persona');
  }

  return {
    ...banner('spec/06-reconciliation-federation.md §6.7, conformance M-17'),
    description:
      'Inbox records `{ v, type:"inbox", persona, hubs, dh_key, issued_at, sig }`. Verification ' +
      'rule: the signature MUST verify against the key named in `persona`. `dh_key` is what §6.3 ' +
      'seals to, which is why this record is guarded: a forged one does not merely misroute a ' +
      'persona\'s mail, it hands the forger the key to read it. `known_keys` exists only so ' +
      'a verifier can report WHICH other key signed a rejected record; a verifier without it ' +
      'still rejects, as `invalid-signature`.',
    verification_rule:
      'ed25519_verify(sig, sha256(JCS(record minus "sig")), public_key = hex_decode(record.persona))',
    known_keys: ADDRESSING_KNOWN_KEYS.map((k) => ({ label: k.label, persona_id: k.personaId })),
    hub_queue_ttl: {
      recommended_minimum: 'P30D',
      recommended_minimum_seconds: 2592000,
      note:
        '§6.7: hubs queue undelivered ciphertext with a TTL, RECOMMENDED >= 30 days. This is a ' +
        'FIXTURE CONSTANT ONLY — the suite deliberately contains no time-travel test for it. ' +
        'Generation is clockless, and more importantly TTL expiry is not a correctness boundary: ' +
        '§6.7 makes queued-message loss harmless because reconciliation (§6.4), not delivery, is ' +
        'the guarantee. The value is pinned here so implementations agree on the boundary, not so ' +
        'they can be tested against a clock.',
    },
    cases,
  };
}

export function buildAddressingOob() {
  const commitment_hash = commitmentHash(baseCommitment);
  const proposed_at = '2026-07-25T09:00:00Z';

  const edge = makeEdge({
    commitment_hash,
    owner: ALICE.personaId,
    owed_to: BOB.personaId,
    proposed_at,
    due: '2026-08-01T17:00:00Z',
  });
  const assertion = makeAssertion({
    edge_id: edge.edge_id,
    state: 'proposed',
    asserted_at: proposed_at,
    signer: ALICE,
  });

  // §6.2: every wire message is { v, type, payload, sender, recipient, sent_at, sig }.
  // `recipient` is inside the signed preimage: without it a signature says who wrote the message
  // and nothing about whom they wrote it to, so any recipient could re-seal it to a third party.
  const unsigned = {
    v: PROTOCOL_VERSION,
    type: 'propose',
    payload: { edge, assertion },
    sender: ALICE.personaId,
    recipient: BOB.personaId,
    sent_at: proposed_at,
  } as unknown as Record<string, Json>;
  const message = { ...unsigned, sig: signObject(unsigned, ALICE.privateKey) } as unknown as Json;

  const encoded = encodeOob(message);
  const url = oobUrl(encoded);

  // Round-trip, computed rather than asserted: decode what was encoded and compare.
  const extracted = payloadFromOobUrl(url);
  if (extracted !== encoded) throw new Error('oob: URL fragment does not round-trip');
  const decoded = decodeOob(extracted);
  if (!sameObject(decoded, message)) throw new Error('oob: decoded message differs from the original');
  if (!sameObject((decoded as any).payload.edge, edge as unknown as Json)) {
    throw new Error('oob: decoded edge differs from the original edge object');
  }
  if (!verifyObject(decoded as Record<string, Json>, (decoded as any).sig, ALICE.publicKey)) {
    throw new Error('oob: signature does not verify after the round trip');
  }

  // Negative control: one mutated payload character must survive decoding but fail verification.
  const tamperedEdge = {
    ...edge,
    owed_to: CAROL.personaId,
  };
  const tamperedMessage = {
    ...(message as any),
    payload: { edge: tamperedEdge, assertion },
  } as unknown as Json;
  const tamperedEncoded = encodeOob(tamperedMessage);
  if (verifyObject(tamperedMessage as Record<string, Json>, (message as any).sig, ALICE.publicKey)) {
    throw new Error('oob: tampered payload still verifies — the negative control is broken');
  }

  return {
    ...banner('spec/06-reconciliation-federation.md §6.7 (out-of-band bootstrap), §6.2'),
    description:
      'First contact with a counterparty who has no node and no inbox: a `propose` message ' +
      'travels as a self-contained signed payload in a URL or QR code. The recipient (or a ' +
      'courtesy renderer, which MUST NOT hold keys — M-18) verifies the signature offline, from ' +
      'the payload alone. Round-trip: decode(encode(m)) == m, and the signature still verifies.',
    encoding: {
      scheme: 'base64url(JCS(message)) — RFC 4648 §5, unpadded, over the UTF-8 canonical bytes',
      url_form: `${OOB_URL_PREFIX}<payload>`,
      note:
        'INTERPRETATION — §6.7 fixes no serialization for the URL/QR form. The payload is carried ' +
        'in the URL FRAGMENT so it is never sent to the renderer\'s server. Not normative; tracked ' +
        'as a repository issue.',
    },
    cases: [
      {
        name: 'propose-roundtrip',
        description:
          'Encode the signed propose, carry it in a URL fragment, decode it, and verify. ' +
          '`decoded_equals_original` and `edge_equals_original` are the round-trip assertions; ' +
          '`signature_verifies` is what makes the payload self-contained — no hub, no network, ' +
          'no prior contact is needed to establish that Alice signed this proposal.',
        sender: { label: 'alice', persona_id: ALICE.personaId },
        message: message as Json,
        canonical: canonicalize(message),
        payload_b64url: encoded,
        url,
        decoded_equals_original: true,
        edge_equals_original: true,
        signature_verifies: true,
      },
      {
        name: 'tampered-payload-does-not-verify',
        description:
          'The same payload with `owed_to` swapped to a third persona and the original signature ' +
          'kept. It decodes cleanly — base64url and JSON say nothing about authenticity — and ' +
          'MUST fail signature verification. A courtesy renderer that skips this check is a ' +
          'phishing surface, not a renderer.',
        sender: { label: 'alice', persona_id: ALICE.personaId },
        message: tamperedMessage,
        canonical: canonicalize(tamperedMessage),
        payload_b64url: tamperedEncoded,
        url: oobUrl(tamperedEncoded),
        decoded_equals_original: false,
        edge_equals_original: false,
        signature_verifies: false,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// §7 node surface — M-20 (advertised acts, the `act` tool) and M-12 (the ladder)
// ---------------------------------------------------------------------------

/** The act → tool binding, emitted once per file so a consumer never has to infer it. */
function actTable() {
  return ACT_VOCABULARY.map((act) => ({ act, tool: ACT_TOOL[act] }));
}

export function buildNodeSurfaceActions() {
  const cases = ACTIONS_CASES.map((c) => {
    const chain = verifyChain(c.edge, c.assertions);
    const actions = actionsFor(c.edge, chain.finalState, c.viewer.persona_id, c.window_elapsed);

    // A case whose chain does not fully apply would silently test the wrong state.
    if (chain.rejectedCount !== 0) {
      throw new Error(`actions case "${c.name}": its assertion chain is not fully accepted`);
    }
    // M-20, asserted inside the builder: an advertised act must be one the table authorizes.
    for (const a of actions) {
      if (!ACT_VOCABULARY.includes(a.act)) {
        throw new Error(`actions case "${c.name}": "${a.act}" is not in the §7 vocabulary`);
      }
      if (a.tool !== ACT_TOOL[a.act]) {
        throw new Error(`actions case "${c.name}": "${a.act}" advertised with the wrong tool`);
      }
      if (a.tool === null && Object.keys(a.args).length !== 0) {
        throw new Error(`actions case "${c.name}": "${a.act}" is unbound but carries args`);
      }
    }

    return {
      name: c.name,
      description: c.description,
      edge: c.edge as unknown as Json,
      assertions: c.assertions as unknown as Json,
      viewer: { ...c.viewer, role: roleOf(c.edge, c.viewer.persona_id) },
      effective_state: chain.finalState,
      window_elapsed: c.window_elapsed,
      expected_actions: actions as unknown as Json,
      /** Every act NOT advertised here, so the negative half is explicit rather than implied. */
      must_not_advertise: ACT_VOCABULARY.filter((a) => !actions.some((x) => x.act === a)),
    };
  });

  return {
    ...banner('spec/07-node-surface.md (open_loops, brief), conformance M-20'),
    description:
      'For a given edge, assertion chain and viewing persona, the exact `actions` array a node ' +
      'MUST return. `must_not_advertise` is the complement: advertising any of those acts for ' +
      'that item and that viewer is an M-20 violation. `window_elapsed` is an input, never a ' +
      'clock read — generation is clockless, and the flag is exactly what decides whether the ' +
      'owner may yet record tacit acceptance (§4.3).',
    act_vocabulary: ACT_VOCABULARY,
    act_tool_bindings: actTable(),
    cases,
  };
}

export function buildNodeSurfaceBriefSlots() {
  const cases = BRIEF_SLOT_CASES;

  // A family whose negatives are missing is a family that cannot catch the regression it exists
  // for — §7's `brief` shipped copy-bearing slots precisely while everything positive passed.
  if (!cases.some((c) => !c.expected.valid)) {
    throw new Error('brief-slot vectors: the negative half is missing');
  }
  if (!cases.some((c) => c.expected.rejection_reason === 'copy-bearing-member')) {
    throw new Error('brief-slot vectors: no case pins the copy-bearing member #20 reported');
  }

  return {
    ...banner('spec/07-node-surface.md (brief), conformance M-20 / M-21'),
    description:
      'One `brief` slot, and whether a node may emit it. M-21 says no user-facing copy crosses ' +
      'the node surface: a client authors the wording of every control it renders, so a slot ' +
      'carries an ACT and never a label. `headline` is the exception that proves it — a ' +
      "person's own recorded words are content, not copy, and travel verbatim. The invalid " +
      'cases are the substance: `open_loops` was already pinned while `brief` was not, so an ' +
      'implementation could ship node-supplied button text and pass the entire suite.',
    slot_members: ['headline', 'item_id', 'primary_action', 'persona'],
    act_vocabulary: ACT_VOCABULARY,
    act_tool_bindings: actTable(),
    cases: cases as unknown as Json,
  };
}

export function buildNodeSurfaceActTool() {
  const cases = ACT_CASES.map((c) => {
    const chain = verifyChain(c.edge, c.assertions);
    const outcome = evaluateAct(
      c.edge,
      chain.finalState,
      c.caller.persona_id,
      c.act,
      c.evidence_hash,
      c.window_elapsed,
      c.assertions,
    );
    return {
      name: c.name,
      description: c.description,
      edge: c.edge as unknown as Json,
      assertions: c.assertions as unknown as Json,
      effective_state: chain.finalState,
      call: {
        caller: { ...c.caller, role: roleOf(c.edge, c.caller.persona_id) },
        tool: 'act',
        input: { id: c.edge.edge_id, act: c.act, evidence_hash: c.evidence_hash },
      },
      window_elapsed: c.window_elapsed,
      expected: {
        accepted: outcome.accepted,
        rejection_reason: outcome.accepted ? null : (outcome.reason ?? null),
        asserts: outcome.asserts ?? null,
      },
    };
  });

  if (!cases.some((c) => !c.expected.accepted)) {
    throw new Error('act-tool vectors: the negative half is missing');
  }

  return {
    ...banner('spec/07-node-surface.md (act), spec/04-edge.md §4.3, conformance M-14 / M-20'),
    description:
      'One `act` call against one edge in a known state. `act` is the only §7 tool that signs ' +
      'an assertion, so every call here is verified against the §4.3 transition table BEFORE ' +
      'anything is recorded — a rejected call leaves no trace in the chain. The rejections are ' +
      'the substance: a `release` accepted from the owner hands the protocol\'s one unilateral ' +
      'act to the wrong party.',
    act_tool_bindings: actTable(),
    cases,
  };
}

export function buildNodeSurfaceLevels() {
  const cases = LEVEL_CASES.map((c) => {
    const graded = grade(c.evidence);
    return {
      name: c.name,
      description: c.description,
      evidence: c.evidence as unknown as Json,
      expected: {
        level: graded.level,
        display_name: graded.display_name,
        name_bearing: graded.display_name !== null,
        /** v0.2 (#39): what a client renders, and whether it is a claim about anyone. */
        counterparty: graded.counterparty,
      },
    };
  });

  // The ordering is the thing being pinned; assert it rather than trusting the map.
  LEVEL_ORDER.forEach((l, i) => {
    if (i > 0 && LEVEL_RANK[LEVEL_ORDER[i - 1]] >= LEVEL_RANK[l]) {
      throw new Error(`level order broken at ${LEVEL_ORDER[i - 1]} < ${l}`);
    }
  });
  for (const c of cases) {
    // #39's whole point: `attested` appears only where the level carries a name, and a
    // `self-labelled` one is never suppressed. Without this the field would be emitted and
    // nothing would depend on its value.
    if (c.expected.counterparty?.origin === 'attested' && !c.expected.name_bearing) {
      throw new Error(`levels case "${c.name}": attested counterparty at a non-name-bearing level`);
    }
    if (c.expected.name_bearing && c.expected.counterparty?.origin !== 'attested') {
      throw new Error(`levels case "${c.name}": name-bearing level did not yield an attested name`);
    }
    if (c.expected.name_bearing && c.expected.level !== '2' && c.expected.level !== '3') {
      throw new Error(`level case "${c.name}": a name escaped below level 2 — M-12 violation`);
    }
  }

  return {
    ...banner('spec/01-identity.md §1.6, conformance M-12'),
    description:
      'The verification ladder as a total order, and the rule that a display name travels only ' +
      'at the levels an org attestation establishes. Each case gives an evidence set and the ' +
      'level plus display_name a node MUST report. The negative cases are where a name is ' +
      'available in the surrounding data and MUST NOT be emitted, because the achieved level ' +
      'does not carry it.',
    level_order: LEVEL_ORDER,
    level_rank: LEVEL_RANK as unknown as Json,
    ordering_note:
      '§1.6: 0 < 1 < ext < 2 < 3. `ext` outranks continuity and is outranked by an attestation ' +
      '— a binding proof is the persona\'s own signature on a channel it controls, which is ' +
      'self-assertion, whereas an attestation is a third party staking its own key.',
    name_bearing_levels: ['2', '3'],
    cases,
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
    { path: 'envelope/envelope-id.json', content: serialize(buildEnvelopeIdFamily()) },
    { path: 'envelope/bounds.json', content: serialize(buildEnvelopeBoundsFamily()) },
    { path: 'signatures/signatures.json', content: serialize(buildSignatures()) },
    { path: 'derivation/persona-keys.json', content: serialize(buildDerivation()) },
    { path: 'transitions/valid.json', content: serialize(buildTransitionsValid()) },
    { path: 'transitions/invalid.json', content: serialize(buildTransitionsInvalid()) },
    { path: 'addressing/inbox-records.json', content: serialize(buildAddressingInbox()) },
    { path: 'addressing/oob-bootstrap.json', content: serialize(buildAddressingOob()) },
    { path: 'recovery/proof-of-possession.json', content: serialize(buildRecoveryFamily()) },
    { path: 'node-surface/actions.json', content: serialize(buildNodeSurfaceActions()) },
    { path: 'node-surface/brief-slots.json', content: serialize(buildNodeSurfaceBriefSlots()) },
    { path: 'node-surface/act-tool.json', content: serialize(buildNodeSurfaceActTool()) },
    {
      path: 'node-surface/verification-levels.json',
      content: serialize(buildNodeSurfaceLevels()),
    },
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
