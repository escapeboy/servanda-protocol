# The conformance driver protocol

An implementation under test (IUT) proves conformance by answering questions. This file
defines how the questions arrive and how the answers come back. It is the only thing an
implementer needs in order to be testable: everything else — which questions get asked,
what the right answers are — lives in `vectors/`, not here.

The protocol is deliberately the dullest thing that works. A conforming IUT is a loop
that reads a line, switches on a string, and writes a line.

## Why a subprocess and not a library

The runner spawns the IUT as a child process and speaks to it over stdin/stdout. It does
not import it, link it, or call into it.

That is the whole point. A runner that imports the thing it judges can only judge
implementations written in the runner's own language, which makes the conformance suite a
JavaScript test suite wearing a governance hat. §8 says the suite is what answers a
conformance claim, and with no registered mark it is the *only* thing that answers one —
so it has to be answerable by an implementation in any language, by anyone, without the
reference implementation present. A pipe is the cheapest boundary that guarantees that.

## Transport

Line-delimited JSON (NDJSON) in both directions.

- The runner writes one request per line to the IUT's **stdin**, `\n`-terminated, UTF-8.
- The IUT writes one response per line to its **stdout**, `\n`-terminated, UTF-8.
- No JSON value in a request or response may contain a raw newline — `JSON.stringify` and
  its equivalents already guarantee this, since JSON string escapes cover `U+000A`.
- **stderr is yours.** Log to it freely. The runner captures it and prints it only when a
  case fails, so it is the right place for diagnostics.

**Requests are strictly serialized.** The runner sends one request and waits for its
response before sending the next. An IUT never needs a queue, a scheduler, or concurrency.

**Lines can be large.** The `canonical-form-over-the-limit` bounds case carries an envelope
whose canonical form is 65537 octets, and the response echoes canonical forms of that size.
Do not read stdin with a fixed small buffer, and do not assume a line fits in 64 KiB.

## Messages

### Request

```json
{"id": "<opaque string>", "op": "<operation name>", "input": { ... }}
```

`id` is opaque to the IUT and MUST be echoed verbatim. The runner uses it to detect
desynchronization; it does not encode anything the IUT should parse.

### Response

Success:

```json
{"id": "<echoed>", "ok": true, "result": { ... }}
```

Failure:

```json
{"id": "<echoed>", "ok": false, "error": {"code": "<short-code>", "message": "<free text>"}}
```

An `ok: false` response fails the case. So does a missing field in `result`, an
unparsable line, an `id` that does not match, a response that never comes, and an IUT
that exits early. **There is no way to answer a case with silence.** An implementation
that does not implement a family fails that family; it does not skip it. That is a
deliberate design choice — a suite in which "no answer" reads as "no problem" cannot
support a conformance claim.

### Handshake

The first request is always:

```json
{"id": "hello", "op": "hello", "input": {"protocol": 1}}
```

The IUT MUST answer:

```json
{"id": "hello", "ok": true,
 "result": {"implementation": "acme-servanda", "version": "1.2.0",
            "protocol": 1, "ops": ["canonicalize", "commitment_hash"]}}
```

`ops` is the list of operations the IUT implements. Declaring an op absent is honest and
useful — the runner reports those cases as `declined` rather than as a crash, which tells
a reader *why* a level was not reached. It does not make them pass. `implementation` and
`version` are free-form strings reproduced in the report; they are the only strings in the
report the runner did not compute.

## Operations

Every `input` is assembled from a vector file. Every field named in a `result` below is
compared against a value pinned in that same vector. The runner holds no expected values
of its own.

| op | input | result |
|---|---|---|
| `canonicalize` | `{json_text}` | `{canonical, sha256}` |
| `commitment_hash` | `{commitment}` | `{commitment_hash, hash_preimage_canonical, hash_preimage_hex}` |
| `envelope_id` | `{envelope}` | `{id, canonical, id_preimage_hex}` |
| `envelope_bounds` | `{envelope, bound}` | `{measured, within_bounds}` |
| `clip_to_octets` | `{value, limit_octets}` | `{clipped}` |
| `bip39_seed` | `{mnemonic, passphrase}` | `{seed}` |
| `derive_key` | `{mnemonic, passphrase, path}` | `{path, chain_code, private_key, public_key, persona_id}` |
| `signing_preimage` | `{signed_object, signer, known_keys}` | `{canonical, sha256_preimage, verifies, reason}` |
| `verify_transitions` | `{edge, assertions}` | `{outcomes, final_state}` |
| `verify_inbox_record` | `{record, known_keys}` | `{canonical, accepted, rejection_reason, actual_signer}` |
| `oob_bootstrap` | `{message}` | `{canonical, payload_b64url, url, signature_verifies}` |
| `recover_request` | `{request}` | `{accepted, reason}` |
| `advertise_actions` | `{edge, assertions, viewer, window_elapsed, dispute_window_elapsed}` | `{effective_state, actions}` |
| `act` | `{edge, assertions, effective_state, call, window_elapsed, dispute_window_elapsed}` | `{accepted, rejection_reason, asserts}` |
| `judge_brief_slot` | `{slot}` | `{valid, rejection_reason}` |
| `grade_verification` | `{evidence}` | `{level, display_name, name_bearing, counterparty}` |

