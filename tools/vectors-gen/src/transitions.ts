/**
 * Reference verifier for the §4.3 transition table.
 *
 * spec/04-edge.md §4.3: "Any assertion violating this table is invalid and MUST be
 * discarded by conforming nodes." spec/08-conformance.md M-14 restates this. The
 * negative vectors in vectors/transitions/ exist to pin exactly which sequences a
 * conforming node has to refuse.
 *
 * Where the spec is currently ambiguous this file makes a choice, marks it INTERPRETATION,
 * and the ambiguity is filed as a repository issue. The interpretations are NOT normative.
 */

import { verifyObject, fromHex } from './crypto.js';
import { collectiveDecompositionValid, edgeId } from './protocol.js';
import type { Assertion, AssertionState, Edge } from './protocol.js';
import type { Json } from './jcs.js';

export type RejectionReason =
  | 'edge-id-mismatch'
  | 'invalid-signature'
  | 'signer-not-a-party'
  | 'wrong-signer-for-transition'
  | 'illegal-source-state'
  | 'terminal-state-reached'
  | 'evidence-hash-required'
  | 'evidence-hash-required-for-owner-closure'
  | 'due-is-null'
  | 'expiry-before-due'
  | 'acceptance-window-not-elapsed'
  | 'dispute-window-not-elapsed'
  | 'implicit-transition-not-assertable'
  | 'duplicate-assertion-by-same-party'
  | 'malformed-edge-acceptance-window'
  | 'edge-id-does-not-bind-body'
  /** v0.2 (#38): `asserted_at` is non-decreasing per signer within a chain. */
  | 'asserted-at-before-signers-previous';

export interface AssertionOutcome {
  index: number;
  accepted: boolean;
  reason?: RejectionReason;
  /** Effective edge state after processing this assertion. */
  stateAfter: EffectiveState;
}

/**
 * INTERPRETATION (§4.3 row "confirmed → open | (implicit)"): `confirmed` and `open` are
 * the same effective state. The verifier models one state, `open`, entered by a valid
 * `confirmed` assertion.
 */
export type EffectiveState =
  | 'none'
  | 'proposed'
  | 'open'
  | 'pending-acceptance'
  | 'contested-closure'
  | 'disputed'
  | 'closed'
  | 'released'
  | 'superseded'
  | 'expired';

const TERMINAL: EffectiveState[] = ['closed', 'released', 'superseded', 'expired'];

export interface VerifyResult {
  outcomes: AssertionOutcome[];
  finalState: EffectiveState;
  /**
   * §4.7 / M-8 / M-9: a collective edge with neither covering children nor a named coordinator.
   *
   * Reported alongside the state rather than folded into it, because it is not a state — an
   * unverifiable edge still has whatever state its chain gives it, and what M-8 forbids is
   * ESCALATING on it. A vector cannot watch an escalation, which is a local decision; it can pin
   * the flag the decision is gated on, and that is the difference between M-8 being a prose
   * obligation and being a conformance requirement.
   */
  unverifiable: boolean;
  acceptedCount: number;
  rejectedCount: number;
}

interface MutableState {
  state: EffectiveState;
  /** asserted_at of the owner's evidence assertion that opened the acceptance window. */
  acceptanceWindowOpenedAt: string | null;
  /** Parties that have asserted `superseded` (§4.5 requires both). */
  supersededBy: Set<string>;
  /** Parties that have asserted `closed` out of `disputed` (§4.3 requires both). */
  disputedClosedBy: Set<string>;
  /** §4.4: the unilateral exit from `open`, so a concurrent DIFFERENT one can be recognised. */
  exit: { state: string; by: string; at: string } | null;
  /** Set by `evaluate`, consumed by `apply`: this assertion contests rather than transitions. */
  contestPending: boolean;
  contestClosedBy: Set<string>;
  contestSupersededBy: Set<string>;
  /** §4.4: when the contest was recorded — the instant `dispute_window` runs from. */
  contestedAt: string | null;
  /** asserted_at of the accepted `disputed` assertion — when `dispute_window` starts running. */
  disputedAt: string | null;
  /**
   * The latest `asserted_at` accepted from each signer (§4.3, v0.2).
   *
   * Both windows in this spec are measured between two `asserted_at` values, and until v0.2 both
   * could be written by the party the window constrains: an owner minting `closed` dated years
   * back and `closed` dated now computed the window as elapsed on an edge the counterparty had
   * only confirmed. Per-signer rather than global, because two parties legitimately disagree
   * about `now` and neither is authoritative over the other's clock.
   */
  latestBySigner: Map<string, string>;
}

/**
 * §4.4: `dispute_window` is a protocol CONSTANT, not an edge member.
 *
 * A per-edge value would let one party choose the window that suits them, and the party who
 * benefits from a long freeze is precisely the party who disputes.
 */
