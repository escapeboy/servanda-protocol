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

/**
 * The §6.4 contest: both parties exit `open` alone, at the same instant, neither having seen the
 * other. `released` is dated AT the owner's evidence close, because only a CONCURRENT act
 * contests — one dated later could have been a response, and §4.3 already says what the answer to
 * an exit is.
 */
const concurrentRelease = (edge: Edge): Assertion =>
  makeAssertion({
    edge_id: edge.edge_id,
    state: 'released',
    asserted_at: T_EVIDENCE,
    signer: BOB,
  });

const CONTESTED = (edge: Edge): Assertion[] => [
  proposed(edge),
  confirmed(edge),
  ownerEvidenceClose(edge),
  concurrentRelease(edge),
];

export interface ActionsCase {
  name: string;
  description: string;
  edge: Edge;
  assertions: Assertion[];
  /** The persona calling `open_loops`. */
  viewer: { label: string; persona_id: string };
  /** Supplied, never clocked: whether `acceptance_window` has run out (§4.3). */
  window_elapsed: boolean;
  /** §4.4: whether `dispute_window` has run from the deadlock. A DIFFERENT window. */
  dispute_window_elapsed?: boolean;
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
    name: 'contested-closure-owner',
    description:
      '§4.4: `contested-closure` is NOT terminal, and a node that treats it as one advertises ' +
      'nothing to a person who has three exits. It is left the way `disputed` is left — both ' +
      'parties, or not at all — so `supersede` is the only thing shown, and it is unbound. ' +
      '**`done` is not advertised to the owner**, even though §4.3 gives them a `closed` row ' +
      'here: that row needs BOTH parties, and §7 binds `done` to the owner alone, so the ' +
      'counterparty has no advertised way to sign their half. An owner who signed would record ' +
      'a closure that can never complete — the person is told their promise is closed and the ' +
      'edge stays contested for ever. That is the failure M-20 exists to prevent, and it is the ' +
      'same argument §7 already settled for `disputed`. The exit that ends this edge is ' +
      '`expired`, which is time rather than an act.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    viewer: P_ALICE,
    window_elapsed: false,
  },
  {
    name: 'contested-closure-owed-to',
    description:
      'The same array from the other seat. Both parties reached this state by acting, both are ' +
      'blocked on the other, and neither is offered more than the other — an asymmetry here ' +
      'would say one of two legal acts was the wrong one.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    viewer: P_BOB,
    window_elapsed: false,
  },
  {
    name: 'contested-closure-owner-after-the-dispute-window',
    description:
      '§4.4 gives this state a THIRD exit — `expired`, by either party alone, once ' +
      '`dispute_window` has run — and §7 binds it to `act` as `expire`. Before the window it is ' +
      'not advertised (see `contested-closure-owner`); after it, it is, because a state two ' +
      'people can enter by accident and cannot leave alone is a worse trap than the divergence ' +
      'it replaces. It was reachable in the transition table and through no tool at all.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    viewer: P_ALICE,
    window_elapsed: false,
    dispute_window_elapsed: true,
  },
  {
    name: 'contested-closure-owed-to-after-the-dispute-window',
    description:
      'The same, from the other seat, and the asymmetry that would matter if it were absent: ' +
      '`done` is the owner’s and `release` is the party-owed’s, so an `expire` gated on role ' +
      'would leave one of the two people trapped — and which one depends on who contested ' +
      'first. §4.4 gates it on the window and on nothing else.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    viewer: P_BOB,
    window_elapsed: false,
    dispute_window_elapsed: true,
  },
  {
    name: 'disputed-after-the-dispute-window',
    description:
      '`disputed` leaves the same way and on the same terms. §4.4 says so, and states that an ' +
      'implementation which gives `disputed` the third exit and withholds it from ' +
      '`contested-closure` "has built the stronger weapon and handed it out for free" — so ' +
      'this pair is pinned together or neither is pinned at all.',
    edge: EDGE_ACCEPTANCE,
    assertions: [proposed(EDGE_ACCEPTANCE), confirmed(EDGE_ACCEPTANCE), disputedBy(EDGE_ACCEPTANCE)],
    viewer: P_ALICE,
    window_elapsed: false,
    dispute_window_elapsed: true,
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
  /** §4.4: whether `dispute_window` has run from the deadlock. A DIFFERENT window. */
  dispute_window_elapsed?: boolean;
}

