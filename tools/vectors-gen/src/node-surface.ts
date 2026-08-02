/**
 * Reference model for the §7 node surface.
 *
 * Two things are pinned here, and both are node-side by necessity: a vector can pin what a
 * node emits, it cannot inspect what a client paints (see spec/08-conformance.md, "What the
 * suite cannot reach").
 *
 *   1. M-20 — which acts a node may advertise on an item, given the item's state and the
 *      requesting persona's role, and which §7 tool each act binds to.
 *   2. M-12 — the verification-level ladder: the total order `0 < 1 < ext < 2 < 3`, and the
 *      rule that a display name travels only at the levels an org attestation establishes.
 *
 * The acts come straight from §4.3's signer column. That is the whole point: a node that
 * advertises `release` to the owner is advertising an assertion the transition table forbids,
 * and the person who presses it learns that only when their counterparty never hears about it.
 */

import type { Edge } from './protocol.js';
import type { EffectiveState } from './transitions.js';

/** §7: one closed vocabulary, shared by `open_loops[].actions` and `brief.slots[].primary_action`. */
export type Act =
  | 'done'
  | 'release'
  | 'supersede'
  | 'delegate'
  | 'ping'
  | 'confirm'
  | 'dismiss'
  | 'propose';

export const ACT_VOCABULARY: Act[] = [
  'done',
  'release',
  'supersede',
  'delegate',
  'ping',
  'confirm',
  'dismiss',
  'propose',
];

/**
 * §7: `tool` names the tool that performs the act, or is null where v0 defines none.
 *
 * `supersede` and `delegate` are supersessions (§4.5) needing signatures across two edges,
 * which no single call completes. `ping` is not a transition at all. `propose` has no tool
 * for an already-recorded commitment: `commit` creates one, it does not propose an existing
 * one. Declaring these null is the honest form — inventing a binding is what M-20 forbids.
 */
export const ACT_TOOL: Record<Act, string | null> = {
  done: 'act',
  release: 'act',
  supersede: null,
  delegate: null,
  ping: null,
  confirm: 'confirm',
  dismiss: 'confirm',
  propose: null,
};

export interface AdvertisedAction {
  act: Act;
  tool: string | null;
  args: Record<string, unknown>;
}

export type ViewerRole = 'owner' | 'owed_to' | 'non-party';

export function roleOf(edge: Edge, persona: string): ViewerRole {
  if (persona === edge.owner) return 'owner';
  if (persona === edge.owed_to) return 'owed_to';
  return 'non-party';
}

function advertise(act: Act, args: Record<string, unknown> = {}): AdvertisedAction {
  const tool = ACT_TOOL[act];
  // §7: "Where `tool` is null, `args` MUST be {}."
  return { act, tool, args: tool === null ? {} : args };
}

/**
 * The §7 `actions` array for one item.
 *
 * `windowElapsed` is supplied per case rather than read from a clock: generation is clockless,
 * and the point of the flag is precisely that an owner's `done` in `pending-acceptance` is not
 * authorized until the window has run (§4.3). A node that advertises it early has told the
 * owner they may close, when the assertion would be discarded.
 */
export function actionsFor(
  edge: Edge,
  state: EffectiveState,
  persona: string,
  windowElapsed: boolean,
): AdvertisedAction[] {
  const role = roleOf(edge, persona);
  // M-3: edges are strictly two-party. A non-party is offered nothing, ever.
  if (role === 'non-party') return [];

  const id = { id: edge.edge_id };

  switch (state) {
    case 'none':
      return [];

    case 'proposed':
      // §6.5: a proposed edge is socially nothing. The owner can only nudge; the counterparty
      // decides. `dismiss` is vault-local and produces no assertion — which is exactly why it
      // is named `dismiss` and not `release`.
      return role === 'owner'
        ? [advertise('ping')]
        : [
            advertise('confirm', { ...id, decision: 'confirm' }),
            advertise('dismiss', { ...id, decision: 'dismiss' }),
          ];

    case 'open':
      return role === 'owner'
        ? [advertise('done', { ...id, act: 'done' }), advertise('supersede'), advertise('delegate')]
        : [advertise('release', { ...id, act: 'release' }), advertise('ping'), advertise('supersede')];

    case 'pending-acceptance':
      if (role === 'owed_to') {
        // The counterparty may still accept explicitly or dispute; `release` remains theirs.
        return [advertise('release', { ...id, act: 'release' }), advertise('supersede')];
      }
      // Owner: tacit acceptance only once the window has elapsed (§4.3).
      return windowElapsed
        ? [advertise('done', { ...id, act: 'done' }), advertise('supersede'), advertise('delegate')]
        : [advertise('supersede'), advertise('delegate')];

    case 'disputed':
      // §4.4 as resolved: v0 has no arbitration. The only exits are mutual `closed` and
      // mutual supersession, and neither is a single-call act, so only `supersede` is shown.
      return [advertise('supersede')];

    case 'contested-closure':
      // §4.4: the same shape as `disputed`, and for the same reason. Both exits need both
      // parties, so no single call performs one, and M-20 forbids advertising an act this
      // persona cannot sign into effect on its own.
      return [advertise('supersede')];

    // Terminal states carry no affordances at all (§7 conformance notes).
    case 'closed':
    case 'released':
    case 'superseded':
    case 'expired':
      return [];
  }
}

