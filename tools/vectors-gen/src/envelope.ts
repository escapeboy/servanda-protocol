/**
 * §2 signal-envelope vectors: the `id` preimage and the M-19 bounds.
 *
 * §8 named both of these as gaps in its own suite — "M-19 is likewise unenforced by the suite:
 * there is no envelope vector family, so the §2 envelope `id` preimage is currently untested".
 * GOVERNANCE.md turns that admission into a consequence: a behaviour the suite does not cover is
 * not yet a conformance requirement. These files close it.
 */

import { canonicalize, canonicalBytes, type Json } from './jcs.js';
import { sha256Hex, toHex } from './crypto.js';
import { ALICE, BOB, DOMAIN_TAG, PROTOCOL_VERSION, domainSeparated } from './protocol.js';

/** §2, stated as data so a consumer can assert against the numbers rather than reimplement them. */
export const ENVELOPE_BOUNDS = {
  canonical_form_octets: 65536,
  payload_depth_below_payload: 8,
  refs_entries: 32,
  ref_value_octets: 2048,
  actor_label_octets: 200,
  payload_string_octets: 8192,
  canonicalizer_refusal_depth: 256,
} as const;

export interface EnvelopeSansId {
  v: string;
  type: 'envelope';
  source: string;
  kind: string;
  occurred_at: string;
  received_at: string;
  actor: { label: string; external_id: string | null };
  payload: Record<string, Json>;
  refs: { kind: string; value: string }[];
  persona: string;
  clipped?: true;
}

const ENCODER = new TextEncoder();

export function octets(s: string): number {
  return ENCODER.encode(s).length;
}

/** §2: id = sha256("servanda/0.1:envelope_id" || 0x00 || JCS(envelope with `id` removed)). */
export function envelopeIdPreimage(sansId: EnvelopeSansId): Uint8Array {
  return domainSeparated(DOMAIN_TAG.envelope_id, canonicalBytes(sansId as unknown as Json));
}

export function envelopeId(sansId: EnvelopeSansId): string {
  return sha256Hex(envelopeIdPreimage(sansId));
}

const BASE: EnvelopeSansId = {
  v: PROTOCOL_VERSION,
  type: 'envelope',
  source: 'github',
  kind: 'pr_comment',
  occurred_at: '2026-07-25T08:41:12Z',
  received_at: '2026-07-25T08:41:19Z',
  actor: { label: 'octavia', external_id: '4412' },
  payload: {
    body: 'I will add the integration tests for PaymentRetryService by Friday.',
    pr: 219,
  },
  refs: [
    { kind: 'url', value: 'https://github.com/acme/billing/pull/219#issuecomment-1' },
    { kind: 'commit', value: '9f2b1c4' },
  ],
  persona: ALICE.personaId,
};

interface IdCase {
  name: string;
  description: string;
  envelope_sans_id: EnvelopeSansId;
  canonical: string;
  id_preimage_hex: string;
  id: string;
  same_id_as_base: boolean;
}

function idCase(
  name: string,
  description: string,
  patch: Partial<EnvelopeSansId>,
  sameAsBase: boolean,
): IdCase {
  const env = { ...BASE, ...patch };
  return {
    name,
    description,
    envelope_sans_id: env,
    canonical: canonicalize(env as unknown as Json),
    id_preimage_hex: toHex(envelopeIdPreimage(env)),
    id: envelopeId(env),
    same_id_as_base: sameAsBase,
  };
}