const openChain = (edge: Edge) => [proposed(edge), confirmed(edge)];
const pendingChain = (edge: Edge) => [proposed(edge), confirmed(edge), ownerEvidenceClose(edge)];

export const ACT_CASES: ActCase[] = [
  {
    name: 'done-from-disputed-refused',
    description:
      '§7 (v0.2, #41): `disputed` is not in the open family, and `done` from here would sign the ' +
      'owner’s half of a transition whose other half no advertised act can ever reach — a ' +
      'closure honestly recorded and permanently incomplete. §4.4’s exits from `disputed` are ' +
      'the two it names.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      ...openChain(EDGE_ACCEPTANCE),
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
        evidence_hash: evidenceHash('not as agreed'),
      }),
    ],
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: true,
  },
  {
    name: 'done-from-contested-closure-refused',
    description:
      '§7: "a node MUST refuse a `done` call from `contested-closure` with `illegal-source-state` ' +
      'rather than recording a half-closure." The same argument as `done-from-disputed-refused` ' +
      'and a DIFFERENT state, which is why it needs its own case: §4.3 does give ' +
      '`contested-closure` a `closed` row and the owner IS one of its two signers, so an ' +
      'implementation that consulted only the transition table would sign — the owner’s half of ' +
      'a closure whose other half no advertised act can reach, because `done` is bound to the ' +
      'owner alone. The edge would stay contested for ever while its owner had been told it was ' +
      'closed. The exit that ends it is `expired`, which is time and not a member of the act ' +
      'vocabulary at all.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: true,
  },
  {
    name: 'release-from-contested-closure-refused',
    description:
      'The counterparty’s side of the same rule, and it is refused one step earlier: `release` ' +
      'is `owed_to`’s act, but `contested-closure` has no `released` row at all, so this is ' +
      '`illegal-source-state` and not `wrong-role-for-act`. Present because a node that refused ' +
      'only the owner’s `done` would leave the counterparty a control that signs an assertion ' +
      'the chain discards — the failure M-20 exists to prevent, arrived at from the other seat.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    caller: P_BOB,
    act: 'release',
    evidence_hash: null,
    window_elapsed: true,
  },
  {
    name: 'expire-from-contested-closure-after-the-window',
    description:
      '§4.4’s third exit, signed. Either party, no evidence, `expired`. This is the case whose ' +
      'absence made the escape unreachable: `act` took `done|release`, `expired` had no member ' +
      'in the act vocabulary, and §7 called the gap "time and not an act".',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    caller: P_BOB,
    act: 'expire',
    evidence_hash: null,
    window_elapsed: false,
    dispute_window_elapsed: true,
  },
  {
    name: 'expire-before-the-window-is-refused',
    description:
      'The window is what makes this exit safe: without it either party could end a live ' +
      'disagreement the moment it began, which is the unilateral freeze in reverse. The reason ' +
      'is `dispute-window-not-elapsed` and NOT `illegal-source-state`: this is the one state ' +
      'from which `expire` is legal, and telling the caller "never" when the answer is "not ' +
      'yet" is the complaint §7 rewrote that vocabulary to end.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    caller: P_ALICE,
    act: 'expire',
    evidence_hash: null,
    window_elapsed: false,
    dispute_window_elapsed: false,
  },
  {
    name: 'expire-with-evidence-is-refused',
    description:
      '§4.4: both parties’ assertions stay in the chain and the outcome names a window, never a ' +
      'verdict. An `evidence_hash` here would record a judgement the protocol refuses to make.',
    edge: EDGE_EVIDENCE,
    assertions: CONTESTED(EDGE_EVIDENCE),
    caller: P_ALICE,
    act: 'expire',
    evidence_hash: EV,
    window_elapsed: false,
    dispute_window_elapsed: true,
  },
  {
    name: 'malformed-edge-says-which-member-is-malformed',
    description:
      '§7 (v0.2, #41): §4.1 requires `acceptance_window` non-null iff `closure_policy` is ' +
      '`on-acceptance`. Such an edge accepts nothing, and blaming the caller’s state for it ' +
      'tells them to fix something that is not wrong.',
    edge: { ...EDGE_EVIDENCE, acceptance_window: 'P5D' },
    assertions: [],
    caller: P_ALICE,
    act: 'done',
    evidence_hash: EV,
    window_elapsed: false,
  },
  {
    name: 'a-second-release-hits-a-terminal-edge',
    description:
      '§7 (v0.2, #41): a repeat of `release` reaches an edge the first one already released, so ' +
      'the caller is told `terminal-state-reached` — which is the true reason, and the reason ' +
      'duplication is never considered. This case was named `…-is-named-a-duplicate` when it was ' +
      'written, and named the outcome its author expected rather than the one it produces: an ' +
      'independent implementation reading the name and the expectation together found they ' +
      'disagreed. A case whose name asserts more than its expectation is a check that cannot ' +
      'fail, in the suite itself.',
    edge: EDGE_ACCEPTANCE,
    assertions: [
      ...openChain(EDGE_ACCEPTANCE),
      makeAssertion({
        edge_id: EDGE_ACCEPTANCE.edge_id,
        state: 'released',
        asserted_at: T_EVIDENCE,
        signer: BOB,
      }),
    ],
    caller: P_BOB,
    act: 'release',
    evidence_hash: null,
    window_elapsed: false,
  },
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
  externalLabel: null,
  ...patch,
});

