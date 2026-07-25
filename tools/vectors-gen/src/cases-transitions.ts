/**
 * Transition-table cases (spec/04-edge.md §4.3–§4.5, conformance M-14).
 *
 * Every expected rejection reason is declared BY HAND here. The generator runs the
 * reference verifier and fails if the verifier disagrees — so these cases test the
 * verifier rather than merely recording whatever it happens to do.
 */

import {
  ALICE,
  BOB,
  CAROL,
  commitmentHash,
  evidenceHash,
  makeAssertion,
  makeEdge,
  type Assertion,
  type Commitment,
  type Edge,
} from './protocol.js';
import type { EffectiveState, RejectionReason } from './transitions.js';

export const T_PROPOSED = '2026-07-25T09:00:00Z';
export const T_CONFIRMED = '2026-07-25T10:00:00Z';
export const T_DUE = '2026-08-01T00:00:00Z';
export const T_BEFORE_DUE = '2026-07-30T00:00:00Z';
export const T_EVIDENCE = '2026-08-02T12:00:00Z';
export const T_ACCEPT = '2026-08-03T12:00:00Z';
/** T_EVIDENCE + P5D = 2026-08-07T12:00:00Z, so this is past the window. */
export const T_AFTER_WINDOW = '2026-08-08T12:00:00Z';

const baseCommitment: Commitment = {
  v: 'servanda/0.1',
  type: 'commitment',
  intent: 'Add integration tests for PaymentRetryService',
  owner: ALICE.personaId,
  owed_to: BOB.personaId,
  due: T_DUE,
  conditions: [],
  evidence_refs: [{ kind: 'envelope', value: 'session#4412' }],
  created_at: '2026-07-25T08:55:00Z',
  source: 'explicit',
  confidence: 1,
};

export const COMMITMENT_HASH = commitmentHash(baseCommitment);
export { baseCommitment };

function edgeWith(
  policy: 'on-evidence' | 'on-acceptance',
  due: string | null = T_DUE,
): Edge {
  return makeEdge({
    commitment_hash: COMMITMENT_HASH,
    owner: ALICE.personaId,
    owed_to: BOB.personaId,
    proposed_at: T_PROPOSED,
    due,
    closure_policy: policy,
  });
}

export const EDGE_ACCEPTANCE = edgeWith('on-acceptance');
export const EDGE_EVIDENCE = edgeWith('on-evidence');
export const EDGE_NO_DUE = edgeWith('on-acceptance', null);

/**
 * NOTE: EDGE_ACCEPTANCE and EDGE_EVIDENCE deliberately share an edge_id — the §4.1 preimage
 * is sha256(commitment_hash || owner || owed_to || proposed_at) and does NOT cover
 * closure_policy, due, blocked_by or supersedes. That collision is a spec finding (tracked as
 * a repository issue), which is why the edge-id-mismatch case below needs a foreign edge
 * built from a different proposed_at rather than a different closure policy.
 */
export const FOREIGN_EDGE_ID = makeEdge({
  commitment_hash: COMMITMENT_HASH,
  owner: ALICE.personaId,
  owed_to: BOB.personaId,
  proposed_at: '2026-07-26T09:00:00Z',
}).edge_id;

const EV = evidenceHash('pr#341 merged; 11 tests');

/** Shorthands for the two opening assertions every non-trivial chain needs. */
const proposed = (edge: Edge): Assertion =>
  makeAssertion({
    edge_id: edge.edge_id,
    state: 'proposed',
    asserted_at: T_PROPOSED,
    signer: ALICE,
  });

const confirmed = (edge: Edge): Assertion =>
  makeAssertion({
    edge_id: edge.edge_id,
    state: 'confirmed',
    asserted_at: T_CONFIRMED,
    signer: BOB,
  });

export interface TransitionCase {
  name: string;
  description: string;
  edge: Edge;
  assertions: Assertion[];
  /** One entry per assertion: null = accepted, otherwise the required rejection reason. */
  expected: (RejectionReason | null)[];
  expectedFinalState: EffectiveState;
}