export function buildEnvelopeIdCases(): IdCase[] {
  const cases: IdCase[] = [
    idCase('base', 'Reference envelope; every other case is compared against this id.', {}, true),

    // --- what the preimage covers ---
    idCase(
      'differs-in-source',
      '`source` is inside the canonical form, so it reaches the id.',
      { source: 'sentry' },
      false,
    ),
    idCase('differs-in-kind', '`kind` reaches the id.', { kind: 'push' }, false),
    idCase(
      'differs-in-occurred-at',
      'When the event happened reaches the id.',
      { occurred_at: '2026-07-25T08:41:13Z' },
      false,
    ),
    idCase(
      'differs-in-received-at',
      '`received_at` is the OBSERVING node’s clock, and it reaches the id like every other ' +
        'member. Two nodes that saw the same event at different moments therefore compute ' +
        'different ids — see the note on `determinism_scope`.',
      { received_at: '2026-07-25T08:41:20Z' },
      false,
    ),
    idCase(
      'differs-in-actor-label',
      '`actor.label` reaches the id.',
      { actor: { label: 'octavia-bot', external_id: '4412' } },
      false,
    ),
    idCase(
      'differs-in-actor-external-id-null',
      'null is hashed as the JSON literal, not omitted — an absent external_id and a null one ' +
        'are the same document only because the schema writes null.',
      { actor: { label: 'octavia', external_id: null } },
      false,
    ),
    idCase(
      'differs-in-payload',
      '`payload` is opaque to the core but not to the digest.',
      { payload: { body: 'I will add the integration tests by Monday.', pr: 219 } },
      false,
    ),
    idCase(
      'differs-in-refs-order',
      'JCS sorts OBJECT members; it does not reorder arrays. `refs` order is therefore part of ' +
        'the identity, and a connector that emits them in a different order emits a different ' +
        'envelope.',
      { refs: [BASE.refs[1]!, BASE.refs[0]!] },
      false,
    ),
    idCase(
      'differs-in-persona',
      '`persona` is a member of the envelope, so it reaches the id. Two personas observing one ' +
        'event compute two ids. This case exists to make that consequence checkable rather than ' +
        'inferred — see `determinism_scope`.',
      { persona: BOB.personaId },
      false,
    ),

    // --- `clipped`, which is inside the canonical form ---
    idCase(
      'clipped-true-changes-the-id',
      'M-19’s marking is a member of the envelope, not metadata beside it: an envelope that ' +
        'had to be clipped is a different document from one that did not.',
      { clipped: true },
      false,
    ),

    // --- unicode ---
    idCase(
      'unicode-payload',
      'Non-ASCII payload, exercising JCS string handling inside the id preimage.',
      {
        payload: {
          body: 'Изпрати офертата — до петък 😀',
          pr: 219,
        },
      },
      false,
    ),
  ];

  const baseId = cases[0]!.id;
  for (const c of cases) {
    const equal = c.id === baseId;
    if (equal !== c.same_id_as_base) {
      throw new Error(`envelope-id case "${c.name}": expected same_id_as_base=${c.same_id_as_base}, got ${equal}`);
    }
  }
  return cases;
}

export function buildEnvelopeId() {
  const cases = buildEnvelopeIdCases();
  // The one case that cannot be expressed as a patch: the same envelope carrying an `id` member.
  // Stripping it MUST reproduce the base id, which is the whole content of "sans id".
  const withId = { ...BASE, id: '0'.repeat(64) };
  const { id: _discarded, ...stripped } = withId;
  const strippedId = envelopeId(stripped as EnvelopeSansId);
  if (strippedId !== cases[0]!.id) {
    throw new Error('envelope-id: stripping `id` did not reproduce the base id');
  }

  return {
    description:
      'id = sha256("servanda/0.1:envelope_id" || 0x00 || JCS(envelope with `id` removed)). ' +
      'Cases with same_id_as_base=false prove the member reaches the digest. `id_preimage_hex` ' +
      'is the complete preimage as octets, tag and separator included, so the domain tag is ' +
      'checkable without reconstructing it.',
    domain_tag: {
      tag: DOMAIN_TAG.envelope_id,
      separator: '0x00',
      note:
        '§0: identifier preimages are domain-separated by a fixed ASCII tag followed by one ' +
        '0x00 octet. The tag contains no 0x00, so it is self-delimiting.',
    },
    id_removal: {
      description:
        'An envelope that already carries `id` hashes to the same value once `id` is removed. ' +
        'This is what "sans id" means and it is the only case that cannot be written as a patch ' +
        'over the base.',
      envelope_with_id: withId,
      id_after_removal: strippedId,
    },
    determinism_scope: {
      note:
        '§2 says two nodes observing the same source event and emitting the same source, kind, ' +
        'timestamps, actor, payload and refs MUST compute the same id. That list does not name ' +
        '`persona`, and `received_at` is the observing node’s own clock — yet both are members ' +
        'of the canonical form and both reach the digest, as `differs-in-persona` and ' +
        '`differs-in-received-at` show. These vectors encode the construction §2 defines ' +
        '(sha256 over JCS of the envelope sans id) and take no position on the sentence. See ' +
        'the upstream issue linked from the family README.',
      members_in_preimage: [
        'v',
        'type',
        'source',
        'kind',
        'occurred_at',
        'received_at',
        'actor',
        'payload',
        'refs',
        'persona',
        'clipped (when present)',
      ],
    },
    base_id: cases[0]!.id,
    cases,
  };
}

// ---------------------------------------------------------------------------
// M-19 bounds
// ---------------------------------------------------------------------------

