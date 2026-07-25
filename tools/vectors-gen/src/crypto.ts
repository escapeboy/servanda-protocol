/**
 * Cryptographic primitives fixed by spec/09-threat-model.md §9.3:
 *   Sign: Ed25519 · Hash: SHA-256 · Canonicalization: RFC 8785 JCS
 *   Derivation: SLIP-0010 hardened paths from a BIP-39 seed
 *
 * spec/00-overview.md: "All signatures Ed25519 over the SHA-256 of the canonical form."
 * Combined with the per-object notes ("over canonical form sans sig"), the preimage is
 * sha256(JCS(object minus its signature field)) and Ed25519 signs that 32-byte digest.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import { mnemonicToSeedSync } from '@scure/bip39';
import { canonicalBytes, canonicalize, type Json } from './jcs.js';

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sha256Hex(bytes: Uint8Array): string {
  return toHex(sha256(bytes));
}

/** sha256 over the JCS canonical form of an object. */
export function digest(value: Json): Uint8Array {
  return sha256(canonicalBytes(value));
}

export function digestHex(value: Json): string {
  return toHex(digest(value));
}

/** The canonical string, for embedding in vectors so implementers can diff byte-for-byte. */
export { canonicalize };

// ---------------------------------------------------------------------------
// SLIP-0010 (ed25519) — spec/01-identity.md §1.1–§1.2
// ---------------------------------------------------------------------------

const ED25519_CURVE = new TextEncoder().encode('ed25519 seed');
const HARDENED_OFFSET = 0x80000000;

export interface ExtendedKey {
  key: Uint8Array; // 32-byte private scalar seed
  chainCode: Uint8Array; // 32 bytes
}

export function slip10Master(seed: Uint8Array): ExtendedKey {
  const I = hmac(sha512, ED25519_CURVE, seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/**
 * SLIP-0010 ed25519 supports hardened derivation only:
 *   Data = 0x00 || ser256(k_par) || ser32(index + 2^31)
 */
export function slip10DeriveHardened(parent: ExtendedKey, index: number): ExtendedKey {
  if (index >= HARDENED_OFFSET) {
    throw new Error('pass the unhardened index; the hardened bit is applied here');
  }
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parent.key, 1);
  new DataView(data.buffer).setUint32(33, index + HARDENED_OFFSET, false);

  const I = hmac(sha512, parent.chainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/** BIP-39 mnemonic → 64-byte seed (PBKDF2-HMAC-SHA512, 2048 iterations). */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedSync(mnemonic, passphrase);
}

export interface Persona {
  index: number;
  path: string;
  privateKey: Uint8Array;
  chainCode: Uint8Array;
  publicKey: Uint8Array;
  /** spec §1.2: persona_id = hex(pubkey) */
  personaId: string;
}

/** spec/01-identity.md §1.2: personas are hardened SLIP-0010 children at m/7391'/{i}'. */
export const PURPOSE_CONSTANT = 7391;

export function derivePersona(seed: Uint8Array, personaIndex: number): Persona {
  const master = slip10Master(seed);
  const purpose = slip10DeriveHardened(master, PURPOSE_CONSTANT);
  const child = slip10DeriveHardened(purpose, personaIndex);
  const publicKey = ed25519.getPublicKey(child.key);
  return {
    index: personaIndex,
    path: `m/${PURPOSE_CONSTANT}'/${personaIndex}'`,
    privateKey: child.key,
    chainCode: child.chainCode,
    publicKey,
    personaId: toHex(publicKey),
  };
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign an object: Ed25519 over sha256(JCS(object without `sig`)).
 * Returns the hex signature; the caller re-attaches it as `sig`.
 */
export function signObject(obj: Record<string, Json>, privateKey: Uint8Array): string {
  const { sig: _omit, ...rest } = obj as Record<string, Json> & { sig?: Json };
  const preimage = digest(rest as Json);
  return toHex(ed25519.sign(preimage, privateKey));
}

export function verifyObject(
  obj: Record<string, Json>,
  sigHex: string,
  publicKey: Uint8Array,
): boolean {
  const { sig: _omit, ...rest } = obj as Record<string, Json> & { sig?: Json };
  const preimage = digest(rest as Json);
  try {
    return ed25519.verify(fromHex(sigHex), preimage, publicKey);
  } catch {
    return false;
  }
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`odd-length hex: ${hex}`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
