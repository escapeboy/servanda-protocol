/**
 * §7 node-surface cases (M-20 action advertisement, the `act` tool, M-12 level ordering).
 *
 * Every case is expressed the way the transitions family already expresses vault state — an
 * edge plus an assertion chain — so the effective state a case claims is derived by the same
 * reference verifier rather than asserted twice. The negative cases are the point: a node
 * that advertises `release` to the owner, or `done` before the acceptance window has run,
 * passes every positive test and still tells a person they may do something the transition
 * table will discard.
 */

import { ALICE, BOB, CAROL, evidenceHash, makeAssertion, type Assertion, type Edge } from './protocol.js';
import {
  EDGE_ACCEPTANCE,
  EDGE_EVIDENCE,
  T_ACCEPT,
  T_AFTER_WINDOW,
  T_EVIDENCE,
  confirmed,
  proposed,
} from './cases-transitions.js';
import type { Act, Evidence } from './node-surface.js';

const EV = evidenceHash('pr#341 merged; 11 tests');

const ownerEvidenceClose = (edge: Edge): Assertion =>
  makeAssertion({
    edge_id: edge.edge_id,
    state: 'closed',
    asserted_at: T_EVIDENCE,
    signer: ALICE,
    evidence_hash: EV,
  });

const disputedBy = (edge: Edge): Assertion =>
  makeAssertion({
    edge_id: edge.edge_id,
    state: 'disputed',
    asserted_at: T_ACCEPT,
    signer: BOB,
    evidence_hash: evidenceHash('not what we agreed'),
  });

const releasedBy = (edge: Edge): Assertion =>
  makeAssertion({
    edge_id: edge.edge_id,
    state: 'released',
    asserted_at: T_ACCEPT,
    signer: BOB,
  });

export interface ActionsCase {
  name: string;
  description: string;
  edge: Edge;
  assertions: Assertion[];
  /** The persona calling `open_loops`. */
  viewer: { label: string; persona_id: string };
  /** Supplied, never clocked: whether `acceptance_window` has run out (§4.3). */
  window_elapsed: boolean;
}

const P_ALICE = { label: 'alice (owner)', persona_id: ALICE.personaId };
const P_BOB = { label: 'bob (owed_to)', persona_id: BOB.personaId };
const P_CAROL = { label: 'carol (non-party)', persona_id: CAROL.personaId };

export const ACTIONS_CASES: ActionsCase[] = [
  {
    name: 'proposed-owner',
    description:
      'The owner has proposed and is waiting. §4.3 gives the owner no transition out of ' +
      '`proposed`, so the only affordance is `ping` — which is not a transition either, and ' +
      'carries `tool: null`.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: false,
  },
  {
    name: 'proposed-owed-to',
    description:
      'The counterparty decides. `confirm` and `dismiss` both bind to the `confirm` tool; ' +
      '`dismiss` is vault-local and produces no assertion (§6.5), which is why it is not ' +
      'called `release`.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE)],
    viewer: P_BOB,
    window_elapsed: false,
  },
  {
    name: 'proposed-non-party',
    description:
      'M-3 negative case: a persona who is not a party to the edge is offered nothing. Not a ' +
      'filtered list — an empty one.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE)],
    viewer: P_CAROL,
    window_elapsed: false,
  },
  {
    name: 'open-owner',
    description:
      'THE negative case for M-20 on the owner side: `release` is `owed_to` alone (§4.3) and ' +
      'MUST NOT appear here. A node that advertises it to the owner is offering an assertion ' +
      'the table discards.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: false,
  },
  {
    name: 'open-owed-to',
    description:
      'The mirror: `done` is the owner\'s act and MUST NOT be advertised to the counterparty. ' +
      '`release` appears here and only here — it is the protocol\'s one unilateral act.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE)],
    viewer: P_BOB,
    window_elapsed: false,
  },
  {
    name: 'pending-acceptance-owner-window-not-elapsed',
    description:
      'THE time-sensitive negative case. The owner has filed evidence and the window is still ' +
      'running, so a `closed` assertion by the owner would be discarded as ' +
      '`acceptance-window-not-elapsed`. `done` MUST NOT be advertised: M-20 is about the ' +
      'item\'s current state, and "the owner may close" is false right now.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE), ownerEvidenceClose(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: false,
  },
  {
    name: 'pending-acceptance-owner-window-elapsed',
    description:
      'The same edge and the same chain, the window having run. `done` becomes advertisable — ' +
      'the only difference between this case and the previous one is time, which is why the ' +
      'flag is an input rather than a clock read.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE), ownerEvidenceClose(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: true,
  },
  {
    name: 'pending-acceptance-owed-to',
    description:
      'The counterparty inside the window: it may still accept explicitly, dispute, or forgive. ' +
      '`release` remains theirs throughout the open family.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE), ownerEvidenceClose(EDGE_ACCEPTANCE)],
    viewer: P_BOB,
    window_elapsed: false,
  },
  {
    name: 'disputed-either-party',
    description:
      '§4.4 as resolved: v0 defines no arbitration. `disputed` exits only by both parties ' +
      'asserting `closed` or by supersession, and neither is a single-call act — so the only ' +
      'thing advertised is `supersede`, unbound.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE), disputedBy(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: false,
  },
  {
    name: 'terminal-released',
    description:
      'Terminal states carry no affordances at all. A node that keeps advertising `done` on a ' +
      'released edge is inviting an assertion that `terminal-state-reached` will discard.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE), releasedBy(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: true,
  },
  {
    name: 'on-evidence-open-owner',
    description:
      'An `on-evidence` edge: the owner closes directly, so `done` is advertisable with no ' +
      'window at all. Same array as the `on-acceptance` open case — closure policy changes ' +
      'when the act lands, not who may perform it.',
    edge: EDGE_EVIDENCE,
    assertions: [proposed(EDGE_EVIDENCE), confirmed(EDGE_EVIDENCE)],
    viewer: P_ALICE,
    window_elapsed: false,
  },
];

