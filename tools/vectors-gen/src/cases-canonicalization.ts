/**
 * RFC 8785 (JCS) canonicalization cases.
 *
 * `input` is stored as a raw JSON *string* so the committed vector preserves the original
 * member order and number spelling — parsing it into an object first would destroy exactly
 * what these cases test.
 */

export interface CanonicalizationCase {
  name: string;
  description: string;
  input: string;
}

export const CANONICALIZATION_CASES: CanonicalizationCase[] = [
  {
    name: 'key-ordering-flat',
    description: 'Members are reordered lexicographically; input order is discarded.',
    input: '{"b":1,"a":2,"C":3,"_":4}',
  },
  {
    name: 'key-ordering-nested',
    description: 'Sorting applies at every nesting depth, including inside arrays.',
    input: '{"z":{"y":1,"x":2},"a":[{"q":1,"p":2},{"n":3,"m":4}]}',
  },
  {
    name: 'key-ordering-unicode-bmp',
    description:
      'RFC 8785 §3.2.3 example: sort by UTF-16 code units — "$" (U+0024) < "¢" (U+00A2) < "€" (U+20AC).',
    input: '{"\\u20ac":"euro","\\u00a2":"cent","$":"dollar"}',
  },
  {
    name: 'key-ordering-non-bmp',
    description:
      'THE discriminating case: "😀" is U+1F600 but serializes as surrogates D83D DE00, so UTF-16 ' +
      'ordering places it BEFORE U+FFFF. A code-point sort would place it after — an implementation ' +
      'that sorts by code point fails here and nowhere else.',
    input: '{"\\ud83d\\ude00":"non-bmp","\\uffff":"bmp-max","A":"ascii"}',
  },
  {
    name: 'key-ordering-prefix',
    description: 'A key that is a prefix of another sorts first; empty key sorts before all.',
    input: '{"ab":1,"a":2,"":3,"abc":4}',
  },
  {
    name: 'string-escapes-control',
    description:
      'Minimal escaping per RFC 8259 §7: the two-character forms where they exist, \\u00xx otherwise. ' +
      'Note DEL (U+007F) is NOT escaped.',
    input:
      '{"s":"quote:\\" backslash:\\\\ bs:\\b ff:\\f lf:\\n cr:\\r tab:\\t nul:\\u0000 unit:\\u001f del:\\u007f"}',
  },
  {
    name: 'string-escapes-solidus',
    description:
      'Forward slash MUST NOT be escaped, and \\u0041 MUST collapse to the literal character.',
    input: '{"s":"a/b","t":"\\u0041\\u0042"}',
  },
  {
    name: 'unicode-no-normalization',
    description:
      'JCS does not apply Unicode normalization: precomposed é (U+00E9) and decomposed e+U+0301 ' +
      'remain two distinct strings and two distinct keys.',
    input: '{"nfc":"\\u00e9","nfd":"e\\u0301"}',
  },
  {
    name: 'numbers-integers',
    description: 'Integer forms, including negative zero which canonicalizes to "0".',
    input: '{"zero":0,"negzero":-0,"one":1,"neg":-1,"maxsafe":9007199254740991}',
  },
  {
    name: 'numbers-trailing-zeros',
    description: 'Trailing fraction zeros and explicit positive exponents are normalized away.',
    input: '{"a":1.0,"b":1.50,"c":100.0,"d":1e2,"e":1E+2}',
  },
  {
    name: 'numbers-exponent-boundaries',
    description:
      'ECMAScript Number::toString switches to exponential notation at 1e21; 1e20 stays positional. ' +
      'This boundary is the most commonly mis-implemented part of RFC 8785 §3.2.2.3.',
    input: '{"e20":1e20,"e21":1e21,"e30":1e30,"neg7":1e-7,"neg6":1e-6}',
  },
  {
    name: 'numbers-extremes',
    description:
      'Smallest denormal (5e-324) and largest finite double — both must round-trip exactly.',
    input: '{"min_denormal":5e-324,"max_double":1.7976931348623157e308}',
  },
  {
    name: 'numbers-fractions',
    description: 'Fractions that are not exactly representable keep their shortest round-trip form.',
    input: '{"tenth":0.1,"third":0.3333333333333333,"sum":0.30000000000000004}',
  },
  {
    name: 'literals-and-empty-containers',
    description: 'Literals, empty object and empty array.',
    input: '{"t":true,"f":false,"n":null,"eo":{},"ea":[]}',
  },
  {
    name: 'array-order-preserved',
    description: 'Array element order is data and MUST NOT be sorted, unlike object members.',
    input: '{"a":[3,1,2,"b","a",{"z":1,"y":2}]}',
  },
  {
    name: 'toplevel-array',
    description: 'A top-level array is a valid canonicalization input.',
    input: '[{"b":1,"a":2},[],null,true,1.0]',
  },
];
