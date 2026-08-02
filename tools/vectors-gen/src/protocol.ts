/**
 * Protocol object construction: commitments, edges, assertions.
 * Fixed test fixtures live here so every vector is reproducible from committed seeds.
 */

import { canonicalBytes, canonicalize, type Json } from './jcs.js';
import {
  derivePersona,
  mnemonicToSeed,
  signObject,
  sha256Hex,
  type Persona,
} from './crypto.js';

export const PROTOCOL_VERSION = 'servanda/0.2';

/**
 * spec/00-overview.md (Conventions) — identifier preimages are domain-separated.
 *
 * Every identifier the spec defines as a sha256 digest is computed over a preimage that
 * begins with a fixed ASCII tag followed by a single 0x00 octet. The tag contains no 0x00,
 * so it is self-delimiting. Signing preimages are NOT tagged.
 */
export const DOMAIN_TAG = {
  commitment_hash: 'servanda/0.1:commitment_hash',
  edge_id: 'servanda/0.1:edge_id',
  envelope_id: 'servanda/0.1:envelope_id',
} as const;

/** tag || 0x00 || body — the exact byte layout §0 fixes. */
export function domainSeparated(tag: string, body: Uint8Array): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag);
  const out = new Uint8Array(tagBytes.length + 1 + body.length);
  out.set(tagBytes, 0);
  out[tagBytes.length] = 0x00;
  out.set(body, tagBytes.length + 1);
  return out;
}

/**
 * TEST SEEDS ONLY — these are published BIP-39 test vectors (all-zero and all-0x7f
 * entropy). Never use them for anything real; any key derived here is public knowledge.
 */
export const PERSONA_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

export const ORG_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth ' +
  'useful legal winner thank year wave sausage worth title';

const personaSeed = mnemonicToSeed(PERSONA_MNEMONIC);
const orgSeed = mnemonicToSeed(ORG_MNEMONIC);

/** Named actors used across the vector suite. */
export const ALICE: Persona = derivePersona(personaSeed, 0); // owner
export const BOB: Persona = derivePersona(personaSeed, 1); // owed_to
export const CAROL: Persona = derivePersona(personaSeed, 2); // non-party
/** §6.7: the key a store-and-forward hub operates under — never a party to an edge. */
export const HUB_OPERATOR: Persona = derivePersona(personaSeed, 3);
export const ORG_ROOT: Persona = derivePersona(orgSeed, 0);

export interface Commitment {
  v: string;
  type: 'commitment';
  intent: string;
  owner: string;
  owed_to: string | null;
  due: string | null;
  conditions: string[];
  evidence_refs: { kind: string; value: string }[];
  created_at: string;
  source: string;
  confidence: number;
}

/**
 * spec/03-commitment.md §3.2:
 *   commitment_hash = sha256( JCS({ intent, owner, owed_to, due, created_at }) )
 * "Only these five fields." Everything else is vault-local and excluded.
 */
export const COMMITMENT_HASH_FIELDS = [
  'intent',
  'owner',
  'owed_to',
  'due',
  'created_at',
] as const;

export function commitmentHashPreimage(c: Commitment): Record<string, Json> {
  return {
    intent: c.intent,
    owner: c.owner,
    owed_to: c.owed_to,
    due: c.due,
    created_at: c.created_at,
  };
}

/**
 * spec/03-commitment.md §3.2 (as resolved):
 *   commitment_hash = sha256( "servanda/0.1:commitment_hash" || 0x00 || JCS(five fields) )
 */
export function commitmentHash(c: Commitment): string {
  return sha256Hex(
    domainSeparated(
      DOMAIN_TAG.commitment_hash,
      canonicalBytes(commitmentHashPreimage(c) as Json),
    ),
  );
}

export function canonicalCommitmentPreimage(c: Commitment): string {
  return canonicalize(commitmentHashPreimage(c) as Json);
}

/**
 * spec/04-edge.md §4.1 (as resolved):
 *   edge_id = sha256( "servanda/0.1:edge_id" || 0x00
 *                     || utf8(commitment_hash) || utf8(owner) || utf8(owed_to) || utf8(proposed_at) )
 *
 * `||` between the four values is octet concatenation with no separator and no length
 * prefix; each value contributes the UTF-8 octets of its own textual form. This is now
 * normative (§4.1) rather than an interpretation. The first three values are fixed-width
 * 64-octet lowercase hex, so the concatenation is unambiguous.
 */
export function edgeId(
  commitment_hash: string,
  owner: string,
  owed_to: string,
  proposed_at: string,
): string {
  const body = new TextEncoder().encode(
    commitment_hash + owner + owed_to + proposed_at,
  );
  return sha256Hex(domainSeparated(DOMAIN_TAG.edge_id, body));
}