export const VALID_CASES: TransitionCase[] = [
  {
    name: 'on-acceptance-explicit-accept',
    description:
      'Full cross-person happy path: owner proposes, owed_to confirms, owner submits evidence ' +
      '(opening the acceptance window), owed_to explicitly accepts.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
        evidence_hash: EV,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_ACCEPT,
        signer: BOB,
      }),
    ],
    expected: [null, null, null, null],
    expectedFinalState: 'closed',
  },
  {
    name: 'on-acceptance-tacit-expiry',
    description:
      '§4.4: window expiry is tacit acceptance — the owner records the final closed assertion ' +
      'after P5D has elapsed.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
        evidence_hash: EV,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_AFTER_WINDOW,
        signer: ALICE,
      }),
    ],
    expected: [null, null, null, null],
    expectedFinalState: 'closed',
  },
  {
    name: 'on-evidence-owner-closes',
    description: '§4.4: under on-evidence the owner closes directly with a non-null evidence_hash.',
    edge: EDGE_EVIDENCE,
    assertions: [
      proposed(EDGE_EVIDENCE),
      confirmed(EDGE_EVIDENCE),
      makeAssertion({
        edge_id: EDGE_EVIDENCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
        evidence_hash: EV,
      }),
    ],
    expected: [null, null, null],
    expectedFinalState: 'closed',
  },
  {
    name: 'released-by-owed-to',
    description: '§4.3: unilateral forgiveness closes the edge on owed_to’s signature alone.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'released',
        asserted_at: T_EVIDENCE,
        signer: BOB,
      }),
    ],
    expected: [null, null, null],
    expectedFinalState: 'released',
  },
  {
    name: 'expired-after-due',
    description: '§4.3: either party may assert expiry once due has passed.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'expired',
        asserted_at: T_EVIDENCE,
        signer: BOB,
      }),
    ],
    expected: [null, null, null],
    expectedFinalState: 'expired',
  },
  {
    name: 'disputed-then-mutual-close',
    description:
      '§4.3: dispute carries evidence; v0 defines the exit as mutual closure — both parties assert.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
        evidence_hash: EV,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'disputed',
        asserted_at: T_ACCEPT,
        signer: BOB,
        evidence_hash: evidenceHash('invoice PDFs missing the VAT line'),
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_AFTER_WINDOW,
        signer: ALICE,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_AFTER_WINDOW,
        signer: BOB,
      }),
    ],
    expected: [null, null, null, null, null, null],
    expectedFinalState: 'closed',
  },
  {
    name: 'supersession-needs-both-parties',
    description:
      '§4.5: a single superseded assertion is valid but does NOT complete the transition; the edge ' +
      'stays open until the second party signs.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'superseded',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'superseded',
        asserted_at: T_ACCEPT,
        signer: BOB,
      }),
    ],
    expected: [null, null, null, null],
    expectedFinalState: 'superseded',
  },
];

