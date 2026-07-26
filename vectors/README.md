# Test vectors

Language-neutral JSON vectors for the Servanda protocol — the executable half of the
specification. An implementation claims conformance by passing these
(see [GOVERNANCE.md](../GOVERNANCE.md): *"implements Servanda" means "passes the conformance suite"*).

**These files are generated.** Do not edit them by hand — CI regenerates them and fails on any
byte of drift. To change a vector, change [`tools/vectors-gen/`](../tools/vectors-gen) and re-run
`npm run generate`.

```
canonicalization/jcs.json          16 cases   RFC 8785 canonical form + sha256
hashing/commitment-hash.json       14 cases   §3.2 five-field commitment_hash
signatures/signatures.json          5 cases   Ed25519 over sha256(JCS(obj sans sig))
derivation/persona-keys.json        5 personas BIP-39 → SLIP-0010 m/7391'/{i}'
transitions/valid.json              7 cases   sequences a node MUST accept
transitions/invalid.json           19 cases   sequences a node MUST reject (M-14)
addressing/inbox-records.json       4 cases   §6.7 inbox records; hub-signed record rejected (M-17)
addressing/oob-bootstrap.json       2 cases   §6.7 URL/QR bootstrap payload, encode→decode→verify
schema/*.schema.json                          JSON Schemas, validated in CI
```

## How to consume them

Every file carries `protocol_version`, `spec_reference` and a per-case `description`. No case
requires reading the generator to understand.

- **canonicalization** — `input` is raw JSON *text* (member order and number spelling preserved on
  purpose). Parse it, canonicalize, compare to `canonical` byte for byte; `sha256` is over the
  UTF-8 bytes of `canonical`.
- **hashing** — recompute `sha256(JCS(subset))` over the five fields named in `hashed_fields`.
  Cases with `same_hash_as_base: true` must produce a hash *identical* to `base_commitment_hash`;
  the rest must differ.
- **signatures** — recompute `sha256_preimage` from `unsigned_object`, then verify `signature`
  against `signer.persona_id` (the public key). The `sig` field is excluded from its own preimage.
- **derivation** — derive from `mnemonic` and check every field, including `chain_code`.
- **transitions** — feed `assertions` to your verifier in order against `edge`. Each
  `expected_outcomes[i]` states whether that assertion is accepted and, if not, why.
  `expected_final_state` is the state after the whole chain.
- **addressing/inbox-records** — verify each `record` against the key named in its own `persona`
  field (§1.2: the persona_id *is* the public key). `known_keys` exists only so a verifier can
  report *which* other key signed a rejected record; a verifier without it still rejects, as
  `invalid-signature`. `hub_queue_ttl` is a fixture constant, not a test — see below.
- **addressing/oob-bootstrap** — base64url-decode the URL fragment, parse, and verify the
  signature against `sender.persona_id` using nothing else. `decoded_equals_original` and
  `edge_equals_original` are the round-trip assertions.

> ⚠️ **`derivation/persona-keys.json` contains private keys.** They derive from published BIP-39
> test mnemonics (all-zero and all-`0x7f` entropy) and are public knowledge. Never use them for
> anything real.

## The invalid transition vectors are the point

§4.3 says *"Any assertion violating this table is invalid and MUST be discarded"*, and M-14
restates it. A verifier that accepts a `confirmed` assertion signed by the owner rather than the
counterparty has silently discarded the entire confirm-first guarantee — but it will still pass
every positive test. The 19 negative cases exist so that failure is loud. They include:

- owner self-confirming their own proposal (M-2), and a non-party signing (M-3)
- an assertion attributed to `by: <counterparty>` but signed with the owner's key
- closure by the wrong party, and closure with a null `evidence_hash`
- release asserted by the owner instead of `owed_to`
- expiry on a null `due`, and expiry before `due`
- an owner recording tacit acceptance *before* the acceptance window elapsed
- supersession double-signed by one party instead of both

## The addressing negatives say the same thing about §6.7