export interface Edge {
  v: string;
  type: 'edge';
  edge_id: string;
  commitment_hash: string;
  owner: string;
  owed_to: string;
  proposed_at: string;
  due: string | null;
  closure_policy: 'on-evidence' | 'on-acceptance';
  acceptance_window: string | null;
  blocked_by: string[];
  /** §4.7: present only on a collective edge (owner is a group key). */
  fulfillment?: Fulfillment;
  supersedes: string | null;
}

/** §4.7 collective fulfillment. `k` is required by `k-of-n` and meaningless otherwise. */
export interface Fulfillment {
  policy: 'all' | 'any' | 'k-of-n';
  k?: number;
  children: string[];
  coordinator?: string;
}

/**
 * §4.7 + M-9: "a collective edge MUST have either `fulfillment.children` whose union covers
 * fulfillment, or `fulfillment.coordinator`. Otherwise nodes MUST mark it unverifiable (no
 * auto-escalation)" — which is M-8.
 *
 * A pure function of the edge, which is why the two MUSTs can be covered by a vector at all: an
 * "escalation" is a local decision no vector can watch, but the flag that gates it is a value a
 * verifier computes and can be asked to state.
 */
export function collectiveDecompositionValid(edge: Edge): boolean {
  const f = edge.fulfillment;
  if (!f) return true;
  if (f.coordinator) return true;
  if (f.children.length === 0) return false;
  if (f.policy === 'k-of-n') return f.k !== undefined && f.k > 0 && f.k <= f.children.length;
  return true;
}

export function makeEdge(opts: {
  commitment_hash: string;
  owner: string;
  owed_to: string;
  proposed_at: string;
  due?: string | null;
  closure_policy?: 'on-evidence' | 'on-acceptance';
  acceptance_window?: string | null;
  blocked_by?: string[];
  fulfillment?: Fulfillment;
  supersedes?: string | null;
}): Edge {
  const closure_policy = opts.closure_policy ?? 'on-acceptance';
  return {
    v: PROTOCOL_VERSION,
    type: 'edge',
    edge_id: edgeId(
      opts.commitment_hash,
      opts.owner,
      opts.owed_to,
      opts.proposed_at,
    ),
    commitment_hash: opts.commitment_hash,
    owner: opts.owner,
    owed_to: opts.owed_to,
    proposed_at: opts.proposed_at,
    due: opts.due ?? null,
    closure_policy,
    // §4.1 (as resolved): non-null iff on-acceptance, null otherwise. There is no default —
    // the member is never absent, so a default would never apply.
    acceptance_window:
      opts.acceptance_window !== undefined
        ? opts.acceptance_window
        : closure_policy === 'on-acceptance'
          ? 'P5D'
          : null,
    blocked_by: opts.blocked_by ?? [],
    // Omitted rather than nulled when absent: §4.1 lists `fulfillment` as present only on a
    // collective edge, and a `"fulfillment": null` member would be a different object.
    ...(opts.fulfillment ? { fulfillment: opts.fulfillment } : {}),
    supersedes: opts.supersedes ?? null,
  };
}

export type AssertionState =
  | 'proposed'
  | 'confirmed'
  | 'open'
  | 'closed'
  | 'released'
  | 'superseded'
  | 'expired'
  | 'disputed';

export interface Assertion {
  v: string;
  type: 'assertion';
  edge_id: string;
  state: AssertionState;
  asserted_at: string;
  by: string;
  evidence_hash: string | null;
  sig: string;
}

export function makeAssertion(opts: {
  edge_id: string;
  state: AssertionState;
  asserted_at: string;
  signer: Persona;
  /** Overrides the `by` field without changing the signing key — for forgery vectors. */
  byOverride?: string;
  evidence_hash?: string | null;
  /** Corrupts the signature deliberately — for invalid-signature vectors. */
  corruptSignature?: boolean;
}): Assertion {
  const unsigned = {
    v: PROTOCOL_VERSION,
    type: 'assertion' as const,
    edge_id: opts.edge_id,
    state: opts.state,
    asserted_at: opts.asserted_at,
    by: opts.byOverride ?? opts.signer.personaId,
    evidence_hash: opts.evidence_hash ?? null,
  };
  let sig = signObject(unsigned as unknown as Record<string, Json>, opts.signer.privateKey);
  if (opts.corruptSignature) {
    // Flip the first nibble so the signature stays well-formed but does not verify.
    const first = sig[0] === '0' ? '1' : '0';
    sig = first + sig.slice(1);
  }
  return { ...unsigned, sig };
}

export function evidenceHash(label: string): string {
  return sha256Hex(new TextEncoder().encode(label));
}