export interface ActCase {
  name: string;
  description: string;
  edge: Edge;
  assertions: Assertion[];
  caller: { label: string; persona_id: string };
  act: Act;
  evidence_hash: string | null;
  window_elapsed: boolean;
}

const openChain = (edge: Edge) => [proposed(edge), confirmed(edge)];
const pendingChain = (edge: Edge) => [proposed(edge), confirmed(edge), ownerEvidenceClose(edge)];

export const ACT_CASES: ActCase[] = [
  {
    name: 'done-by-owner-on-evidence',
    description: 'The base positive: owner, open edge, evidence present. Signs `closed`.',
    edge: EDGE_EVIDENCE,
    assertions: openChain(EDGE_EVIDENCE),
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: false,
  },
  {
    name: 'release-by-owed-to',
    description:
      'The act that had no tool before v0.1-pre. `owed_to` alone, no evidence, unconditional ' +
      '(§4.3). Signs `released`.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_BOB,
    act: 'release',
    evidence_hash: null,
    window_elapsed: false,
  },
  {
    name: 'release-by-owner-rejected',
    description:
      'THE negative case: the owner cannot forgive their own debt. If this is accepted, the ' +
      'single unilateral act in the protocol has been handed to the wrong party.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_ALICE,
    act: 'release',
    evidence_hash: null,
    window_elapsed: false,
  },
  {
    name: 'done-by-owed-to-rejected',
    description: 'The mirror: the counterparty cannot declare the owner\'s promise fulfilled.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_BOB,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: false,
  },
  {
    name: 'done-without-evidence-rejected',
    description: '§4.3/§4.4: an owner closure carries the evidence bundle\'s hash or it is not a closure.',
    edge: EDGE_EVIDENCE,
    assertions: openChain(EDGE_EVIDENCE),
    caller: P_ALICE,
    act: 'done',
    evidence_hash: null,
    window_elapsed: false,
  },
  {
    name: 'release-with-evidence-rejected',
    description:
      'Forgiveness is not evidenced. A `release` carrying an evidence_hash is claiming ' +
      'something the state does not mean, and is refused rather than silently stripped.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_BOB,
    act: 'release',
    evidence_hash: EV,
    window_elapsed: false,
  },
  {
    name: 'done-in-pending-before-window-rejected',
    description:
      'Tacit acceptance before the acceptance window has run. This is the forgery §4.4 exists ' +
      'to prevent: the owner would be converting the counterparty\'s silence into consent early.',
    edge: EDGE_ACCEPTANCE,
    assertions: pendingChain(EDGE_ACCEPTANCE),
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: false,
  },
  {
    name: 'done-in-pending-after-window',
    description: 'The same call once the window has elapsed: accepted, signing `closed`.',
    edge: EDGE_ACCEPTANCE,
    assertions: pendingChain(EDGE_ACCEPTANCE),
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: true,
  },
  {
    name: 'act-by-non-party-rejected',
    description: 'M-3: a persona who is not a party to the edge cannot act on it.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_CAROL,
    act: 'release',
    evidence_hash: null,
    window_elapsed: false,
  },
  {
    name: 'act-on-proposed-edge-rejected',
    description:
      'A proposed edge is socially nothing (§6.5) — there is no promise to close or forgive ' +
      'until the counterparty has confirmed.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE)],
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: false,
  },
  {
    name: 'act-on-terminal-edge-rejected',
    description: 'A released edge is terminal; nothing further may be asserted against it.',
    edge: EDGE_ACCEPTANCE,
    assertions: [...openChain(EDGE_ACCEPTANCE), releasedBy(EDGE_ACCEPTANCE)],
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: true,
  },
  {
    name: 'supersede-is-not-an-act-tool-call',
    description:
      'THE binding negative case for M-20. `supersede` is advertised with `tool: null` because ' +
      'a supersession needs signatures across two edges (§4.5), which no single call completes. ' +
      'A client that routes it to `act` anyway MUST be refused rather than served something ' +
      'that looks like it worked.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_ALICE,
    act: 'supersede',
    evidence_hash: null,
    window_elapsed: false,
  },
  {
    name: 'ping-is-not-an-act-tool-call',
    description:
      '`ping` is not a transition at all — it appears in no row of §4.3, produces no assertion, ' +
      'and changes no state. Routing it to `act` MUST be refused.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_BOB,
    act: 'ping',
    evidence_hash: null,
    window_elapsed: false,
  },
  {
    name: 'dismiss-is-not-an-act-tool-call',
    description:
      '`dismiss` binds to `confirm`, not to `act`: it is a vault-local hide that produces no ' +
      'assertion. Accepting it here is exactly the confusion that makes a person believe they ' +
      'released a debt when nothing reached the counterparty.',
    edge: EDGE_ACCEPTANCE,
    assertions: openChain(EDGE_ACCEPTANCE),
    caller: P_BOB,
    act: 'dismiss',
    evidence_hash: null,
    window_elapsed: false,
  },
];