export const INVALID_CASES: TransitionCase[] = [
  {
    name: 'proposed-by-owed-to',
    description:
      'M-1: you cannot propose someone else’s promise. Only the owner may sign `proposed`.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'proposed',
        asserted_at: T_PROPOSED,
        signer: BOB,
      }),
    ],
    expected: ['wrong-signer-for-transition'],
    expectedFinalState: 'none',
  },
  {
    name: 'owner-self-confirms',
    description:
      'M-2: the counterparty’s signature is what makes the edge exist. An owner confirming their ' +
      'own proposal is the single most damaging forgery the table has to stop.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'confirmed',
        asserted_at: T_CONFIRMED,
        signer: ALICE,
      }),
    ],
    expected: [null, 'wrong-signer-for-transition'],
    expectedFinalState: 'proposed',
  },
  {
    name: 'confirmed-by-third-party',
    description: 'M-3: edges are strictly two-party; a non-party signature is never valid.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'confirmed',
        asserted_at: T_CONFIRMED,
        signer: CAROL,
      }),
    ],
    expected: [null, 'signer-not-a-party'],
    expectedFinalState: 'proposed',
  },
  {
    name: 'closed-without-confirmation',
    description:
      'M-2: an unconfirmed proposal is not a promise and cannot be closed straight out of `proposed`.',
    edge: EDGE_EVIDENCE,
    assertions: [
      proposed(EDGE_EVIDENCE),
      makeAssertion({
        edge_id: EDGE_EVIDENCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
        evidence_hash: EV,
      }),
    ],
    expected: [null, 'illegal-source-state'],
    expectedFinalState: 'proposed',
  },
  {
    name: 'on-evidence-closed-by-owed-to',
    description: '§4.4: under on-evidence only the owner may close.',
    edge: EDGE_EVIDENCE,
    assertions: [
      proposed(EDGE_EVIDENCE),
      confirmed(EDGE_EVIDENCE),
      makeAssertion({
        edge_id: EDGE_EVIDENCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: BOB,
        evidence_hash: EV,
      }),
    ],
    expected: [null, null, 'wrong-signer-for-transition'],
    expectedFinalState: 'open',
  },
  {
    name: 'closed-without-evidence-hash',
    description:
      '§4.4: closure under on-evidence requires a non-null evidence_hash. "The system has an opinion ' +
      'only where it has evidence."',
    edge: EDGE_EVIDENCE,
    assertions: [
      proposed(EDGE_EVIDENCE),
      confirmed(EDGE_EVIDENCE),
      makeAssertion({
        edge_id: EDGE_EVIDENCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
      }),
    ],
    expected: [null, null, 'evidence-hash-required-for-owner-closure'],
    expectedFinalState: 'open',
  },
  {
    name: 'released-by-owner',
    description:
      '§4.3: release is forgiveness by the creditor. An owner releasing themselves would let anyone ' +
      'discharge their own debt.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'released',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
      }),
    ],
    expected: [null, null, 'wrong-signer-for-transition'],
    expectedFinalState: 'open',
  },
  {
    name: 'expired-with-null-due',
    description: '§4.3: expiry requires a non-null due. Undated commitments MUST NOT time-escalate.',
    edge: EDGE_NO_DUE,
    assertions: [
      proposed(EDGE_NO_DUE),
      confirmed(EDGE_NO_DUE),
      makeAssertion({
        edge_id: EDGE_NO_DUE.edge_id,
        state: 'expired',
        asserted_at: T_EVIDENCE,
        signer: BOB,
      }),
    ],
    expected: [null, null, 'due-is-null'],
    expectedFinalState: 'open',
  },
  {
    name: 'expired-before-due',
    description: '§4.3: expiry may only be asserted after due.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'expired',
        asserted_at: T_BEFORE_DUE,
        signer: BOB,
      }),
    ],
    expected: [null, null, 'expiry-before-due'],
    expectedFinalState: 'open',
  },
  {
    name: 'disputed-without-evidence',
    description: '§4.3: evidence_hash is REQUIRED on a dispute.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'disputed',
        asserted_at: T_EVIDENCE,
        signer: BOB,
      }),
    ],
    expected: [null, null, 'evidence-hash-required'],
    expectedFinalState: 'open',
  },
  {
    name: 'tacit-close-before-window-elapsed',
    description:
      '§4.4: the owner may only record tacit acceptance AFTER the acceptance window expires. Closing ' +
      'early would let the owner manufacture acceptance the counterparty never gave.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
        evidence_hash: EV,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_ACCEPT,
        signer: ALICE,
      }),
    ],
    expected: [null, null, null, 'acceptance-window-not-elapsed'],
    expectedFinalState: 'pending-acceptance',
  },
  {
    name: 'forged-signature',
    description: 'A well-formed but non-verifying signature MUST be discarded.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'confirmed',
        asserted_at: T_CONFIRMED,
        signer: BOB,
        corruptSignature: true,
      }),
    ],
    expected: [null, 'invalid-signature'],
    expectedFinalState: 'proposed',
  },
  {
    name: 'signature-attributed-to-other-party',
    description:
      'Assertion claims by=owed_to but is signed with the owner’s key. Verifying `sig` against `by` ' +
      'is what stops a party from fabricating the counterparty’s confirmation.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'confirmed',
        asserted_at: T_CONFIRMED,
        signer: ALICE,
        byOverride: BOB.personaId,
      }),
    ],
    expected: [null, 'invalid-signature'],
    expectedFinalState: 'proposed',
  },
  {
    name: 'explicit-open-assertion',
    description:
      'INTERPRETATION-dependent: §4.3 marks confirmed → open as "(implicit)" with no authorized ' +
      'signer, so an explicit `open` assertion has no row permitting it. See the tracked ambiguity issue.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'open',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
      }),
    ],
    expected: [null, null, 'implicit-transition-not-assertable'],
    expectedFinalState: 'open',
  },
  {
    name: 'replayed-confirmation',
    description: 'Re-submitting `confirmed` on an already-open edge has no legal source state.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
    ],
    expected: [null, null, 'illegal-source-state'],
    expectedFinalState: 'open',
  },
  {
    name: 'assertion-after-terminal-state',
    description: 'Once released, the edge is closed to further assertions.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'released',
        asserted_at: T_EVIDENCE,
        signer: BOB,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'closed',
        asserted_at: T_AFTER_WINDOW,
        signer: ALICE,
        evidence_hash: EV,
      }),
    ],
    expected: [null, null, null, 'terminal-state-reached'],
    expectedFinalState: 'released',
  },
  {
    name: 'edge-id-mismatch',
    description: 'An assertion naming a different edge MUST NOT be applied to this chain.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: FOREIGN_EDGE_ID,
        state: 'confirmed',
        asserted_at: T_CONFIRMED,
        signer: BOB,
      }),
    ],
    expected: [null, 'edge-id-mismatch'],
    expectedFinalState: 'proposed',
  },
  {
    name: 'superseded-by-third-party',
    description: '§4.5: supersession requires both parties of the OLD edge — not an outside key.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'superseded',
        asserted_at: T_EVIDENCE,
        signer: CAROL,
      }),
    ],
    expected: [null, null, 'signer-not-a-party'],
    expectedFinalState: 'open',
  },
  {
    name: 'supersession-double-signed-by-one-party',
    description:
      '§4.5: the owner signing `superseded` twice must not substitute for the counterparty’s signature.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      proposed(EDGE_ACCEPTANCE),
      confirmed(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'superseded',
        asserted_at: T_EVIDENCE,
        signer: ALICE,
      }),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'superseded',
        asserted_at: T_ACCEPT,
        signer: ALICE,
      }),
    ],
    expected: [null, null, null, 'duplicate-assertion-by-same-party'],
    expectedFinalState: 'open',
  },
];