export const LEVEL_CASES: LevelCase[] = [
  {
    name: 'self-labelled-name-at-level-0-is-rendered',
    description:
      '§7 `counterparty.origin` (v0.2, #39). An `external_label` is a name the VIEWER typed for ' +
      'someone off-network — level 0 by construction, and the only name that counterparty will ' +
      'ever have. It is not evidence about anyone, so M-12 does not suppress it: a client that ' +
      'hid it would erase the person from their own register and break the solo path M-10 ' +
      'protects. v0.1 had no way to tell this apart from an attested name, which is why M-12’s ' +
      'client half was unenforceable rather than merely untested.',
    evidence: ev({ externalLabel: 'Georgi from the warehouse' }),
  },
  {
    name: 'an-attested-name-outranks-the-viewers-own-label',
    description:
      'Both present at level 2. The attestation is evidence and the label is a private note, so ' +
      'the attested name is what the node reports and its origin says so.',
    evidence: ev({
      attestation: true,
      attestedDisplayName: 'Maria Ivanova',
      externalLabel: 'the supplier',
    }),
  },
  {
    name: 'the-viewers-label-survives-a-level-that-carries-no-name',
    description:
      '`ext` outranks continuity and still carries no name — a binding proof binds a key to a ' +
      'CHANNEL. The label is not promoted by the level and not suppressed by it either.',
    evidence: ev({ bindingProof: true, externalLabel: 'Georgi from the warehouse' }),
  },
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

/**
 * §7 `brief` slots — M-21's node half, on the surface #20 was actually reported against.
 *
 * `open_loops` was already pinned; `brief` was not, so a node could ship slots carrying
 * node-supplied copy and pass the whole suite. The positive cases derive their `primary_action`
 * from the same `actionsFor` the actions family uses, so the two cannot disagree about what a
 * node may advertise. The malformed ones are the substance: a positive-only family would not
 * catch the regression it exists to prevent.
 */
export type SlotRejection =
  | 'copy-bearing-member'
  | 'act-not-in-vocabulary'
  | 'tool-not-bound-to-act'
  | 'args-must-be-empty';

export interface BriefSlotCase {
  name: string;
  description: string;
  /** Deliberately unshaped: a malformed slot is DATA here, not something a schema pre-filters. */
  slot: Record<string, unknown>;
  expected: { valid: boolean; rejection_reason: SlotRejection | null };
}

const ITEM = EDGE_ACCEPTANCE.edge_id;

export const BRIEF_SLOT_CASES: BriefSlotCase[] = [
  {
    name: 'valid-owner-open-edge',
    description:
      'The owner of an open edge. `done` is the leading act that signs, so it is the primary ' +
      'action; `headline` is the commitment intent as the person wrote it, which is CONTENT and ' +
      'travels verbatim.',
    slot: {
      headline: 'pull staging data for the repro',
      item_id: ITEM,
      primary_action: { act: 'done', tool: 'act', args: { id: ITEM, act: 'done' } },
    },
    expected: { valid: true, rejection_reason: null },
  },
  {
    name: 'valid-no-action-is-null-not-absent',
    description:
      'A slot with nothing a viewer may sign carries `primary_action: null`. Null says "nothing ' +
      'to do here"; omitting the member would say "this node forgot", and a client cannot tell ' +
      'those apart.',
    slot: { headline: 'a promise already closed', item_id: ITEM, primary_action: null },
    expected: { valid: true, rejection_reason: null },
  },
  {
    name: 'invalid-label-on-the-primary-action',
    description:
      'THE case this family exists for. `label` is a node telling a client what to write on a ' +
      'button, which is exactly what M-21 forbids and exactly the shape #20 reported. A slot ' +
      'carrying one MUST be rejected.',
    slot: {
      headline: 'pull staging data for the repro',
      item_id: ITEM,
      primary_action: { act: 'done', tool: 'act', args: { id: ITEM, act: 'done' }, label: 'Mark done' },
    },
    expected: { valid: false, rejection_reason: 'copy-bearing-member' },
  },
  {
    name: 'invalid-copy-on-the-slot',
    description:
      'Copy smuggled one level up. `headline` is the only string a slot may carry, because it is ' +
      'the person’s own recorded words; anything else a node writes for a client to render is ' +
      'the same violation wearing a different key.',
    slot: {
      headline: 'pull staging data for the repro',
      item_id: ITEM,
      subtitle: 'Overdue — act now',
      primary_action: { act: 'done', tool: 'act', args: { id: ITEM, act: 'done' } },
    },
    expected: { valid: false, rejection_reason: 'copy-bearing-member' },
  },
  {
    name: 'invalid-act-outside-the-vocabulary',
    description:
      'An act no client can map. The vocabulary is shared precisely so a client owns the wording ' +
      'for every act it may meet; an act outside it forces the client either to invent copy or ' +
      'to render something it cannot name.',
    slot: {
      headline: 'pull staging data for the repro',
      item_id: ITEM,
      primary_action: { act: 'nudge_harder', tool: 'act', args: { id: ITEM } },
    },
    expected: { valid: false, rejection_reason: 'act-not-in-vocabulary' },
  },
  {
    name: 'invalid-unbound-act-named-a-tool',
    description:
      'M-20 at slot level: `supersede` binds to no tool in v0, so naming one advertises a call ' +
      'that produces no assertion — a person told they acted when they did not.',
    slot: {
      headline: 'pull staging data for the repro',
      item_id: ITEM,
      primary_action: { act: 'supersede', tool: 'act', args: { id: ITEM } },
    },
    expected: { valid: false, rejection_reason: 'tool-not-bound-to-act' },
  },
  {
    name: 'invalid-args-on-an-unbound-act',
    description:
      '`tool: null` means there is no call to make, so there are no arguments to make it with. ' +
      'Arguments alongside a null tool are a call in waiting.',
    slot: {
      headline: 'pull staging data for the repro',
      item_id: ITEM,
      primary_action: { act: 'ping', tool: null, args: { id: ITEM } },
    },
    expected: { valid: false, rejection_reason: 'args-must-be-empty' },
  },
];