// ---------------------------------------------------------------------------
// The `act` tool (§7)
// ---------------------------------------------------------------------------

export type ActRejection =
  | 'not-a-party'
  | 'act-not-bound-to-a-tool'
  | 'wrong-role-for-act'
  | 'illegal-source-state'
  | 'evidence-hash-required'
  | 'evidence-hash-must-be-null'
  | 'acceptance-window-not-elapsed'
  /**
   * v0.2 (#41). v0.1 fixed seven values while the §4.3 table produced fifteen, so eight distinct
   * refusals reached the caller as the single word `illegal-source-state` — "the edge is over",
   * "you already signed this one" and "the edge object is malformed" were indistinguishable. A
   * tool whose contract is to refuse owes the caller a reason it can act on.
   */
  | 'terminal-state-reached'
  | 'duplicate-assertion-by-same-party'
  | 'malformed-edge-acceptance-window';

export interface ActOutcome {
  accepted: boolean;
  reason?: ActRejection;
  /** The assertion state the node would sign, when accepted. */
  asserts?: 'closed' | 'released';
}

/**
 * §7 `act`: sign exactly one assertion against one edge, as the calling persona.
 *
 * The node verifies against the §4.3 table BEFORE recording (M-14) and rejects the call
 * rather than recording an invalid assertion — a rejected call must leave no trace in the
 * chain, which is why this is evaluated here and not after `verifyChain`.
 */
export function evaluateAct(
  edge: Edge,
  state: EffectiveState,
  caller: string,
  act: Act,
  evidenceHash: string | null,
  windowElapsed: boolean,
  /** The chain as it stands, so a repeat of the caller's own assertion is named as one. */
  chain: readonly { by: string; state: string }[] = [],
): ActOutcome {
  const role = roleOf(edge, caller);
  if (role === 'non-party') return { accepted: false, reason: 'not-a-party' };
  if (ACT_TOOL[act] !== 'act') return { accepted: false, reason: 'act-not-bound-to-a-tool' };

  // §4.1: acceptance_window is non-null iff closure_policy is on-acceptance. A malformed edge
  // accepts nothing, and says which member is malformed rather than blaming the caller's state.
  if ((edge.closure_policy === 'on-acceptance') !== (edge.acceptance_window !== null)) {
    return { accepted: false, reason: 'malformed-edge-acceptance-window' };
  }

  // An edge that is over is over, whoever asks and whatever they ask for. Distinct from
  // `illegal-source-state`, which says the transition is wrong for a LIVE edge — a person told
  // "illegal source state" about a closed promise learns nothing they can act on.
  if (state === 'closed' || state === 'released' || state === 'superseded' || state === 'expired') {
    return { accepted: false, reason: 'terminal-state-reached' };
  }

  // §4.4 and §7 (v0.2): `disputed` is NOT in the open family. `done` from here would sign the
  // owner's half of a transition whose other half no advertised act can reach, leaving a closure
  // honestly recorded and permanently incomplete.
  const inOpenFamily = state === 'open' || state === 'pending-acceptance';

  if (act === 'done') {
    if (role !== 'owner') return { accepted: false, reason: 'wrong-role-for-act' };
    if (!inOpenFamily) return { accepted: false, reason: 'illegal-source-state' };
    if (evidenceHash === null) return { accepted: false, reason: 'evidence-hash-required' };
    if (state === 'pending-acceptance' && !windowElapsed) {
      return { accepted: false, reason: 'acceptance-window-not-elapsed' };
    }
    return { accepted: true, asserts: 'closed' };
  }

  // release — §4.3's one unilateral act: "owed_to alone", unconditional forgiveness.
  if (role !== 'owed_to') return { accepted: false, reason: 'wrong-role-for-act' };
  if (!inOpenFamily) return { accepted: false, reason: 'illegal-source-state' };
  if (evidenceHash !== null) return { accepted: false, reason: 'evidence-hash-must-be-null' };
  // A repeat of `release` changes nothing and is named as a repeat. Deliberately NOT applied to
  // `done`: under `on-acceptance` the owner signs `closed` twice by design — once to present
  // evidence (which opens the window) and once after it elapses (§4.3, act 3). Treating that as a
  // duplicate would refuse the very act the window exists to permit, which is what the selfcheck
  // caught when this check was written symmetrically.
  if (chain.some((a) => a.by === caller && a.state === 'released')) {
    return { accepted: false, reason: 'duplicate-assertion-by-same-party' };
  }
  return { accepted: true, asserts: 'released' };
}