`addressing/inbox-records.json` carries one case that matters more than the other three: an inbox
record naming Alice as its `persona`, listing a hub she never chose, and signed by a **hub's** key.
§6.7 — *"Only the persona key may change its own hubs (a hub cannot 'move' its users)"* — and M-17
make it invalid. Accepting it would let any hub silently redirect another hub's users, which is
edge forgery moved from the ledger to the address book. The check that refuses it is one line and
needs no registry, because the persona_id is the verifying key.

`addressing/oob-bootstrap.json` pairs the round-trip with a payload whose `owed_to` was swapped
while keeping the original signature. It base64url-decodes and JSON-parses perfectly — neither
says anything about authenticity — and MUST fail verification. A courtesy renderer (§6.7, M-18)
that skips that check is a phishing surface rather than a renderer: a signed payload arriving over
an untrusted channel proves who signed it, never that the channel or the rendering page is
trustworthy.

**No time-travel test for hub TTL.** §6.7 recommends hubs queue for ≥ 30 days; the constant is
recorded in `hub_queue_ttl` and never asserted against a clock. Generation is clockless by rule,
and TTL expiry is not a correctness boundary anyway — §6.7 makes a lost queued message harmless,
because reconciliation (§6.4), not delivery, is the guarantee.

## Interpretations the generator had to make

The spec is DRAFT v0.1-pre and under-specified in the places below. The generator picks a concrete
behaviour so vectors can exist at all. **These choices are not normative** — each is filed as a
repository issue, and whichever way an issue resolves, the vectors change with it.

| # | Spec gap | What the vectors assume |
|---|---|---|
| 1 | §4.1 `edge_id = sha256(commitment_hash \|\| owner \|\| owed_to \|\| proposed_at)` — `\|\|` is undefined | Concatenation of the four values' **UTF-8 bytes**, in that order, no separator, no length prefix |
| 2 | §4.1 preimage omits `closure_policy`, `due`, `blocked_by`, `supersedes` | Two edges differing only in closure policy **share an `edge_id`**. The suite documents the collision rather than working around it |
| 3 | §4.3 `confirmed → open` is marked "(implicit)" with no signer | `confirmed` ≡ `open` as one effective state; an explicit `open` assertion is **rejected** |
| 4 | §4.4 `on-acceptance` describes three acts but §4.3 has no pending state | All three are `closed` assertions: owner+evidence opens the window, `owed_to` accepts, owner may re-assert after expiry. The verifier models an internal `pending-acceptance` state |
| 5 | §4.1 `acceptance_window` is "required iff on-acceptance; default P5D" — required *and* defaulted | Emitted explicitly as `P5D`; absent is treated as `P5D` |
| 6 | §4.3 `disputed → closed` "both parties" | Both parties must assert `closed`; one alone does not close |
| 7 | §4.5 supersession must reference the successor `edge_id`, but the §4.2 assertion schema has **no field able to carry it** | Verified only as "both parties asserted `superseded`". The successor link is unverifiable as specified |
| 8 | Signing preimage stated across two sections | `ed25519_sign(sha256(JCS(object minus "sig")), key)` |
| 9 | §6.7 says the out-of-band `propose` travels "in a URL/QR" but fixes no serialization | `base64url(JCS(message))`, unpadded, carried in the URL **fragment** so the payload never reaches a courtesy renderer's server |
| 10 | §6.7 `hubs` is an array and senders "SHOULD retry across declared hubs" — array order is not defined as a priority order | The vectors fix only that a multi-hub record is valid; no ordering semantics are asserted |

Item 7 is a genuine internal contradiction, not merely a gap: §4.5 states a requirement the wire
format cannot express.

## Regenerating

```bash
cd tools/vectors-gen
npm ci
npm run generate   # rewrite ../../vectors
npm test           # selfcheck (drift + crypto + verifier replay) then schema validation
```

`npm test` is what CI runs. It re-derives every key, re-canonicalizes every case, re-verifies every
signature, replays every transition chain, and diffs the result against what is committed.
Generation is deterministic: no clock, no randomness, no network.
