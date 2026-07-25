/**
 * Protocol object construction: commitments, edges, assertions.
 * Fixed test fixtures live here so every vector is reproducible from committed seeds.
 */

import { canonicalize, type Json } from './jcs.js';
import {
  derivePersona,
  digestHex,
  mnemonicToSeed,
  signObject,
  sha256Hex,
  type Persona,
} from './crypto.js';

export const PROTOCOL_VERSION = 'servanda/0.1';

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

export function commitmentHash(c: Commitment): string {
  return digestHex(commitmentHashPreimage(c) as Json);
}

export function canonicalCommitmentPreimage(c: Commitment): string {
  return canonicalize(commitmentHashPreimage(c) as Json);
}

/**
 * spec/04-edge.md §4.1:
 *   edge_id = sha256(commitment_hash || owner || owed_to || proposed_at)
 *
 * INTERPRETATION (the spec does not define the concatenation encoding — see
 * vectors/README.md and the tracked issue): `||` is taken as concatenation of the four
 * values' UTF-8 bytes, in the listed order, with no separator and no length prefix.
 */
export function edgeId(
  commitment_hash: string,
  owner: string,
  owed_to: string,
  proposed_at: string,
): string {
  const preimage = new TextEncoder().encode(
    commitment_hash + owner + owed_to + proposed_at,
  );
  return sha256Hex(preimage);
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
  supersedes: string | null;
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
    // §4.1 "required iff on-acceptance; default P5D"
    acceptance_window:
      opts.acceptance_window !== undefined
        ? opts.acceptance_window
        : closure_policy === 'on-acceptance'
          ? 'P5D'
          : null,
    blocked_by: opts.blocked_by ?? [],
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
