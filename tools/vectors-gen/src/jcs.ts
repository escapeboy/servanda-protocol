/**
 * RFC 8785 (JCS) canonical JSON serialization.
 *
 * Spec reference: spec/00-overview.md — "Canonical JSON per RFC 8785 (JCS). Any object
 * with a defined schema has exactly one canonical byte representation; hashes and
 * signatures are computed over it."
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * RFC 8785 §3.2.3: object keys sort as arrays of UTF-16 code units. JavaScript's
 * relational operators on strings compare exactly that way, so this comparator is the
 * literal rule rather than a locale-dependent approximation (never use localeCompare).
 */
function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * RFC 8785 §3.2.2.3 mandates ECMAScript's Number::toString, which is precisely what
 * JSON.stringify emits for finite numbers (including the "1e+30" / "5e-324" forms).
 * The one divergence worth pinning: negative zero serializes as "0".
 */
function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`JCS: non-finite number cannot be serialized: ${n}`);
  }
  if (Object.is(n, -0)) return '0';
  return JSON.stringify(n) as string;
}

/**
 * JSON.stringify already performs RFC 8259 minimal string escaping (\" \\ \b \f \n \r \t,
 * and \u00xx for the remaining control characters), which is what RFC 8785 §3.2.2.2
 * requires. Lone surrogates are escaped rather than silently replaced.
 */
function serializeString(s: string): string {
  return JSON.stringify(s);
}

export function canonicalize(value: Json): string {
  if (value === null) return 'null';

  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') return serializeNumber(value as number);
  if (t === 'string') return serializeString(value as string);

  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }

  if (t === 'object') {
    const obj = value as { [k: string]: Json };
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(compareUtf16);
    return (
      '{' +
      keys.map((k) => serializeString(k) + ':' + canonicalize(obj[k])).join(',') +
      '}'
    );
  }

  throw new Error(`JCS: unsupported type ${t}`);
}

/** Canonical form as UTF-8 bytes — the actual preimage for hashing and signing. */
export function canonicalBytes(value: Json): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