Notes on the shapes, where the shape encodes a rule:

- **`envelope_id`** may receive an envelope that already carries `id`. Removing it is part
  of the operation, not something the runner does first — `§2`'s "sans id" is the
  implementation's obligation and `envelope-id.json`'s `id_removal` block exists to check it.
- **`envelope_bounds`** measures against one named bound per call, because
  `bounds.json` pins `measured` in that bound's own unit as well as the verdict. Returning
  the right verdict from the wrong measurement is a bug the vector can see, so the protocol
  asks for both.
- **`signing_preimage`** asks for the preimage AND the verdict. `signer` is the persona_id the
  object claims; `verifies` is whether the signature checks out against it, and `reason` is
  `null` when it does. Until v0.2 this op asked for the preimage alone, because the family pinned
  no expectation — five positive cases and nothing to fail, which a `return true` verifier passed
  in full. The reasons are `signature-does-not-verify`, `signature-does-not-cover-this-object`
  and `signature-by-another-key`; an implementation that refuses everything fails on the
  positives, and one that refuses for the wrong reason fails on `reason`.

  `known_keys` is supplied for the same reason `verify_inbox_record` gets it: **`signature-by-
  another-key` is not decidable from a signed object and the persona it names.** Those two inputs
  separate "not a signature" from "not a signature over this object" and go no further; naming
  another key requires having one. The op asked for the distinction without supplying the means
  until an independent implementation hit it — and passed anyway, by accumulating keys seen in
  earlier families and relying on `derivation` being asked before `signatures`. That is an
  ordering dependency this document never stated and no implementer should have to discover.
  Supplying the keys never rescues a bad signature; it only lets a refusal say something true.

- **`dispute_window_elapsed` is a SECOND window and not the same one.** `window_elapsed` is
  §4.3's acceptance window, on `pending-acceptance`. `dispute_window_elapsed` is §4.4's, on
  `disputed` and `contested-closure`, and it is what gates the `expire` act — the third exit
  either party may take alone once the deadlock has stood long enough. They differ in length and
  they never apply to the same state, so deriving one from the other gets both wrong.

  It arrived with the `expire` cases, and it arrived late: the vectors were written and pinned
  before this line existed, which made them unpassable by construction — an implementation was
  being asked to decide on an input the runner never handed it. Caught by the independent
  implementation failing three cases it had no way to pass.

- **`advertise_actions`** and **`act`** receive `window_elapsed` as input. Generation is
  clockless and so is the runner: an IUT that reads a clock here is answering a different
  question than the one asked.
- **`act`** receives `effective_state`. The state is derivable from `edge` + `assertions`,
  and `verify_transitions` is where that derivation is judged; passing it here keeps a bug
  in the transition verifier from being counted twice.
- **`judge_brief_slot`** and `advertise_actions` are **not** given the §7 act vocabulary or
  the act→tool bindings, though the vector files carry them. Handing an implementation the
  vocabulary and then asking whether an act is in it tests list membership. The
  implementation is expected to know §7.
- **`grade_verification`** returns `counterparty` because `§7`'s `counterparty.origin` is
  what lets a name the node asserts be told from a label the viewer wrote — the distinction
  M-12 turns on.

## A minimal conforming IUT

```js
import { createInterface } from 'node:readline';

for await (const line of createInterface({ input: process.stdin })) {
  const { id, op, input } = JSON.parse(line);
  let response;
  try {
    response = { id, ok: true, result: dispatch(op, input) };
  } catch (err) {
    response = { id, ok: false, error: { code: 'error', message: String(err) } };
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}
```

The same shape in any language: read a line, parse, dispatch, print a line. If your
runtime buffers stdout, flush after every line — the runner waits for the response before
sending the next request, so a buffered answer is a deadlock rather than a slow answer.