// ---------------------------------------------------------------------------
// M-12 — the verification ladder (§1.6)
// ---------------------------------------------------------------------------

export type Level = '0' | '1' | 'ext' | '2' | '3';

/**
 * §1.6 as resolved: 0 < 1 < ext < 2 < 3. `ext` outranks continuity and is outranked by an
 * attestation, because a binding proof is the persona's own signature on a channel it
 * controls — self-assertion — while an attestation is a third party staking its key.
 */
export const LEVEL_RANK: Record<Level, number> = {
  '0': 0,
  '1': 1,
  ext: 2,
  '2': 3,
  '3': 4,
};

export const LEVEL_ORDER: Level[] = ['0', '1', 'ext', '2', '3'];

export interface Evidence {
  /** ≥1 prior confirmed edge with this key (level 1). */
  priorConfirmedEdge: boolean;
  /** A signed statement on a channel the persona controls (level ext). */
  bindingProof: boolean;
  /** A valid, unrevoked org attestation (level 2). */
  attestation: boolean;
  /** The attesting org root is domain-anchored (level 3). */
  domainAnchored: boolean;
  /** The name the attestation claims, if any. Never reaches output below level 2. */
  attestedDisplayName: string | null;
  /**
   * §3.1 `external_label` — a name the VIEWER typed for an off-network counterparty (v0.2, #39).
   *
   * Level 0 by construction and the only name that counterparty will ever have. It is not
   * evidence about anyone; it is the viewer's own note to themselves.
   */
  externalLabel?: string | null;
}

export interface GradedIdentity {
  level: Level;
  /** null wherever the level's evidence does not carry a name (§1.6, M-12). */
  display_name: string | null;
  /**
   * §7 `counterparty` (v0.2, #39): the name a client renders, and where it came from.
   *
   * `attested` MUST NOT be rendered above its level; `self-labelled` is rendered at any level,
   * because a label you wrote yourself makes no claim about anyone. v0.1 emitted a bare string,
   * so a client could satisfy M-12 only by suppressing both — destroying the offline path M-10
   * protects — or neither. Every client chose neither.
   */
  counterparty: { value: string; origin: 'attested' | 'self-labelled' } | null;
}

export function achievedLevels(e: Evidence): Level[] {
  const out: Level[] = ['0'];
  if (e.priorConfirmedEdge) out.push('1');
  if (e.bindingProof) out.push('ext');
  if (e.attestation) out.push('2');
  if (e.attestation && e.domainAnchored) out.push('3');
  return out;
}

export function grade(e: Evidence): GradedIdentity {
  const level = achievedLevels(e).reduce((best, l) =>
    LEVEL_RANK[l] > LEVEL_RANK[best] ? l : best,
  );
  // M-12, structurally: the only branch that lets a human name out requires the level that
  // carries it. A binding proof binds a key to a CHANNEL, never to a name, so `ext` is not
  // name-bearing however high it ranks.
  const nameBearing = level === '2' || level === '3';
  const display_name = nameBearing ? e.attestedDisplayName : null;
  // The attested name wins when the level carries one: it is evidence, and the viewer's own note
  // is not. Below that level the label is what remains, and it is not suppressed — there is
  // nothing to suppress it in favour of.
  const counterparty: GradedIdentity['counterparty'] =
    display_name !== null
      ? { value: display_name, origin: 'attested' }
      : e.externalLabel != null
        ? { value: e.externalLabel, origin: 'self-labelled' }
        : null;
  return { level, display_name, counterparty };
}