interface BoundCase {
  name: string;
  description: string;
  bound: keyof typeof ENVELOPE_BOUNDS;
  /** Measured value of the thing the bound constrains, in the bound's own unit. */
  measured: number;
  /** §2: a node MUST reject an envelope that exceeds a bound rather than canonicalize it. */
  within_bounds: boolean;
  envelope_sans_id: EnvelopeSansId;
}

/** A string of exactly `n` octets, ending in a multi-byte scalar where that is possible. */
function asciiOf(n: number): string {
  return 'a'.repeat(n);
}

/** `n` octets total, whose final scalar is a 4-octet emoji — for boundary-splitting cases. */
function endingInEmoji(n: number): string {
  const emoji = '😀'; // 4 octets in UTF-8
  return 'a'.repeat(n - 4) + emoji;
}

function nest(depth: number): Json {
  let v: Json = 'leaf';
  for (let i = 0; i < depth; i++) v = { deeper: v };
  return v;
}

function boundCase(
  name: string,
  description: string,
  bound: keyof typeof ENVELOPE_BOUNDS,
  measured: number,
  withinBounds: boolean,
  patch: Partial<EnvelopeSansId>,
): BoundCase {
  return { name, description, bound, measured, within_bounds: withinBounds, envelope_sans_id: { ...BASE, ...patch } };
}