export const DISPUTE_WINDOW = 'P30D';

/** Minimal ISO-8601 duration support: the P5D / PnD / PTnH forms the spec uses. */
export function addDuration(isoTimestamp: string, duration: string): number {
  const base = Date.parse(isoTimestamp);
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration);
  if (!m) throw new Error(`unsupported acceptance_window duration: ${duration}`);
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const minutes = Number(m[3] ?? 0);
  return base + ((days * 24 + hours) * 60 + minutes) * 60_000;
}

/** §4.4: the exits `open` gives one party acting alone. `superseded` needs both, so it cannot race. */
const UNILATERAL_EXITS: readonly string[] = ['closed', 'released', 'expired'] as const;

/**
 * Would this have been a legal unilateral exit from `open`? Null if yes, else why not.
 * A counterfactual, because the chain has already left `open` — only a legal act contests.
 */
function unilateralExitFault(edge: Edge, a: Assertion): RejectionReason | null {
  const isOwner = a.by === edge.owner;
  const isOwedTo = a.by === edge.owed_to;
  switch (a.state) {
    case 'closed':
      if (!isOwner) return 'wrong-signer-for-transition';
      return a.evidence_hash === null ? 'evidence-hash-required-for-owner-closure' : null;
    case 'released':
      return isOwedTo ? null : 'wrong-signer-for-transition';
    case 'expired':
      if (edge.due === null) return 'due-is-null';
      return Date.parse(a.asserted_at) < Date.parse(edge.due) ? 'expiry-before-due' : null;
    default:
      return 'illegal-source-state';
  }
}

export function verifyChain(edge: Edge, assertions: Assertion[]): VerifyResult {
  const st: MutableState = {
    state: 'none',
    acceptanceWindowOpenedAt: null,
    supersededBy: new Set(),
    disputedClosedBy: new Set(),
    exit: null,
    contestPending: false,
    contestClosedBy: new Set(),
    contestSupersededBy: new Set(),
    contestedAt: null,
    disputedAt: null,
    latestBySigner: new Map(),
  };

  const outcomes: AssertionOutcome[] = [];

  assertions.forEach((a, index) => {
    const reason = evaluate(edge, a, st);
    if (reason) {
      outcomes.push({ index, accepted: false, reason, stateAfter: st.state });
    } else {
      apply(edge, a, st);
      st.latestBySigner.set(a.by, a.asserted_at);
      outcomes.push({ index, accepted: true, stateAfter: st.state });
    }
  });

  return {
    outcomes,
    finalState: st.state,
    unverifiable: !collectiveDecompositionValid(edge),
    acceptedCount: outcomes.filter((o) => o.accepted).length,
    rejectedCount: outcomes.filter((o) => !o.accepted).length,
  };
}