export interface LevelCase {
  name: string;
  description: string;
  evidence: Evidence;
}

const ev = (patch: Partial<Evidence>): Evidence => ({
  priorConfirmedEdge: false,
  bindingProof: false,
  attestation: false,
  domainAnchored: false,
  attestedDisplayName: null,
  ...patch,
});

export const LEVEL_CASES: LevelCase[] = [
  {
    name: 'level-0-no-evidence',
    description: 'No evidence of any kind. Level 0, and no name may be shown.',
    evidence: ev({}),
  },
  {
    name: 'level-1-continuity',
    description: '≥1 prior confirmed edge with this key. Continuity is not a name.',
    evidence: ev({ priorConfirmedEdge: true }),
  },
  {
    name: 'level-ext-binding-proof-only',
    description:
      'A binding proof and nothing else. `ext` outranks `1`, and carries no display name: it ' +
      'binds a key to a CHANNEL, never to a human.',
    evidence: ev({ bindingProof: true }),
  },
  {
    name: 'level-ext-outranks-continuity',
    description:
      'Continuity AND a binding proof. The achieved level is the highest-ranked of them, so ' +
      '`ext`, not `1`.',
    evidence: ev({ priorConfirmedEdge: true, bindingProof: true }),
  },
  {
    name: 'level-2-attested',
    description:
      'A valid unrevoked org attestation. This is the first level at which a display name may ' +
      'be rendered at all, and it comes from the attestation.',
    evidence: ev({ attestation: true, attestedDisplayName: 'Maria Ivanova' }),
  },
  {
    name: 'level-2-outranks-ext',
    description:
      'THE case the ordering decides: both a binding proof and an attestation are present. ' +
      '`2` wins, because self-assertion must not outrank a third party staking its own key. ' +
      'A verifier that ranks `ext` above `2` reports level `ext` here and suppresses a name it ' +
      'was entitled to show.',
    evidence: ev({ bindingProof: true, attestation: true, attestedDisplayName: 'Maria Ivanova' }),
  },
  {
    name: 'level-3-domain-verified',
    description: 'Attestation plus a domain-anchored org root. The top of the ladder.',
    evidence: ev({
      attestation: true,
      domainAnchored: true,
      attestedDisplayName: 'Maria Ivanova',
    }),
  },
  {
    name: 'negative-name-not-shown-at-ext',
    description:
      'THE M-12 negative case. A name is present in the surrounding data — from a petname, a ' +
      'previous org, an address book — and the achieved level is `ext`. The name MUST NOT ' +
      'travel: a lower-level party does not receive a higher level\'s affordance, and a display ' +
      'name is level 2\'s affordance. Expected `display_name` is null.',
    evidence: ev({ bindingProof: true, attestedDisplayName: 'Maria Ivanova' }),
  },
  {
    name: 'negative-name-not-shown-at-continuity',
    description:
      'The same negative one rung lower: months of confirmed edges with a key establish ' +
      'continuity, not identity. Expected `display_name` is null.',
    evidence: ev({ priorConfirmedEdge: true, attestedDisplayName: 'Maria Ivanova' }),
  },
  {
    name: 'negative-domain-anchor-without-attestation',
    description:
      'A domain-anchored org root but no attestation naming this persona. Level 3 requires ' +
      'level 2 first (§1.6), so the achieved level is `0` and no name is shown. A verifier ' +
      'that reads the anchor alone as level 3 promotes a stranger to the top of the ladder.',
    evidence: ev({ domainAnchored: true, attestedDisplayName: 'Maria Ivanova' }),
  },
];