export function buildEnvelopeBounds() {
  const B = ENVELOPE_BOUNDS;

  const refsAt = Array.from({ length: B.refs_entries }, (_, i) => ({ kind: 'issue', value: `#${i + 1}` }));
  const refsOver = Array.from({ length: B.refs_entries + 1 }, (_, i) => ({ kind: 'issue', value: `#${i + 1}` }));

  const cases: BoundCase[] = [
    boundCase(
      'refs-at-the-limit',
      `Exactly ${B.refs_entries} refs entries is inside the bound.`,
      'refs_entries',
      B.refs_entries,
      true,
      { refs: refsAt },
    ),
    boundCase(
      'refs-over-the-limit',
      `${B.refs_entries + 1} refs entries exceeds it; a node MUST reject rather than canonicalize.`,
      'refs_entries',
      B.refs_entries + 1,
      false,
      { refs: refsOver },
    ),
    boundCase(
      'ref-value-at-the-limit',
      `A refs value of exactly ${B.ref_value_octets} octets is inside the bound.`,
      'ref_value_octets',
      B.ref_value_octets,
      true,
      { refs: [{ kind: 'url', value: asciiOf(B.ref_value_octets) }] },
    ),
    boundCase(
      'ref-value-over-the-limit',
      'One octet more is outside it. The bound is octets of UTF-8, not characters.',
      'ref_value_octets',
      B.ref_value_octets + 1,
      false,
      { refs: [{ kind: 'url', value: asciiOf(B.ref_value_octets + 1) }] },
    ),
    boundCase(
      'ref-value-multibyte-at-the-limit',
      `${B.ref_value_octets} octets ending in a 4-octet emoji — the same bound measured in ` +
        'octets, which is why a character count would admit this and a longer one alike.',
      'ref_value_octets',
      B.ref_value_octets,
      true,
      { refs: [{ kind: 'url', value: endingInEmoji(B.ref_value_octets) }] },
    ),
    boundCase(
      'actor-label-at-the-limit',
      `An actor label of exactly ${B.actor_label_octets} octets is inside the bound.`,
      'actor_label_octets',
      B.actor_label_octets,
      true,
      { actor: { label: asciiOf(B.actor_label_octets), external_id: '4412' } },
    ),
    boundCase(
      'actor-label-over-the-limit',
      'One octet more is outside it.',
      'actor_label_octets',
      B.actor_label_octets + 1,
      false,
      { actor: { label: asciiOf(B.actor_label_octets + 1), external_id: '4412' } },
    ),
    boundCase(
      'payload-string-at-the-limit',
      `A payload string of exactly ${B.payload_string_octets} octets is inside the bound.`,
      'payload_string_octets',
      B.payload_string_octets,
      true,
      { payload: { body: asciiOf(B.payload_string_octets) } },
    ),
    boundCase(
      'payload-string-over-the-limit',
      'One octet more must be truncated by the connector, and the envelope marked.',
      'payload_string_octets',
      B.payload_string_octets + 1,
      false,
      { payload: { body: asciiOf(B.payload_string_octets + 1) } },
    ),
    boundCase(
      'payload-depth-at-the-limit',
      `${B.payload_depth_below_payload} levels below \`payload\` itself is inside the bound. ` +
        'Depth is counted from `payload`’s own members downwards, so `payload.nested` is level 1.',
      'payload_depth_below_payload',
      B.payload_depth_below_payload,
      true,
      { payload: { nested: nest(B.payload_depth_below_payload) } },
    ),
    boundCase(
      'payload-depth-over-the-limit',
      'One level more is outside it.',
      'payload_depth_below_payload',
      B.payload_depth_below_payload + 1,
      false,
      { payload: { nested: nest(B.payload_depth_below_payload + 1) } },
    ),
  ];

  // The canonical-form bound is measured, not asserted: it is the one bound that depends on every
  // other member at once, so a case built to sit just inside it has to be weighed.
  const filler = (n: number) => ({ ...BASE, payload: { body: asciiOf(n) } });
  let lo = 0;
  let hi = B.canonical_form_octets;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (octets(canonicalize(filler(mid) as unknown as Json)) <= B.canonical_form_octets) lo = mid;
    else hi = mid - 1;
  }
  const atLimit = filler(lo);
  const overLimit = filler(lo + 1);
  const atLimitOctets = octets(canonicalize(atLimit as unknown as Json));
  const overLimitOctets = octets(canonicalize(overLimit as unknown as Json));
  if (atLimitOctets > B.canonical_form_octets || overLimitOctets <= B.canonical_form_octets) {
    throw new Error('envelope-bounds: failed to straddle the canonical-form bound');
  }
  cases.push(
    {
      name: 'canonical-form-at-the-limit',
      description:
        `The canonical form measures exactly ${atLimitOctets} octets, the largest this envelope ` +
        `shape reaches without exceeding ${B.canonical_form_octets}.`,
      bound: 'canonical_form_octets',
      measured: atLimitOctets,
      within_bounds: true,
      envelope_sans_id: atLimit,
    },
    {
      name: 'canonical-form-over-the-limit',
      description: `One payload octet more takes the canonical form to ${overLimitOctets}, outside the bound.`,
      bound: 'canonical_form_octets',
      measured: overLimitOctets,
      within_bounds: false,
      envelope_sans_id: overLimit,
    },
  );

  return {
    description:
      'M-19 / §2 bounds. Every case names the bound it sits on and whether it is inside it. ' +
      'A node MUST reject an envelope outside any bound rather than canonicalize it; a connector ' +
      'MUST clip rather than discard the observation. `measured` is in the bound’s own unit ' +
      '(octets of UTF-8, or a count), so a consumer can check the measurement as well as the verdict.',
    bounds: ENVELOPE_BOUNDS,
    clipping: {
      note:
        '§2: a truncation MUST fall on a Unicode scalar boundary — a clipped value MUST NOT ' +
        'contain a code point absent from the source. An envelope in which any member was clipped ' +
        'MUST carry `clipped: true` at the top level. `clipped` is ABSENT, not false, when nothing ' +
        'was clipped: it is a member of the canonical form, so `false` would change the id of ' +
        'every unclipped envelope ever emitted.',
      scalar_boundary_example: (() => {
        // Two 3-octet scalars straddling the cut. A naive truncation at exactly
        // `payload_string_octets` would slice the second `€` after one of its three octets and
        // emit a code point that is not in the source; the rule is to drop the whole scalar.
        const prefix = 'a'.repeat(B.payload_string_octets - 2);
        const source = prefix + '€€';
        const clipped = prefix;
        return {
          description:
            `A 3-octet scalar straddling the cut at ${B.payload_string_octets} octets. Taking ` +
            `the first ${B.payload_string_octets} octets would split it; clipping must fall back ` +
            `to ${octets(clipped)} and emit no partial code point.`,
          source_octets: octets(source),
          clipped_to_octets: octets(clipped),
          source,
          clipped,
        };
      })(),
      length_member: {
        note:
          'For each clipped string member `x` an envelope SHOULD carry `payload.x_length`, the ' +
          'length in octets of the value as OBSERVED — the pre-clip length, which is the number ' +
          'that cannot be recovered from the stored envelope.',
        example: {
          payload: { body: 'a'.repeat(16) + '…', body_length: B.payload_string_octets + 4096 },
          clipped: true,
        },
      },
    },
    canonicalizer_refusal: {
      note:
        'Independently of the envelope bounds, a canonicalizer MUST refuse a document nested more ' +
        `than ${B.canonicalizer_refusal_depth} levels deep and MUST report that refusal to its ` +
        'caller rather than failing with a platform-dependent stack error. This is a property of ' +
        'the canonicalizer, not of the envelope, so it is stated here rather than given a case.',
      depth: B.canonicalizer_refusal_depth,
    },
    cases,
  };
}