function evaluate(edge: Edge, a: Assertion, st: MutableState): RejectionReason | null {
  // §4.3 (v0.2, #38): non-decreasing per signer. Checked FIRST, before the table, because a
  // backdated assertion is not a transition error — the transition may be perfectly legal — and
  // reporting it as `illegal-source-state` would hide what actually happened.
  const previous = st.latestBySigner.get(a.by);
  if (previous !== undefined && Date.parse(a.asserted_at) < Date.parse(previous)) {
    return 'asserted-at-before-signers-previous';
  }
  // §4.1: the identifier must digest the body it names. Checked before every other rule about
  // this edge, because until it holds, "the body" is whatever its sender wanted the rules to
  // read — the four bound members include both parties, so an unbound edge can satisfy every
  // signer check on its own terms while its chain is filed under somebody else's identifier.
  if (
    edgeId(edge.commitment_hash, edge.owner, edge.owed_to, edge.proposed_at) !== edge.edge_id
  ) {
    return 'edge-id-does-not-bind-body';
  }

  // §4.1 (as resolved): acceptance_window is non-null iff closure_policy is on-acceptance.
  // There is no default. A malformed edge accepts no assertions at all — not merely the
  // closure ones — because the member decides when silence becomes consent.
  if (
    (edge.closure_policy === 'on-acceptance') !==
    (edge.acceptance_window !== null)
  ) {
    return 'malformed-edge-acceptance-window';
  }

  if (a.edge_id !== edge.edge_id) return 'edge-id-mismatch';

  // Signature must verify under the key named in `by` — this also catches an assertion
  // signed by one party but attributed to another.
  let pub: Uint8Array;
  try {
    pub = fromHex(a.by);
  } catch {
    return 'invalid-signature';
  }
  if (!verifyObject(a as unknown as Record<string, Json>, a.sig, pub)) {
    return 'invalid-signature';
  }

  const isOwner = a.by === edge.owner;
  const isOwedTo = a.by === edge.owed_to;
  if (!isOwner && !isOwedTo) return 'signer-not-a-party';

  // §4.4: two parties took DIFFERENT unilateral exits from `open` concurrently, and neither did
  // anything wrong. Refusing the second is what left two honest nodes permanently divergent, so it
  // is checked before the terminal guard. Only a concurrent act contests — one dated later could
  // have been a response, and §4.3's rows already say what an answer to an exit is.
  if (
    st.exit !== null &&
    a.by !== st.exit.by &&
    UNILATERAL_EXITS.includes(a.state) &&
    a.state !== st.exit.state &&
    st.state !== 'contested-closure' &&
    Date.parse(a.asserted_at) <= Date.parse(st.exit.at)
  ) {
    const fault = unilateralExitFault(edge, a);
    if (fault !== null) return fault;
    // `evaluate` decides; `apply` moves the state. Setting it here would be overwritten by the
    // ordinary row a moment later — which is exactly what happened the first time.
    st.contestPending = true;
    st.contestedAt = a.asserted_at;
    return null;
  }

  if (TERMINAL.includes(st.state)) return 'terminal-state-reached';

  // §4.3: `contested-closure` is left the way `disputed` is — both parties, or not at all.
  if (st.state === 'contested-closure') {
    const both = (seen: Set<string>): RejectionReason | null =>
      seen.has(a.by) ? 'duplicate-assertion-by-same-party' : (seen.add(a.by), null);
    if (a.state === 'closed') {
      const bad = both(st.contestClosedBy);
      if (bad) return bad;
      if (st.contestClosedBy.size === 2) st.state = 'closed';
      return null;
    }
    if (a.state === 'superseded') {
      const bad = both(st.contestSupersededBy);
      if (bad) return bad;
      if (st.contestSupersededBy.size === 2) st.state = 'superseded';
      return null;
    }
    // §4.4's third exit. Both resolutions above need BOTH parties, so without this a contest is a
    // unilateral permanent freeze — and one that costs no `evidence_hash`, where `disputed` does.
    if (a.state === 'expired') {
      if (st.contestedAt === null) return 'illegal-source-state';
      if (Date.parse(a.asserted_at) < addDuration(st.contestedAt, DISPUTE_WINDOW)) {
        return 'dispute-window-not-elapsed';
      }
      st.state = 'expired';
      return null;
    }
    return 'illegal-source-state';
  }

  switch (a.state) {
    case 'proposed':
      if (st.state !== 'none') return 'illegal-source-state';
      if (!isOwner) return 'wrong-signer-for-transition';
      return null;

    case 'confirmed':
      if (st.state !== 'proposed') return 'illegal-source-state';
      if (!isOwedTo) return 'wrong-signer-for-transition';
      return null;

    // INTERPRETATION: §4.3 marks confirmed → open as "(implicit)" with no signer, so an
    // explicit `open` assertion has no row authorizing it and is refused.
    case 'open':
      return 'implicit-transition-not-assertable';

    // §4.3 gives `released`, `expired` and `superseded` an `open` source row and no
    // `pending-acceptance` row. Reading `pending-acceptance` as part of an "open family" — which
    // this verifier and the reference implementation both did, independently and identically —
    // invents three transitions the table does not have. The equivalence §4.3 actually licenses
    // is `confirmed` ≡ `open`, and `st.state` has already collapsed that.
    case 'released':
      if (st.state !== 'open') return 'illegal-source-state';
      if (!isOwedTo) return 'wrong-signer-for-transition'; // §4.3: "owed_to alone"
      return null;

    case 'expired':
      // §4.4: a third exit that ends a `disputed` edge WITHOUT resolving it. Both resolutions
      // require both parties, so without this a unilateral dispute freezes an edge permanently.
      // It decides nothing about the merits — see the rejection names, which say `window`, never
      // anything about who was right.
      if (st.state === 'disputed') {
        if (st.disputedAt === null) return 'illegal-source-state';
        if (Date.parse(a.asserted_at) < addDuration(st.disputedAt, DISPUTE_WINDOW)) {
          return 'dispute-window-not-elapsed';
        }
        return null;
      }
      // The damaging one: `expired` is terminal and unilateral once `due` has passed, so from
      // `pending-acceptance` it let the creditor answer the debtor's evidence assertion by
      // ending the edge outright — the §4.4 acceptance window read backwards.
      if (st.state !== 'open') return 'illegal-source-state';
      if (edge.due === null) return 'due-is-null'; // §4.3 "only if due non-null"
      if (Date.parse(a.asserted_at) < Date.parse(edge.due)) return 'expiry-before-due';
      return null;

    // The one row `pending-acceptance` genuinely has besides its two closures: §4.3
    // "pending-acceptance | disputed | either party, `evidence_hash` REQUIRED".
    case 'disputed':
      if (st.state !== 'open' && st.state !== 'pending-acceptance') {
        return 'illegal-source-state';
      }
      if (a.evidence_hash === null) return 'evidence-hash-required'; // §4.3 REQUIRED
      return null;

    case 'superseded':
      if (st.state !== 'open' && st.state !== 'disputed') {
        return 'illegal-source-state';
      }
      if (st.supersededBy.has(a.by)) return 'duplicate-assertion-by-same-party';
      return null;

    case 'closed':
      return evaluateClosure(edge, a, st, isOwner, isOwedTo);

    default:
      return 'illegal-source-state';
  }
}

