/**
 * Reference verifier and codec for §6.7 (addressing & offline delivery).
 *
 * Two objects live here:
 *
 *   1. The inbox record — `{ v, type:"inbox", persona, hubs, issued_at, sig }`. §6.7:
 *      "Only the persona key may change its own hubs (a hub cannot 'move' its users)."
 *      Conformance M-17. The whole rule reduces to one check: the record's signature must
 *      verify against the key named in `persona` — which IS the public key (§1.2), so a
 *      verifier needs no registry to enforce it.
 *
 *   2. The out-of-band bootstrap payload — a self-contained signed `propose` (§6.2)
 *      serialized for URL/QR transport, for a counterparty with no node and no inbox.
 *
 * INTERPRETATION: §6.7 says the payload travels "in a URL/QR" without fixing a
 * serialization. The vectors use base64url (unpadded) over the JCS canonical bytes,
 * carried in the URL *fragment* so the payload never reaches the courtesy renderer's
 * server. Not normative — filed as a repository issue.
 */

import { verifyObject, fromHex } from './crypto.js';
import { canonicalBytes, canonicalize, type Json } from './jcs.js';
import { signObject } from './crypto.js';
import type { Persona } from './crypto.js';

// ---------------------------------------------------------------------------
// Inbox records
// ---------------------------------------------------------------------------

export interface InboxRecord {
  v: string;
  type: 'inbox';
  persona: string;
  hubs: string[];
  issued_at: string;
  sig: string;
}

export type InboxRejectionReason =
  /** The signature does not verify against any key the verifier holds. */
  | 'invalid-signature'
  /** It verifies — but under a key that is not the persona's. M-17: a hub cannot move its users. */
  | 'signer-is-not-the-persona';

export interface KnownKey {
  label: string;
  personaId: string;
}

export interface InboxOutcome {
  accepted: boolean;
  reason?: InboxRejectionReason;
  /** Which known key actually produced the signature, when it was not the persona's. */
  signerLabel?: string;
}

export function makeInboxRecord(opts: {
  v: string;
  persona: string;
  hubs: string[];
  issued_at: string;
  signer: Persona;
  /** Flips one nibble of the signature — for the malformed-signature vector. */
  corruptSignature?: boolean;
}): InboxRecord {
  const unsigned = {
    v: opts.v,
    type: 'inbox' as const,
    persona: opts.persona,
    hubs: opts.hubs,
    issued_at: opts.issued_at,
  };
  let sig = signObject(unsigned as unknown as Record<string, Json>, opts.signer.privateKey);
  if (opts.corruptSignature) {
    sig = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
  }
  return { ...unsigned, sig };
}

/**
 * The `knownKeys` argument only sharpens the rejection *reason*. A node that received the
 * record from a hub knows that hub's key and can say "the hub signed this"; a node that
 * does not still rejects the record, just as `invalid-signature`.
 */
export function verifyInboxRecord(record: InboxRecord, knownKeys: KnownKey[] = []): InboxOutcome {
  const asJson = record as unknown as Record<string, Json>;

  if (verifyObject(asJson, record.sig, fromHex(record.persona))) {
    return { accepted: true };
  }
  for (const k of knownKeys) {
    if (k.personaId === record.persona) continue;
    if (verifyObject(asJson, record.sig, fromHex(k.personaId))) {
      return { accepted: false, reason: 'signer-is-not-the-persona', signerLabel: k.label };
    }
  }
  return { accepted: false, reason: 'invalid-signature' };
}

// ---------------------------------------------------------------------------
// Out-of-band bootstrap payload
// ---------------------------------------------------------------------------

/**
 * Fragment, not query string: the payload stays client-side, so a courtesy renderer
 * (§6.7 — which MUST NOT hold keys, M-18) never receives it server-side either.
 */
export const OOB_URL_PREFIX = 'https://servanda.example/bootstrap#';

export function encodeOob(message: Json): string {
  return Buffer.from(canonicalBytes(message)).toString('base64url');
}

export function decodeOob(encoded: string): Json {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Json;
}

export function oobUrl(encoded: string): string {
  return OOB_URL_PREFIX + encoded;
}

/** Returns null when the URL is not an OOB bootstrap link. */
export function payloadFromOobUrl(url: string): string | null {
  const hash = url.indexOf('#');
  return hash === -1 ? null : url.slice(hash + 1);
}

/** Canonical-form equality: JSON member order is not part of the object's identity. */
export function sameObject(a: Json, b: Json): boolean {
  return canonicalize(a) === canonicalize(b);
}
