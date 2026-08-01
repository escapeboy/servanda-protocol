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
  | 'disputed'
  | 'closed'
  | 'released'
  | 'superseded'
  | 'expired';

const TERMINAL: EffectiveState[] = ['closed', 'released', 'superseded', 'expired'];

export interface VerifyResult {
  outcomes: AssertionOutcome[];
  finalState: EffectiveState;
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

export function verifyChain(edge: Edge, assertions: Assertion[]): VerifyResult {
  const st: MutableState = {
    state: 'none',
    acceptanceWindowOpenedAt: null,
    supersededBy: new Set(),
    disputedClosedBy: new Set(),
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

  if (TERMINAL.includes(st.state)) return 'terminal-state-reached';

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

    case 'released':
      if (st.state !== 'open' && st.state !== 'pending-acceptance') {
        return 'illegal-source-state';
      }
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
      if (st.state !== 'open' && st.state !== 'pending-acceptance') {
        return 'illegal-source-state';
      }
      if (edge.due === null) return 'due-is-null'; // §4.3 "only if due non-null"
      if (Date.parse(a.asserted_at) < Date.parse(edge.due)) return 'expiry-before-due';
      return null;

    case 'disputed':
      if (st.state !== 'open' && st.state !== 'pending-acceptance') {
        return 'illegal-source-state';
      }
      if (a.evidence_hash === null) return 'evidence-hash-required'; // §4.3 REQUIRED
      return null;

    case 'superseded':
      if (
        st.state !== 'open' &&
        st.state !== 'pending-acceptance' &&
        st.state !== 'disputed'
      ) {
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
  switch (a.state) {
    case 'proposed':
      st.state = 'proposed';
      return;

    case 'confirmed':
      st.state = 'open'; // confirmed ≡ open
      return;

    case 'released':
      st.state = 'released';
      return;

    case 'expired':
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