function evaluateClosure(
  edge: Edge,
  a: Assertion,
  st: MutableState,
  isOwner: boolean,
  isOwedTo: boolean,
): RejectionReason | null {
  // §4.3 last row: disputed → closed requires both parties.
  if (st.state === 'disputed') {
    if (st.disputedClosedBy.has(a.by)) return 'duplicate-assertion-by-same-party';
    return null;
  }

  if (st.state !== 'open' && st.state !== 'pending-acceptance') {
    return 'illegal-source-state';
  }

  if (edge.closure_policy === 'on-evidence') {
    // §4.4: "a `closed` assertion by the owner with non-null evidence_hash closes the edge"
    if (!isOwner) return 'wrong-signer-for-transition';
    if (a.evidence_hash === null) return 'evidence-hash-required-for-owner-closure';
    return null;
  }

  // on-acceptance. INTERPRETATION: §4.4 describes three distinct acts but §4.3 provides
  // no pending-acceptance state, so all three arrive as `closed` assertions:
  //   1. owner + evidence_hash        → opens the acceptance window
  //   2. owed_to                      → explicit accept, closes
  //   3. owner again, after the window → tacit acceptance, closes
  if (st.state === 'open') {
    if (!isOwner) return 'wrong-signer-for-transition';
    if (a.evidence_hash === null) return 'evidence-hash-required-for-owner-closure';
    return null; // opens the window
  }

  // st.state === 'pending-acceptance'
  if (isOwedTo) return null; // explicit accept

  // Owner recording tacit acceptance: only once the window has elapsed. No `?? 'P5D'`
  // fallback — §4.1 makes a null window on an on-acceptance edge malformed, rejected above.
  const expiresAt = addDuration(st.acceptanceWindowOpenedAt!, edge.acceptance_window!);
  if (Date.parse(a.asserted_at) < expiresAt) return 'acceptance-window-not-elapsed';
  return null;
}

function apply(edge: Edge, a: Assertion, st: MutableState): void {
  if (st.contestPending) {
    st.contestPending = false;
    st.state = 'contested-closure';
    return;
  }
  // Leaving `contested-closure` is decided in `evaluate` (both parties, exactly as `disputed`),
  // so the ordinary rows must not run over it.
  if (st.state === 'contested-closure' && st.contestClosedBy.size < 2 && st.contestSupersededBy.size < 2) {
    return;
  }
  switch (a.state) {
    case 'proposed':
      st.state = 'proposed';
      return;

    case 'confirmed':
      st.state = 'open'; // confirmed ≡ open
      return;

    case 'released':
      if (st.state === 'open') st.exit = { state: 'released', by: a.by, at: a.asserted_at };
      st.state = 'released';
      return;

    case 'expired':
      if (st.state === 'open') st.exit = { state: 'expired', by: a.by, at: a.asserted_at };
      st.state = 'expired';
      return;

    case 'disputed':
      st.state = 'disputed';
      st.disputedAt = a.asserted_at;
      st.acceptanceWindowOpenedAt = null;
      return;

    case 'superseded':
      st.supersededBy.add(a.by);
      // §4.5: valid only when BOTH parties of the old edge have signed `superseded`.
      if (st.supersededBy.has(edge.owner) && st.supersededBy.has(edge.owed_to)) {
        st.state = 'superseded';
      }
      return;

    case 'closed':
      if (st.state === 'disputed') {
        st.disputedClosedBy.add(a.by);
        if (
          st.disputedClosedBy.has(edge.owner) &&
          st.disputedClosedBy.has(edge.owed_to)
        ) {
          st.state = 'closed';
        }
        return;
      }
      if (st.state === 'open') st.exit = { state: 'closed', by: a.by, at: a.asserted_at };
      if (edge.closure_policy === 'on-evidence') {
        st.state = 'closed';
        return;
      }
      if (st.state === 'open') {
        st.state = 'pending-acceptance';
        st.acceptanceWindowOpenedAt = a.asserted_at;
        return;
      }
      st.state = 'closed';
      return;

    default:
      throw new Error(`apply() reached an unhandled state: ${a.state as AssertionState}`);
  }
}
