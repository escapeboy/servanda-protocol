# Ratification packet — DRAFT v0.1-pre

**Purpose.** Every section below is a decision the spec author has to make once, in one pass,
before v0.1 freeze. Nine of the ten are *ratifications*: the reference implementation
(`escapeboy/servanda`) already took the narrowest reading available and filed an issue here
rather than resolving anything silently, so the question is whether the spec should now say what
the implementation already does. One (#15) is editorial and needs only corrected wording.

**This document decides nothing.** It supplies, per issue: the exact normative sentence(s) as
they stand today, the verified behaviour of the reference implementation with `file:line`, literal
prose to insert or replace, the concrete effect on the vector suite, and a confidence rating.
Where the spec genuinely admits more than one reading (#12, #5) both readings are presented and
neither is collapsed.

**Two hash preimages exist in the protocol** — `commitment_hash` (§3.2) and `edge_id` (§4.1).
`grep` over `spec/02`, `spec/05` and `spec/06` finds no third (no `envelope_id`, no other
`sha256(...)` construction). Any resolution that alters either one is marked **in bold** as a
breaking change to stored data, not merely to tests.

**Repositories cited.**

| Short form | Path | Role |
|---|---|---|
| *(bare path)* | `/Users/katsarov/htdocs/servanda-protocol` | this repo — spec, vectors, generator |
| `impl:` | `/Users/katsarov/htdocs/servanda` | reference implementation (read-only here) |

`impl:vendor/vectors/.SOURCE_COMMIT` = `e95ac96` — the implementation is pinned to this repo's
`e95ac96`, i.e. it has consumed every vector up to and including the §6.7 addressing work.

**One standing limitation.** Several issues cite ADR files (`ADR-0004`, `ADR-0010`, `ADR-0013`,
`ADR-0014`) and `docs/security.md` / `docs/identity`. Those live in the upstream Svod design vault,
not in this repo. Where an ADR could change a recommendation below it is marked `[unverified]`
inline. Nothing else in this packet rests on an unread source.

**Which vector files carry which identifier** (measured, not assumed — `grep -c` per file):

| Field | Files containing it |
|---|---|
| `edge_id` | `transitions/valid.json`, `transitions/invalid.json`, `signatures/signatures.json`, `addressing/oob-bootstrap.json` |
| `commitment_hash` | the four above **plus** `hashing/commitment-hash.json` |
| `acceptance_window`, `closure_policy` | `transitions/valid.json`, `transitions/invalid.json`, `addressing/oob-bootstrap.json` |

`canonicalization/jcs.json`, `derivation/persona-keys.json` and `addressing/inbox-records.json`
contain neither identifier and are unaffected by anything in this packet.

---

## §1 — Issue #17: `sig_old`/`sig_new` have no signing preimage

*Class: ratification. Labels: none (needs `normative-change`).*

### 1. What the spec says now

The universal signing rule, `spec/00-overview.md:29-30`:

> - All signatures Ed25519 over the SHA-256 of the canonical form.
> - Canonical JSON per RFC 8785 (JCS). Any object with a defined schema has exactly one canonical byte representation; hashes and signatures are computed over it.

**The exclusion of the signature field itself is never stated normatively anywhere in `spec/`.**
The only place it appears is an inline annotation inside §1.3's attestation example,
`spec/01-identity.md:30`:

> `"sig": "<ed25519 by org root over canonical form sans sig>"`

Issue #17 attributes the rule `ed25519_sign(sha256(JCS(object minus "sig")), private_key)` to
"§00 Conventions". That is not accurate: §00 says "the canonical form" and stops. The rule as
quoted is the *vectors'* `signing_rule` string plus interpretation 8 in
`vectors/README.md:103`. This matters, because it means the fix is not only to §1.7 — §0 is
missing the sentence that §1.7 contradicts.

The two affected objects, `spec/01-identity.md:66` (§1.7):

> **Rotation statement:** `{"type":"rotation", old:"<pubkey>", new:"<pubkey>", rotated_at, sig_old, sig_new?}`. With `sig_old`, continuity transfers automatically. Verifiers MUST treat `new` as the successor for all open edges of `old`.

and `spec/01-identity.md:62` (§1.6):

> **Persona-linking statement** (explicitly user-initiated only): `{type:"link", personas:[A,B], sig_A, sig_B}` — both persona keys sign; proves common ownership without exposing the root.

Note that the spec writes `sig_new?` — optional. Issue #17 quotes it without the `?`. The
optionality does not remove the contradiction (a lone `sig_old` still cannot exclude itself under
a rule keyed on the name `sig`) but it does mean the spec already treats `sig_old` as the
load-bearing signature, which is the reading the implementation adopted.

### 2. What the reference implementation does

Rotation is **not** simply "accepts both encodings", as issue #17's own
*Reference-implementation status* section says. It is narrower than that:

- `impl:packages/types/src/identity.ts:98-107` — `Rotation` parses `sig`, `sig_old` and `sig_new`,
  all optional, with a `.refine()` requiring `sig !== undefined || sig_old !== undefined`. A
  rotation carrying only `sig_new` fails to parse at all.
- `impl:packages/identity/src/rotation.ts:85-97` — when `sig` is present, `verifyObject` applies
  the universal rule literally: the preimage is the object minus `sig`, so any `sig_old`/`sig_new`
  members present are *inside* that preimage and cannot be stripped or swapped without
  invalidating `sig`.
- `impl:packages/identity/src/rotation.ts:104-110` — a `sig_old`-only rotation **does not verify by
  default**. It is rejected with `legacy-sig-old-encoding-unverifiable` and the detail string
  "§1.7 sig_old has no signing preimage defined by the spec (protocol issue #17)". A caller must
  opt in explicitly via `acceptLegacySigOld`, which then uses the documented non-normative
  preimage `sha256(JCS(rotationCore))` (`impl:.../rotation.ts:64-72, 112-121`).
- `impl:packages/identity/src/rotation.ts:125-138` (`signRotation`) emits only the single-`sig`
  form.
- Beyond the issue: `impl:.../rotation.ts:168-214` (`resolveSuccessor`) stops at a **fork** — two
  different verified rotations from the same `old` — because §1.7 gives no rule for choosing
  between two signed successors.

The `link` object took a **different** reading, and the asymmetry is deliberate and documented at
`impl:packages/identity/src/link.ts:8-23`: refusing the ambiguous encoding still leaves rotation
with a verifiable single-`sig` form, but it would make §1.6's link object *unimplementable*. So
`link` adopts one non-normative preimage, `impl:packages/identity/src/link.ts:46-49`:

```
preimage = sha256(JCS({v, type, personas}))     ← both A and B sign these same bytes
```

with each signature checked against its own position in `personas`, and identical `sig_A`/`sig_B`
rejected as `duplicate-signature` (`impl:.../link.ts:60-70`).

So the implementation is already living with *both* of issue #17's option 1 (rotation) and a
flattened form of option 3 (link). One §0 sentence can ratify both.

### 3. Proposed resolution text

**Insert into `spec/00-overview.md`, Conventions, immediately after the existing JCS bullet
(`:30`):**

> - **Signing preimage.** The preimage of every signature is `sha256(JCS(O))`, where `O` is the
>   object with every member whose name is `sig` or begins with `sig_` removed. A
>   single-signature object carries exactly one member, `sig`. A multi-signature object carries
>   one `sig_<role>` member per required signer; every signer therefore signs identical bytes,
>   and each signature MUST be verified against the key its role names. An object MUST NOT be
>   treated as signed unless every signature its schema declares as required verifies.

**Replace the first bullet of §1.7 (`spec/01-identity.md:66`) with:**

> - **Rotation statement:** `{"v":"servanda/0.1", "type":"rotation", "old":"<pubkey>",
>   "new":"<pubkey>", "rotated_at":"RFC3339", "sig":"..."}` where `sig` is by `old` over the §0
>   signing preimage. Implementations MUST emit this form. The signature by `old` is what
>   transfers continuity: verifiers MUST treat `new` as the successor for all open edges of
>   `old`. A rotation statement that carries no signature by `old` MUST be rejected; in
>   particular a statement signed only by `new` MUST be rejected, since it is precisely the
>   takeover this object exists to prevent. Where two distinct rotation statements from the same
>   `old` both verify, a verifier MUST NOT choose between them: continuity stops at the fork and
>   the identity MUST be reported as unresolved.

**Append to §1.6's persona-linking paragraph (`spec/01-identity.md:62`):**

> Both signatures cover the §0 multi-signature preimage — `sha256(JCS({v, type, personas}))` —
> and `sig_A` MUST verify against `personas[0]` and `sig_B` against `personas[1]`. A link whose
> two signature members are byte-identical MUST be rejected.

**Honest cost of this wording.** Because every signer covers identical bytes, `sig_new` (had it
been retained) would prove nothing that `sig_old` does not, and neither commits to the other's
presence. That is issue #17's stated objection to option 3, and this text does not solve it — it
removes `sig_new` from rotation instead, which is option 1. The residual gap is that no rotation
proves the new key's holder consented. The spec should say how that is mitigated; the natural
place is a `SHOULD` requiring the new key to sign its first assertion, which is issue #17's own
suggestion and is **not** currently implemented (`grep` finds no such check in
`impl:packages/identity/src/`). If the author wants that mitigation it is a new MUST/SHOULD and a
new vector, not a rewording.

### 4. Vector impact

`none`.

`vectors/signatures/signatures.json` already carries exactly one rotation case,
`rotation-statement`, generated at `tools/vectors-gen/src/generate.ts:292-296` with the comment
"§1.7: signed by the OLD key, transferring continuity to the new one (sig_old)" and emitting a
single `sig`. The proposed text ratifies that byte-for-byte, so the file does not change.

Two *additions* (not regenerations) would be needed for the new sentences to be enforceable:
a `link` signature case (there is none today — `grep 'link'` over
`tools/vectors-gen/src/` returns only an unrelated match in `addressing.ts:122`), and a negative
case for a rotation signed only by `new`. Per `GOVERNANCE.md`, until those exist the new sentences
are prose rather than conformance requirements.

### 5. Confidence

**High** on the diagnosis, on the implementation's behaviour, and on the two corrections to the
issue text (`sig_new?` is optional in the spec; `sig_old`-only does not verify by default). **The
choice among options 1/2/3 is the author's** — the text above encodes option 1 for rotation plus a
generalized §0 rule that makes the implementation's existing `link` behaviour normative, which is
the only combination that requires no vector regeneration and leaves no object unimplementable.
Option 2 (nested `statement` envelope) is cleaner for future multi-party objects but changes the
`rotation` and `link` wire shapes and therefore regenerates `vectors/signatures/signatures.json`.

---

## §2 — Issue #11: two edges differing only in `closure_policy` share an `edge_id`

*Class: ratification. Labels: `contradiction`, `normative-change`.*

### 1. What the spec says now

`spec/04-edge.md:9`:

> `"edge_id": "<sha256(commitment_hash || owner || owed_to || proposed_at)>"`

The same object, `spec/04-edge.md:14-19`, carries seven further members that the identifier does
not cover:

> ```json
> "due": "RFC3339 | null",
> "closure_policy": "on-evidence | on-acceptance",
> "acceptance_window": "ISO8601 duration | null (required iff on-acceptance; default P5D)",
> "blocked_by": [ "<edge_id>" ],
> "fulfillment": { ... },
> "supersedes": "<edge_id> | null"
> ```

And `spec/04-edge.md:28-29` shows that assertions bind only the identifier:

> `{ "v":"servanda/0.1", "type":"assertion", "edge_id":"...", "state":"<target>", "asserted_at":"RFC3339", "by":"<pubkey>", "evidence_hash":"<hex>|null", "sig":"..." }`

There is consequently no signature anywhere in the protocol that covers `closure_policy`. §4.4
(`spec/04-edge.md:51-52`) makes `closure_policy` decide who may close and whether an acceptance
window exists at all.

### 2. What the reference implementation does

It reproduces the collision deliberately rather than working around it, and says so in the source:
`impl:packages/crypto/src/identity-hash.ts:43-45`:

> Interpretation #2 (also upstream): the preimage omits closure_policy, due, blocked_by and
> supersedes, so two edges differing only in closure policy share an edge_id. Reproduced here
> rather than worked around, so the collision stays visible.

`edgeId` (`impl:.../identity-hash.ts:47-61`) hashes exactly the four values. `Edge`
(`impl:packages/types/src/edge.ts:97-113`) carries the uncovered members with no binding to
`edge_id`, and `verifyAssertionChain` (`impl:packages/node/src/transitions.ts:77`) checks only
`a.edge_id !== edge.edge_id` — the edge body it is handed is trusted as-is. There is **no**
check anywhere that a second edge body claiming the same `edge_id` conflicts with a body already
held; `grep 'edge_id' impl:packages/node/src/` shows no such comparison.

The generator makes the collision an explicit fixture, `tools/vectors-gen/src/cases-transitions.ts:68-79`:

> NOTE: EDGE_ACCEPTANCE and EDGE_EVIDENCE deliberately share an edge_id — the §4.1 preimage is
> sha256(commitment_hash || owner || owed_to || proposed_at) and does NOT cover [closure_policy].

Per issue #11 this was not theoretical: the `edge-id-mismatch` negative case originally used an
`on-evidence` and an `on-acceptance` edge as two "different" edges, they collided, and generation
failed. The committed case now differentiates by `proposed_at` instead.

### 3. Proposed resolution text

Two directions, and they differ in whether stored identifiers survive.

**Direction A — preserve the preimage, bind the body on first sight (recommended; no identifier
changes).** Append to §4.1, after the `fulfillment`/`due` note at `spec/04-edge.md:22`:

> The `edge_id` preimage covers only `commitment_hash`, `owner`, `owed_to` and `proposed_at`.
> The remaining members of the edge object are therefore NOT covered by the identifier and NOT
> covered by any assertion signature. A node MUST bind an `edge_id` to the first edge body it
> accepts for that identifier, and MUST reject any subsequent edge body bearing the same
> `edge_id` whose other members differ, with the whole body discarded rather than merged. A party
> MUST NOT sign a `confirmed` assertion for an `edge_id` it holds no edge body for. Where the two
> parties hold bodies that differ under one `edge_id`, the edge is unverifiable in the sense of
> M-8 and MUST NOT auto-escalate.

**Direction B — widen the preimage.** Replace `spec/04-edge.md:9` with:

> `"edge_id": "<sha256 of the §0 canonical form of the edge object with `edge_id` removed>"`

**Direction B changes the `edge_id` preimage. Every `edge_id` ever computed changes. That is a
breaking change to stored data — vaults, assertion chains, `blocked_by` arrays and `supersedes`
pointers all reference `edge_id` — not merely to tests.** It also makes `edge_id` un-computable
before the edge is complete, which interacts with `supersedes` (a successor's identifier depends
on a pointer to its predecessor, which is fine, but the reverse is not expressible).

### 4. Vector impact

- **Direction A:** `none`. No field and no preimage changes. `tools/vectors-gen/src/cases-transitions.ts:68-79`
  keeps the shared-`edge_id` fixture, which is now the documented consequence rather than an
  interpretation. Making the new MUST enforceable requires *adding* a negative case (two
  conflicting bodies under one `edge_id`) plus a `RejectionReason` value —
  `tools/vectors-gen/src/transitions.ts:17-30` and `vectors/schema/transitions.schema.json`'s
  `rejection_reason` enum are both closed lists, so the addition touches both.
- **Direction B:** `regenerates vectors/transitions/valid.json,
  vectors/transitions/invalid.json, vectors/signatures/signatures.json,
  vectors/addressing/oob-bootstrap.json` — every file that contains an `edge_id`
  (34, 71, 9 and 6 occurrences respectively). `vectors/hashing/commitment-hash.json` is
  unaffected because `commitment_hash` does not depend on `edge_id`.

### 5. Confidence

**High.** The collision, its reproduction in the implementation, the absence of any signature over
`closure_policy`, and the absence of any conflicting-body check are all verified. Direction A is
recommended because it closes the attack issue #11 describes (an attacker-supplied body with
`closure_policy` flipped) at zero cost to stored identifiers; the author may prefer B on
cleanliness grounds, and the bolded cost is the whole of the trade-off.

---

## §3 — Issue #13: §4.4 describes three acts, §4.3 has one row

*Class: ratification. Labels: `contradiction`, `normative-change`.*

### 1. What the spec says now

`spec/04-edge.md:52`:

> - `on-acceptance` (MUST be the default for cross-person edges): owner's evidence assertion opens the acceptance window; owed_to MAY sign `closed` (explicit accept) or `disputed` within the window; window expiry = tacit acceptance — the owner's node MAY then record final `closed` citing window expiry.

The §4.3 table offers one row for all three, `spec/04-edge.md:40`:

> | open | closed | per closure_policy (4.4) | |

There is no state between `open` and `closed`, so acts 1 and 3 — both `closed` assertions by the
owner — are indistinguishable in the wire object. "citing window expiry" also has no field to
cite in: the §4.2 assertion object (`spec/04-edge.md:28-29`) has no such member.

### 2. What the reference implementation does

It models an internal, non-wire `pending-acceptance` state and labels it as an interpretation
rather than spec text. `impl:packages/types/src/edge.ts:61-72`:

> - `pending-acceptance`: models the §4.4 acceptance window, which §4.3 has no row for. This is
>   the vectors' interpretation #4, not normative spec text.

`pending-acceptance` is in `EffectiveState` (`impl:.../edge.ts:65`) but **not** in
`WireAssertionState` (`impl:.../edge.ts:39-48`) or `AssertableState` (`:19-27`) — it is never a
value any assertion carries. The three acts are dispatched inside the single `closed` branch,
`impl:packages/node/src/transitions.ts:115-157`:

- `ctx.state === 'open'` → owner only, `evidence_hash` REQUIRED; under `on-evidence` this closes,
  under `on-acceptance` it sets `pending-acceptance` and records `window_opened_at` (`:116-129`).
- `ctx.state === 'pending-acceptance'` and signer is `owed_to` → explicit accept, closes (`:131-136`).
- `ctx.state === 'pending-acceptance'` and signer is owner → tacit acceptance, but **only** once
  `windowElapsed` is true, else `acceptance-window-not-elapsed` (`:137-144`).
- `disputed` sets `ctx.state = 'disputed'` (`:183`) — and unlike the generator, the node does
  **not** clear `window_opened_at`. It does not need to: `disputed` is not in `OPEN_FAMILY`
  (`impl:.../transitions.ts:32`), so no `closed` assertion can re-enter the pending path; the
  `disputed → closed` branch requires both parties (`:146-155`). The generator's verifier does
  clear it (`tools/vectors-gen/src/transitions.ts:257`). Both reach the same outcome.

`resolved_at` (`impl:.../transitions.ts:41`) is set from the *closing* assertion's `asserted_at`,
which is how retention (§5.4) avoids depending on a wall clock.

Answer to issue #13's fourth question, verified: **a `disputed` assertion cancels the window.**
It is neither paused nor still running — there is no path back to `pending-acceptance`.

### 3. Proposed resolution text

**Replace the `open → closed` row of the §4.3 table (`spec/04-edge.md:40`) with these three
rows,** keeping the wire vocabulary unchanged (no new assertable state):

> | open | closed | owner, `evidence_hash` REQUIRED | under `on-evidence` this closes the edge; under `on-acceptance` it opens the acceptance window (4.4) |
> | pending-acceptance | closed | **owed_to alone** | explicit acceptance |
> | pending-acceptance | closed | owner, only once the window has elapsed | tacit acceptance; before the window elapses the assertion is invalid |
> | pending-acceptance | disputed | either party, `evidence_hash` REQUIRED | cancels the acceptance window |

**and append to §4.3, after the discard sentence at `spec/04-edge.md:47`:**

> `pending-acceptance` is a state a node computes; it is never a value carried in an assertion's
> `state` member. An `on-acceptance` edge enters it when the owner's evidence assertion is
> accepted, and the node MUST record the `asserted_at` of that assertion as the instant from
> which `acceptance_window` runs. A `closed` assertion by the owner from `pending-acceptance`
> MUST be discarded unless `asserted_at` is greater than or equal to that instant plus
> `acceptance_window`. Once a `disputed` assertion is accepted the acceptance window is cancelled;
> the edge MUST NOT re-enter `pending-acceptance`, and the only exits are those the
> `disputed` rows provide. A node MUST NOT infer act 1 from act 3 or vice versa by inspecting the
> assertion alone: which act a `closed` assertion by the owner performs is determined by the
> state the chain was in when it arrived.

**Also strike "citing window expiry" from `spec/04-edge.md:52`** — the assertion object has no
field to cite in, and under the rows above the citation is unnecessary because the source state
already carries the meaning. Replace that clause with "the owner's node MAY then record a final
`closed`".

### 4. Vector impact

`none`.

The three-act dispatch, the internal state name, and the elapsed-window check are already what
the committed vectors encode: `vectors/transitions/valid.json` cases
`on-acceptance-explicit-accept` and `on-acceptance-tacit-expiry`,
`vectors/transitions/invalid.json` case `tacit-close-before-window-elapsed`, and one case whose
`expected_final_state` is literally `pending-acceptance`
(`tools/vectors-gen/src/cases-transitions.ts:480`). `pending-acceptance` is already an accepted
`expected_final_state` value and `acceptance-window-not-elapsed` an already-listed
`rejection_reason` in `vectors/schema/transitions.schema.json`. The proposed text describes the
committed suite rather than changing it.

Contrast with issue #13's own *Suggested fix*, which proposes adding `pending-acceptance` as a
real wire state (`open → pending-acceptance` as an assertable transition). **That would change
the `state` member of the owner's evidence assertion from `closed` to `pending-acceptance`, which
changes that assertion's signing preimage and therefore its `sig` — regenerating
`vectors/transitions/valid.json` and `vectors/transitions/invalid.json`.** It changes no hash
identifier, but every stored evidence assertion would need re-signing. The wording above avoids
that; if the author prefers the explicit wire state, the vector cost is that regeneration.

### 5. Confidence

**High.** Every branch, the `disputed`-cancels-the-window answer, and the vector case names are
verified against source. The one judgement call is whether `pending-acceptance` should be a
computed state (recommended, matches the implementation, costs nothing) or a wire state (issue
#13's suggestion, costs a regeneration).

---

## §4 — Issue #9: `superseded` must reference the successor, but no field carries it

*Class: ratification. Labels: `normative-change`.*

### 1. What the spec says now

`spec/04-edge.md:57` (§4.5):

> New edge (new `commitment_hash` if content changed; new `edge_id` always) with `supersedes` set. Valid only when both parties of the OLD edge have signed `superseded` assertions referencing the new `edge_id`. Delegation: the new edge's owner differs → additionally requires the new owner's `proposed` signature (three keys total across the two edges). History is never deleted.

The complete assertion object, `spec/04-edge.md:28-29`, has no member able to carry a successor:

> `{ "v":"servanda/0.1", "type":"assertion", "edge_id":"...", "state":"<target>", "asserted_at":"RFC3339", "by":"<pubkey>", "evidence_hash":"<hex>|null", "sig":"..." }`

`edge_id` names the edge being asserted *about* — the old one. `evidence_hash` is a SHA-256 of an
evidence bundle. §4.3's `open → superseded` row (`spec/04-edge.md:42`) says only "owner + owed_to
(both assert)" and points the successor link at the *new* edge's `supersedes` member, which the
old edge's parties never sign.

This is the one item `vectors/README.md:107-108` calls out as a genuine internal contradiction
rather than a gap: "§4.5 states a requirement the wire format cannot express."

### 2. What the reference implementation does

It verifies the countable half and silently cannot verify the other half.
`impl:packages/node/src/transitions.ts:187-200`:

- rejects `superseded` unless the state is in `OPEN_FAMILY` or `disputed` (`:188-190`);
- rejects a second `superseded` by the same party as `duplicate-assertion-by-same-party`
  (`:193`) — "One party signing twice is not two parties";
- sets state `superseded` once `ctx.superseded_by.size === 2` (`:195-198`).

`ctx.superseded_by` is a `Set<string>` of signer keys (`impl:.../transitions.ts:50-51`). **The
successor is never read, compared, or required** — the function has no access to a successor
identifier because the assertion carries none.

The successor link is checked only from the new edge's own pointer, and only in end-to-end tests:
`impl:packages/e2e/test/scenario-5-cross-org.test.ts:522`
(`expect(successor.supersedes).toBe(parent.edge_id)`) and
`impl:packages/e2e/test/scenario-4-team.test.ts:484`. `grep 'supersedes_with'` over
`impl:packages/` returns nothing — the field issue #9 proposes does not exist.

So issue #9's failure case is live in the implementation as it stands: Alice signs `superseded`
intending edge X, Bob signs `superseded` intending edge Y, both are accepted, the old edge
becomes `superseded`, and nothing detects that the parties disagree about what replaced it.

### 3. Proposed resolution text

Two directions. Unlike the other sections, ratifying here means ratifying a known hole.

**Direction A — ratify: define supersession as the implementation verifies it (option 3 in issue
#9).** Replace the second sentence of §4.5 (`spec/04-edge.md:57`) with:

> Valid only when both parties of the OLD edge have signed `superseded` assertions for it. The
> successor is named by the NEW edge's `supersedes` member only; the §4.2 assertion object
> carries no successor reference, so the parties' `superseded` assertions bind them to the fact
> of supersession and NOT to the identity of the successor. A verifier MUST NOT report the
> successor link as agreed by both parties. A node presenting a superseded edge MUST distinguish
> "both parties agreed this edge is superseded" from "this successor claims to supersede it", and
> MUST NOT present a successor whose `supersedes` pointer it has not itself verified against an
> edge body it holds.

**Direction B — make the requirement expressible (option 1 in issue #9).** Add to the §4.2
assertion object (`spec/04-edge.md:28-29`):

> `"supersedes_with": "<edge_id> | null"`

and replace §4.5's second sentence with:

> Valid only when both parties of the OLD edge have signed `superseded` assertions whose
> `supersedes_with` names the same new `edge_id`, and that `edge_id` MUST equal the identifier of
> an edge whose `supersedes` member names this edge. `supersedes_with` MUST be non-null when
> `state` is `superseded` and MUST be null otherwise. Where the two parties' `supersedes_with`
> values differ, neither assertion supersedes the edge: the edge remains in its prior state and
> the conflict MUST be surfaced.

Direction B is what actually closes the hole. Direction A documents it honestly and defers.
Issue #9's option 2 (overloading `evidence_hash`) is not proposed here: it makes a field's name
lie, and `evidence_hash` is already load-bearing in four transition rules
(`spec/04-edge.md:44`, `:51`, and both closure branches).

### 4. Vector impact

- **Direction A:** `none`. `vectors/transitions/valid.json` case `supersession-needs-both-parties`
  and `vectors/transitions/invalid.json` cases `supersession-double-signed-by-one-party` and
  `superseded-by-third-party` already verify exactly "both parties, distinct" and nothing about
  the successor. Interpretation 7 in `vectors/README.md:102` becomes normative text.
- **Direction B:** `regenerates vectors/transitions/valid.json, vectors/transitions/invalid.json`
  and requires `vectors/schema/common.schema.json` (the `assertion` definition, whose `required`
  list is the closed set `[v, type, edge_id, state, asserted_at, by, evidence_hash, sig]`) plus a
  new `rejection_reason` value in `vectors/schema/transitions.schema.json`.
  **A new member in the assertion object changes the signing preimage of every assertion that
  carries it — every stored `superseded` assertion would have to be re-signed.** This is a
  signature preimage change, not an identifier change: `commitment_hash` and `edge_id` are
  untouched, and `vectors/hashing/commitment-hash.json` does not regenerate. If the field is
  specified as REQUIRED-and-null on non-`superseded` assertions, the blast radius widens to
  *every* assertion in `vectors/transitions/*`, `vectors/signatures/signatures.json` (3 assertion
  cases) and `vectors/addressing/oob-bootstrap.json` (whose `propose` payload contains an
  assertion). Specifying it as absent-unless-`superseded` confines the change to supersession
  cases — worth stating explicitly whichever way it goes.

### 5. Confidence

**High** on the facts: the missing field, the set-counting verifier, the absence of
`supersedes_with`, and the live disagreement case. **The direction is the author's call and it is
a real one** — Direction A ships a documented hole in what `ADR-0010` calls the single lifecycle
primitive; Direction B costs a wire-format change before freeze, which is far cheaper now than
after. `[unverified]` — `ADR-0010` lives in the upstream Svod design vault, not in this repo; if
it already commits to a successor-binding guarantee, Direction A contradicts it and Direction B is
forced. Reading `ADR-0010` would settle this.

---

## §5 — Issue #10: `||` in the `edge_id` preimage is undefined

*Class: ratification. Labels: `normative-change`, `spec-ambiguity`.*

### 1. What the spec says now

`spec/04-edge.md:9`:

> `"edge_id": "<sha256(commitment_hash || owner || owed_to || proposed_at)>"`

`||` is defined nowhere in `spec/`. §0's conventions (`spec/00-overview.md:26-32`) cover
timestamps, hash algorithm, hex case and JCS, but say nothing about byte concatenation. The
candidate readings produce different digests and differ in the first byte: UTF-8 bytes of the hex
and RFC-3339 strings; raw decoded bytes (32 each for the three hex values); either with a
separator; either with length prefixes.

### 2. What the reference implementation does

UTF-8 bytes of the four values, in the listed order, no separator, no length prefix — and it says
why it chose that rather than reasoning from the spec.
`impl:packages/crypto/src/identity-hash.ts:38-41`:

> `||` is undefined in the spec. The conformance vectors define it as concatenation of the four
> values' UTF-8 bytes in that order, with no separator and no length prefix
> (vectors/README.md interpretation #1). Filed upstream; this implementation follows the vectors,
> which are the conformance oracle.

The code, `impl:.../identity-hash.ts:47-61`, is `sha256Hex(concatBytes(utf8(commitment_hash),
utf8(owner), utf8(owed_to), utf8(proposed_at)))`. The generator does the same,
`tools/vectors-gen/src/protocol.ts:94-104`, carrying the matching INTERPRETATION comment at
`:90-92`.

Note what makes the choice safe in practice even without length framing: `commitment_hash`,
`owner` and `owed_to` are all fixed-width 64-character lowercase hex
(`impl:packages/types/src/edge.ts:101-104` uses `Sha256Hex`/`PublicKeyHex`), so the only
variable-length element is the final one. Concatenation is unambiguous *given* those width
constraints — but the spec states the widths in the primitive descriptions, not in the preimage
rule, so the ambiguity issue #10 reports is real for an implementer reading §4.1 alone.

### 3. Proposed resolution text

**Replace `spec/04-edge.md:9`'s annotation and add the following paragraph to §4.1, after the
object (i.e. after `spec/04-edge.md:22`):**

> **`edge_id` preimage.** `||` denotes concatenation of octet strings with no separator and no
> length prefix. Each of the four values is converted to octets as its own UTF-8 encoding — that
> is, the ASCII text of the lowercase hex digest for `commitment_hash`, of the lowercase hex
> public keys for `owner` and `owed_to`, and of the RFC 3339 timestamp for `proposed_at` — and
> the four octet strings are concatenated in exactly that order. The preimage is unambiguous
> because the first three values are fixed-width (64 octets each); implementations MUST NOT
> decode the hex values to their 32-octet binary form before hashing. Worked example:
>
> ```
> commitment_hash  "9f86d0…"      64 octets   (offset   0 .. 63)
> owner            "3b6a27…"      64 octets   (offset  64 .. 127)
> owed_to          "d75a98…"      64 octets   (offset 128 .. 191)
> proposed_at      "2026-08-02T12:00:00Z"     (offset 192 .. end)
> edge_id = lowercase hex of sha256 over that octet string
> ```
>
> `vectors/transitions/valid.json` is normative for the exact bytes: any implementation that
> reproduces its `edge_id` values has the encoding right.

The worked example above uses placeholder digests. Before merging, replace them with the real
values from `vectors/transitions/valid.json` case `on-acceptance-explicit-accept` so the example
is checkable rather than illustrative.

**On issue #10's secondary request (domain separation):** the preimage has no protocol-version or
`"edge"` type tag, so `{commitment_hash, owner, owed_to, proposed_at}` concatenated for any other
purpose yields the same digest. Adding one is cheap in text and **changes every `edge_id`** — see
§9 below, where the identical argument applies to `commitment_hash`. If domain separation is
adopted it should be adopted for both preimages in one change, not one at a time.

### 4. Vector impact

`none` **if the UTF-8-no-separator reading is ratified** — that is what
`tools/vectors-gen/src/protocol.ts:100-103` already produces and what every committed `edge_id`
already is.

**If any other encoding is chosen — raw decoded bytes, a separator, length prefixes, or a domain
tag — the `edge_id` preimage changes and every `edge_id` ever computed changes. That is a breaking
change to stored data, not merely to tests:** vaults, assertion chains, `blocked_by` arrays and
`supersedes` pointers all reference `edge_id`. It would `regenerate vectors/transitions/valid.json,
vectors/transitions/invalid.json, vectors/signatures/signatures.json,
vectors/addressing/oob-bootstrap.json`.

### 5. Confidence

**High.** The implementation's encoding, the generator's encoding, and the fixed-width property
that makes it unambiguous are all verified. Ratifying costs nothing; the only open decision is
whether to take the domain-separation opportunity now, jointly with §9.

---

## §6 — Issue #14: verification level `ext` has no rank, but M-12 requires one

*Class: ratification. Labels: `normative-change`, `spec-ambiguity`.*

### 1. What the spec says now

`spec/01-identity.md:52`:

> Verification levels, ascending (clients MUST display the achieved level and MUST NOT display a human name above the level's evidence — §8 M-12):

then the table, `spec/01-identity.md:54-60`:

> | 0 unconfirmed | none |
> | 1 continuity | ≥1 prior confirmed edge with this key |
> | 2 attested | valid, unrevoked org attestation |
> | 3 domain-verified | level 2 + org root domain-anchored |
> | ext external-proof | signed statement published on a controlled external channel (repo/gist/domain): `{type:"binding_proof", persona, channel_url, sig}` |

`0`–`3` are ordered by construction. `ext` is not a number and the table gives it no position.
M-12 (`spec/08-conformance.md:16`) is stated as a comparison and therefore presupposes a total
order:

> **M-12** Clients MUST display verification level and MUST NOT render a display name above its evidence level.

§7 propagates the value as an opaque enum, `spec/07-node-surface.md:35`:

> `"verification_level":"0|1|2|3|ext"`

### 2. What the reference implementation does

It defines an explicit total order and states in the source that the order is a decision rather
than a spec rule. `impl:packages/identity/src/ladder.ts:28-41`:

> SPEC AMBIGUITY (reported). §1.6 lists the numeric levels "ascending" but gives `ext` no rank
> relative to them. This ordering is a decision, not a spec rule: `ext` sits above continuity and
> below attested, because a binding proof is the persona's own signature on a channel it
> controls — self-assertion — while an attestation is a third party staking its key. Where the
> spec is silent, self-assertion must not outrank a third party.

```
LEVEL_RANK = { '0': 0, '1': 1, ext: 2, '2': 3, '3': 4 }
```

i.e. **`0 < 1 < ext < 2 < 3`**. Pinned by test at
`impl:packages/identity/test/ladder.test.ts:112-113`
(`LEVEL_RANK['1'] < LEVEL_RANK.ext` and `LEVEL_RANK.ext < LEVEL_RANK['2']`). The achieved level is
the rank-maximum of all achieved levels (`impl:.../ladder.ts:201`).

The second half is more interesting than the ordering, and it is what actually makes M-12
enforceable: **`ext` carries no display name at all.**
`impl:packages/identity/src/ladder.ts:203-208`:

> M-12, structurally: the ONLY branch that lets a human name out of this function requires the
> level that carries it. `claims.display_name` is an org's assertion (§1.3/§9), so it travels only
> at the levels an org attestation establishes.

`nameBearing = (level === '2' || level === '3') && attested !== null`. A binding proof binds a key
to a *channel*, never to a human name, so `displayName` is null at levels `0`, `1` and `ext`
(`impl:.../ladder.ts:78-83`), and `render` falls back to a shortened key (`:129-143`).
`VerifiedIdentity` can only be constructed by the grader, enforced with a runtime symbol token
(`:75, :110-115`) so the guarantee survives into JavaScript.

One divergence worth the author's attention: the node has a *second*, simpler ladder.
`impl:packages/node/src/node.ts:405-427` (`verificationLevel`) returns `'0'`, `'1'`, `'2'` or
`'3'` and **never returns `'ext'`** — it consults attestations, revocations, the domain anchor and
prior-confirmed-edge continuity, but not binding proofs. So the value that reaches §7's
`open_loops` output today cannot be `ext`, while the §7 enum admits it
(`impl:packages/types/src/node-surface.ts:80`, `impl:packages/types/src/primitives.ts:53`). That
is an implementation gap, not a spec question, but it means no §7 consumer currently exercises the
`ext` rank.

### 3. Proposed resolution text

**Replace the lead-in sentence of §1.6 (`spec/01-identity.md:52`) with:**

> Verification levels, in ascending order of evidence — `0` < `1` < `ext` < `2` < `3`. `ext` ranks
> above `1` and below `2`: a binding proof is the persona's own signature on a channel it
> controls, which is self-assertion, whereas an attestation is a third party staking its own key.
> Where evidence for several levels is present, the achieved level is the highest-ranked of them.
> Clients MUST display the achieved level and MUST NOT display a human name above that level's
> evidence (§8 M-12).

**Append to §1.6, after the table (`spec/01-identity.md:60`):**

> A `binding_proof` binds a persona key to a channel, never to a human name. Levels `0`, `1` and
> `ext` therefore carry no display name, and a client at those levels MUST render the persona by
> its key (or an abbreviation of it) rather than by any name it obtained elsewhere. `display_name`
> and `handle` are org claims (§1.3) and MUST be rendered only at levels `2` and `3`, and only
> from a valid, unrevoked attestation. A client MUST NOT combine a name obtained at one level with
> a level badge earned by different evidence.

### 4. Vector impact

`none` — and that is the problem, not a convenience.

There is no vector for M-12 or for the ladder. The suite is
`canonicalization/`, `hashing/`, `signatures/`, `derivation/`, `transitions/`, `addressing/` —
no visibility or display family exists. `spec/08-conformance.md:33` lists "visibility matrix
tests" as in scope for the v0 suite, and they have not been written. Per `GOVERNANCE.md`, a
behaviour the suite does not cover is not yet a conformance requirement, so **M-12 has no teeth
today whichever ordering is ratified.**

Making it enforceable means a new vector family, which per the project's own workflow is six
touchpoints: `tools/vectors-gen/src/ladder.ts` with a reference grader, a `buildLadder()` in
`generate.ts` plus a `buildAll()` entry, a numbered `selfcheck.ts` section that replays the
committed vectors, a `MAPPING` entry in `validate.ts`, `vectors/schema/ladder.schema.json`, and
the file table plus interpretations row in `vectors/README.md`. The natural cases: evidence sets
→ achieved level (including a set where both `ext` and `2` are present, which is the case the
ordering decides), and a negative case asserting a name is not rendered at `ext`.

### 5. Confidence

**High** on the implementation's ordering, its rationale, the structural name gating, the
`node.ts` divergence, and the absence of any vector. The *substance* of the ordering — whether
self-assertion should rank below a third-party attestation — is a judgement the author owns; the
implementation's argument for `1 < ext < 2` is recorded above verbatim so it can be accepted or
overruled on its merits. Note that ranking `ext` above `3` would not change the name-gating text,
since `ext` carries no name either way.

---

## §7 — Issue #12: is an explicit `open` assertion valid?

*Class: genuine two-reading ambiguity. Labels: `question`, `spec-ambiguity`.*

### 1. What the spec says now

`spec/04-edge.md:39`, one row of the §4.3 table:

> | confirmed | open | (implicit) | confirmed ≡ open; kept distinct for future escrow states |

The "Who may sign" cell reads `(implicit)` and names no authorized signer. The table's closing
rule, `spec/04-edge.md:47`:

> Any assertion violating this table is **invalid** and MUST be discarded by conforming nodes (this is how constitutional rules bind rude clients).

restated as M-14, `spec/08-conformance.md:18`. And `spec/04-edge.md:31`:

> The edge's current state = the latest valid assertion per the transition table.

`open` is also the *source* state of five further rows (`spec/04-edge.md:40-44`: `→ closed`,
`→ released`, `→ superseded`, `→ expired`, `→ disputed`), so an implementer must decide whether
reaching `open` requires an assertion the table never authorizes anyone to sign.

### 2. What the reference implementation does

Reading 1, with an unusually careful two-schema split so the rejection is *reportable* rather
than merely a parse failure.

- `impl:packages/types/src/edge.ts:19-27` — `AssertableState` deliberately omits `open`.
- `impl:packages/types/src/edge.ts:30-49` — `WireAssertionState` **includes** `open`, and the
  reason is stated: "A hostile or buggy peer can put `open` in an assertion, and §4.3 requires the
  node to *discard* it — with the reason `implicit-transition-not-assertable`. If the parser
  rejected `open` outright, the node could not report that reason, and an M-14 rejection would be
  indistinguishable from malformed JSON. Syntax is the parser's job; assertability is the
  transition table's."
- `impl:packages/types/src/edge.ts:52` — `NON_ASSERTABLE_STATES = ['open']`.
- `impl:packages/node/src/transitions.ts:89` — returns `implicit-transition-not-assertable`,
  checked after signature and party validation but before the table, so the reported reason names
  the real problem.
- `impl:packages/node/src/transitions.ts:111` — a valid `confirmed` assertion sets
  `ctx.state = 'open'` directly: "interpretation #3: confirmed ≡ open". `EffectiveState` has one
  state for the pair (`impl:.../edge.ts:57`).

The generator's verifier agrees (`tools/vectors-gen/src/transitions.ts:146-149`), and the
committed vector is `vectors/transitions/invalid.json` case `explicit-open-assertion`.

`vectors/README.md:98` records this as interpretation 3, and issue #12 is explicit that **it is a
guess**: "If reading 2 is intended, that vector must move from the invalid set to the valid set."

### 3. Proposed resolution text — both readings

The spec genuinely admits both. Neither is collapsed here.

**Reading 1 — `open` is never assertable (what the implementation does).** Replace the row at
`spec/04-edge.md:39` and append the paragraph:

> | confirmed | open | — (implicit; no signer) | confirmed ≡ open; the name is reserved for future escrow states |
>
> The `confirmed → open` transition is implicit: a node performs it on accepting a `confirmed`
> assertion, and no assertion carries `open` in its `state` member. Because no row of this table
> authorizes any signer to produce one, an assertion whose `state` is `open` violates the table
> and MUST be discarded under M-14. A node SHOULD report the reason as
> `implicit-transition-not-assertable` rather than as a malformed object, so that a rude client
> learns which rule it broke. `confirmed` and `open` are one effective state for every other row
> of this table: wherever `open` appears as a source state, an edge whose latest valid assertion
> is `confirmed` satisfies it.

**Reading 2 — `open` is a real, redundant assertion.** Replace the same row and append:

> | confirmed | open | either party | confirmed ≡ open; the assertion is permitted but carries no information a node needs |
>
> `(implicit)` means a node MAY perform the `confirmed → open` transition without an assertion,
> not that an `open` assertion is forbidden. Either party MAY emit one; it is valid, is appended
> to the chain, and leaves the effective state unchanged. A node MUST NOT treat the absence of an
> `open` assertion as leaving the edge short of `open`.

**What the author is choosing between.** Reading 1 keeps exactly one representation of one state,
so two nodes replaying the same chain cannot disagree; the cost is that `(implicit)` becomes a
prohibition, which is more than the word says. Reading 2 is the more literal reading of
`(implicit)`; the cost is that the chain — which §4.2 makes append-only and state-determining —
admits an assertion that changes nothing, so two nodes can hold different chains for the same
edge and a party can pad a chain with unbounded valid no-ops. Issue #12's own observation stands:
"kept distinct for future escrow states" justifies reserving the *name*, which costs nothing under
either reading, but it does not justify leaving today's semantics undefined.

### 4. Vector impact

- **Reading 1:** `none`. `vectors/transitions/invalid.json` case `explicit-open-assertion` and the
  `implicit-transition-not-assertable` value in `vectors/schema/transitions.schema.json`'s
  `rejection_reason` enum already encode it.
- **Reading 2:** `regenerates vectors/transitions/valid.json, vectors/transitions/invalid.json`.
  The `explicit-open-assertion` case moves from the invalid set to the valid set — it is removed
  from `tools/vectors-gen/src/cases-transitions.ts`'s invalid list and re-added as a positive case
  with `accepted: true` and an `expected_final_state` of `open`, which rewrites both files.
  `implicit-transition-not-assertable` would become an unused `rejection_reason`; whether to keep
  it in the enum is then a separate call. No hash preimage and no signing preimage changes.

### 5. Confidence

**Medium — because the ambiguity is real, not because the facts are unclear.** The implementation's
behaviour, the two-schema rationale, and the vector case are verified with high confidence. Which
reading the spec should adopt is genuinely undetermined by the current text and is the author's to
pick. Reading 1 is recommended on the "one state, one representation" ground and because it is
what is already tested — but that is a preference, not a reading of the spec.

---

## §8 — Issue #5: acceptance window — default duration, and "required iff on-acceptance"

*Class: genuine two-reading ambiguity plus an open design question. Labels: `normative-change`, `open-question`, `spec-ambiguity`.*

### 1. What the spec says now

`spec/04-edge.md:16`:

> `"acceptance_window": "ISO8601 duration | null (required iff on-acceptance; default P5D)"`

A field cannot be both required and defaulted. If it is required whenever `closure_policy` is
`on-acceptance`, `P5D` never applies; if there is a default, the field is optional. A verifier
must know which, because it decides whether an edge omitting `acceptance_window` is valid or
malformed.

`spec/04-edge.md:52` makes the window load-bearing — it is the interval after which the owner may
record tacit acceptance — and `spec/04-edge.md:52` also makes `on-acceptance` "the default for
cross-person edges", so this is the common path, not an edge case.

### 2. What the reference implementation does

It takes a position the issue does not enumerate: **the member is required to be present, its
value may be `null`, and `null` means `P5D`.**

- `impl:packages/types/src/edge.ts:109` — `acceptance_window: Iso8601Duration.nullable()`.
  `.nullable()` without `.optional()` means the key MUST be present; an edge object omitting it
  fails to parse. The value may be `null`.
- `impl:packages/types/src/edge.ts:86` — `DEFAULT_ACCEPTANCE_WINDOW = 'P5D'`.
- `impl:packages/node/src/transitions.ts:66-72` (`windowElapsed`) — `edge.acceptance_window ??
  DEFAULT_ACCEPTANCE_WINDOW`, with the reason stated: "Absent is treated as P5D rather than as
  'no window', which would let the owner close instantly — the exact forgery §4.4 exists to
  prevent."
- `impl:packages/node/src/node.ts:190-193` (`buildEdge`) — every edge the node originates is
  `closure_policy: 'on-acceptance'` with `acceptance_window: DEFAULT_ACCEPTANCE_WINDOW`, so `null`
  never appears on a node-originated `on-acceptance` edge.
- `impl:packages/types/src/primitives.ts:36-40` — `Iso8601Duration` accepts the full
  `PnYnMnWnDTnHnMnS` grammar, so a window is not restricted to whole days.

The generator matches on the semantics and on presence: `tools/vectors-gen/src/protocol.ts:148-154`
emits `P5D` for `on-acceptance` and `null` for `on-evidence`, and
`tools/vectors-gen/src/transitions.ts:231` applies the same `?? 'P5D'` fallback. The vector schema
agrees that the key is mandatory: `acceptance_window` is in the `required` list of
`vectors/schema/common.schema.json`'s `edge` definition.

Note the asymmetry the fallback creates: `null` on an `on-evidence` edge is meaningless and
ignored, while `null` on an `on-acceptance` edge silently means `P5D`. Nothing rejects a
`null` window on an `on-acceptance` edge.

### 3. Proposed resolution text — both readings

**Reading A — optional with a default (what the implementation and vectors do).** Replace
`spec/04-edge.md:16` with:

> `"acceptance_window": "ISO8601 duration | null"`

and add to §4.1, after the object:

> `acceptance_window` MUST be present on every edge object. On an edge whose `closure_policy` is
> `on-evidence` it carries no meaning and MUST be `null`. On an edge whose `closure_policy` is
> `on-acceptance`, `null` means the default window of `P5D`; a verifier MUST treat a null window
> on such an edge as `P5D` and MUST NOT treat it as "no window", which would let the owner record
> tacit acceptance instantly. Implementations SHOULD write the effective duration explicitly
> rather than relying on the default, so that both parties can see the window they are bound by
> without consulting this specification.

**Reading B — required, no default.** Replace `spec/04-edge.md:16` with:

> `"acceptance_window": "ISO8601 duration | null (MUST be non-null iff closure_policy is on-acceptance)"`

and add:

> `acceptance_window` MUST be present on every edge object. It MUST be a non-null ISO 8601
> duration when `closure_policy` is `on-acceptance` and MUST be `null` otherwise. There is no
> default: an `on-acceptance` edge with a null `acceptance_window` is malformed and MUST be
> rejected, and a node MUST NOT accept assertions against it.

**What the author is choosing between.** Reading A cannot produce a malformed edge and matches
what is shipped; the cost is that a null window is silently interpreted, so a counterparty who
never read §4.1 does not know how long it has. Reading B makes the window always visible in the
object the counterparty signs against, which is the more defensible position for a field that
decides when silence becomes consent; the cost is one more rejection path and no tolerance for
peers that omit it. **Reading B is the narrower, safer reading and the implementation did not take
it** — it is the one place in this packet where that is true, and it is worth the author's
attention.

**The open design question (issue #5 part 2) is separate and unresolved.** Is `P5D` right at all?
The considerations, from the issue: too short and the owner benefits from the counterparty's
silence; too long and every cross-person edge lingers in `pending-acceptance`, which is the open
loop the protocol exists to close; and should the window depend on `due` — a commitment due
tomorrow with a five-day acceptance window is odd. Nothing in the implementation or the vectors
bears on this; `P5D` is simply carried through from the spec. A defensible resolution that needs
no new field:

> An `acceptance_window` SHOULD NOT extend past `due` where `due` is non-null; where a node
> originates an edge whose default window would extend past `due`, it SHOULD write the shorter
> interval explicitly.

That is offered as a starting point, not a recommendation — the number is the author's.

**Issue #5 part 3 (nothing to "cite" window expiry in) is resolved by §3 of this packet**, which
strikes "citing window expiry" from §4.4 and makes the source state carry the meaning instead.

### 4. Vector impact

- **Reading A:** `none`. Every committed edge already carries the member explicitly —
  `acceptance_window` appears 7 times in `vectors/transitions/valid.json`, 19 in
  `vectors/transitions/invalid.json`, 4 in `vectors/addressing/oob-bootstrap.json`, once per edge
  object — and `vectors/schema/common.schema.json` already lists it as required.
- **Reading B:** `none` for the existing case data, for the same reason: no committed case omits
  the member, and no committed `on-acceptance` edge carries `null`
  (`tools/vectors-gen/src/protocol.ts:148-154` emits `P5D`). What Reading B needs is an *addition*
  — a negative case for an `on-acceptance` edge with a null window, plus a new
  `rejection_reason`, which touches `tools/vectors-gen/src/transitions.ts:17-30` and
  `vectors/schema/transitions.schema.json`'s enum. Without that case, Reading B is unenforceable
  per `GOVERNANCE.md` and the two readings are indistinguishable to the suite.
- The `P5D` value itself: changing the number regenerates nothing directly, but
  `tools/vectors-gen/src/cases-transitions.ts:29` hard-codes the derived instant
  ("T_EVIDENCE + P5D = 2026-08-07T12:00:00Z") and `:141` the prose "after P5D has elapsed", so a
  different default `regenerates vectors/transitions/valid.json` (case
  `on-acceptance-tacit-expiry`) `and vectors/transitions/invalid.json` (case
  `tacit-close-before-window-elapsed`).

### 5. Confidence

**Medium on the contradiction's resolution — the spec admits both readings and both are written
out above. High on the facts**, including the implementation's third position (key required, value
nullable, null means `P5D`), which neither the issue nor `vectors/README.md` interpretation 5
states precisely. **Low on the default-duration question**, which is a design judgement no
evidence in either repository settles; the `SHOULD NOT extend past due` sentence is a suggestion,
and `[unverified]` — the design-phase discussion that produced `P5D` is in the upstream Svod
vault, not here.

---

## §9 — Issue #8: confirm the five-field `commitment_hash` preimage

*Class: ratification. Labels: `normative-change`, `open-question`.*

### 1. What the spec says now

`spec/03-commitment.md:28`:

> ```
> commitment_hash = sha256( JCS({ intent, owner, owed_to, due, created_at }) )
> ```

and `spec/03-commitment.md:31-33`:

> - **Only these five fields.** Evidence, confidence, source are vault-local and excluded — two parties agreeing on a promise need not share evidence sets.
> - The hash, not the object, appears in edges (ADR-0004). Plaintext lives only in party vaults.
> - Fan-out: one hash, many edges (§4.6).

The commitment object itself (`spec/03-commitment.md:5-19`) carries four more members —
`v`, `type`, `conditions`, `evidence_refs`, `source`, `confidence` — none of which reach the hash.

### 2. What the reference implementation does

Exactly the five fields, in a preimage builder that cannot pick up a sixth.
`impl:packages/crypto/src/identity-hash.ts:11`:

```
export const COMMITMENT_HASHED_FIELDS = ['intent', 'owner', 'owed_to', 'due', 'created_at'] as const;
```

`commitmentHashPreimage` (`impl:.../identity-hash.ts:21-29`) constructs a fresh object with those
five members explicitly rather than deleting from the commitment, so a new commitment field can
never leak in by omission. `commitmentHash` (`:31-33`) is `sha256Hex(canonicalBytes(preimage))`.
The rationale is recorded at `:5-9`, including the role of the vectors: "The 14 hashing vectors
exist to prove no sixth field reaches this hash."

The node applies it at `impl:packages/node/src/node.ts:145-151`, passing the five fields by name.
The generator is identical (`tools/vectors-gen/src/protocol.ts:60-84`), and
`tools/vectors-gen/src/generate.ts:194-210` asserts inside the builder that each case's hash does
or does not equal the base hash as declared, so a broken expectation fails generation rather than
being recorded as fact.

`vectors/hashing/commitment-hash.json` holds 14 cases, including — per issue #8 — a pair differing
only in `evidence_refs` that proves the hash is identical, plus cases for `confidence`, `source`
and `conditions`.

### 3. Proposed resolution text

**Confirming the five fields needs no change to `spec/03-commitment.md:28-31`; the text is already
unambiguous.** What the issue asks for beyond confirmation is its point 4, domain separation, and
its points 1–3, which are under-specified consequences rather than errors. Proposed additions:

**Point 4 — domain separation. Append to §3.2:**

> The preimage is the JCS form of exactly the five members above, with no type tag and no
> protocol-version prefix. A `commitment_hash` is therefore not domain-separated: the same five
> values hashed for any other purpose yield the same digest. Implementations MUST NOT rely on a
> `commitment_hash` alone to prove that the digest was computed as a commitment.

If instead the author wants real domain separation, the change is to `spec/03-commitment.md:28`:

> ```
> commitment_hash = sha256( JCS({ v: "servanda/0.1", type: "commitment", intent, owner, owed_to, due, created_at }) )
> ```

**This changes the `commitment_hash` preimage. Every `commitment_hash` ever computed changes —
and because `commitment_hash` is the first element of the `edge_id` preimage (§4.1), every
`edge_id` changes with it. That is a breaking change to stored data, not merely to tests, and it
is the single most expensive change in this packet.** It is also the cheapest it will ever be:
after freeze it is not available at all. The same argument applies to `edge_id` (§5 above); if
domain separation is adopted, adopt it for both in one change.

**Point 1 — who sets `created_at`. Append to §3.1 (`spec/03-commitment.md:23`'s bullet list):**

> `created_at` is set by the owner's node and is part of the `commitment_hash` preimage (§3.2). It
> is the owner's value, not a negotiated one: a counterparty MUST take `created_at` from the
> commitment it was given and MUST NOT substitute its own observation of when the commitment
> arrived. A counterparty that never receives the plaintext (M-7) never learns `created_at` at
> all and verifies only the digest it was sent.

**Point 3 — the `due` consistency requirement. Append to §4.1:**

> An edge's `due` is duplicated from the commitment (§3.2) so that the counterparty can verify
> expiry without plaintext. The counterparty holds only `commitment_hash` and therefore cannot
> detect a mismatch between the edge's `due` and the `due` inside the hashed commitment. A party
> that holds both the commitment plaintext and the edge MUST verify that they agree and MUST
> treat a mismatch as making the edge unverifiable in the sense of M-8. Nodes MUST NOT rely on
> the counterparty to detect this.

**Point 2 — `conditions` excluded.** Verified as excluded and, on the stated principle, correctly
so: `conditions` holds `edge_id` values (`spec/03-commitment.md:13`), which are references to
other edges rather than content of this promise. The consequence the issue names is real — "I'll do
X" and "I'll do X once you deliver Y" hash identically — but the dependency is carried on the edge
as `blocked_by` (`spec/04-edge.md:17`), which is where a counterparty can see it. No text change
is proposed; if the author disagrees, adding `conditions` to the preimage carries the same bolded
cost as domain separation.

### 4. Vector impact

- **Confirming the five fields, and the point 1 / point 2 / point 3 / point-4-disclosure
  additions:** `none`. No preimage changes. Point 3's new MUST would need a vector to be
  enforceable, but it is a plaintext-plus-edge consistency check that the current vector families
  have no shape for — it belongs with the visibility family that §6 of this packet notes is
  unwritten.
- **Adopting domain separation (or adding `conditions`):**
  `regenerates vectors/hashing/commitment-hash.json` (16 `commitment_hash` occurrences, all 14
  cases plus the banner's `base_commitment_hash`) **and, because `edge_id` is derived from
  `commitment_hash`,** `vectors/transitions/valid.json, vectors/transitions/invalid.json,
  vectors/signatures/signatures.json, vectors/addressing/oob-bootstrap.json`. That is every vector
  file in the suite except `canonicalization/jcs.json`, `derivation/persona-keys.json` and
  `addressing/inbox-records.json`. **Both hash preimages change; every previously computed
  `commitment_hash` and `edge_id` becomes invalid.**

### 5. Confidence

**High** on the implementation matching the spec exactly, on the 14 hashing vectors, and on the
derivation chain that makes a `commitment_hash` change propagate into every `edge_id`. **The
domain-separation decision is the author's, and it is the one item in this packet where deferring
is strictly more expensive than deciding** — every other section can be revisited after freeze
without invalidating stored identifiers. `[unverified]` — `ADR-0004`, cited at
`spec/03-commitment.md:32` as the authority for "the hash, not the object, appears in edges",
lives in the upstream Svod vault; if it already fixes the preimage's shape, that constrains the
domain-separation option.

---

## §10 — Issue #15: §7's conformance note constrains a `commit` input field that does not exist

*Class: editorial. Labels: `contradiction`, `editorial`.*

### 1. What the spec says now

`spec/07-node-surface.md:8-9` defines the `commit` input:

> ```json
> "input": { "intent":"string", "owed_to":"string|null", "due":"RFC3339|null",
>            "persona":"string|null (default active)", "propose":"bool (default false)" }
> ```

There is no `owner` member. The conformance note in the same section,
`spec/07-node-surface.md:50`, then constrains one:

> - Tools MUST NOT accept free-text that bypasses §3.4 extraction rules (e.g. `commit` with `owner` ≠ caller's persona is invalid — you cannot record someone else's promise as theirs; use `expect`).

The intent is M-1 (`spec/08-conformance.md:5`), the first constitutional principle. As written the
MUST constrains a parameter the contract it constrains does not define, so a conformance suite
cannot construct the violating call.

### 2. What the reference implementation does

Both halves of issue #15's options 1 and 2 — structural impossibility *and* an explicit rejection
that makes the rule testable.

- `impl:packages/types/src/node-surface.ts:14-22` — `CommitInput` has `intent`, `owed_to`, `due`,
  `persona`, `propose`. No `owner`.
- `impl:packages/node/src/node.ts:80-87` — `assertNoForeignOwner` throws `M1Violation` if an
  `owner` key is present **at all**, regardless of its value, with the message "M-1: a promise is
  owned by its giver. `commit` records the calling persona's own promise and takes no `owner`; use
  `expect` for what someone else said they would do."
- `impl:packages/node/src/tools.ts:117-121` — the check runs **before** schema parsing, and the
  comment says why: "M-1 is checked before the schema, so an `owner` key is REJECTED rather than
  stripped. Silent stripping would tell a rude client it had recorded someone else's promise."
  The same ordering rationale is at `impl:packages/node/src/node.ts:76-79`.
- `impl:packages/node/src/node.ts:127-136` — the owner is `this.resolvePersona(rawInput.persona)`,
  i.e. always the calling persona.
- `impl:packages/node/src/tools.ts:30-47` — the published JSON Schema for the tool has
  `additionalProperties: false` and a description that states the rule to the client: "The owner
  is always your persona (M-1) — for what someone else said they would do, use `expect`."

Note that rejecting the *presence* of the key is stricter than the spec's "`owner` ≠ caller's
persona". A client passing `owner` equal to its own persona is refused too. That is defensible —
the field does not exist, so supplying it means the client believes something false about the
contract — but it is a behaviour the spec should state rather than leave to each implementation.

### 3. Proposed resolution text

Issue #15's option 1 is the right one and is consistent with §9.2's preference for structural
impossibility over policy prohibition. It can be written so that it is also testable, which
removes the reason to consider option 2.

**Replace the first conformance-note bullet at `spec/07-node-surface.md:50` with:**

> - Tools MUST NOT accept free-text that bypasses the §3.4 extraction rules.
> - `commit` records the promise of the calling persona. It takes no `owner` input: the owner is
>   the persona resolved from `persona` (or the active persona), always, so recording another
>   party's promise as theirs is impossible by construction rather than merely forbidden (M-1).
>   The correct object for "they said they would" is `expect` (§3.3). A node MUST reject a
>   `commit` call carrying an `owner` member rather than ignoring it, and the rejection MUST cite
>   M-1: silently discarding the member would leave a client believing it had recorded someone
>   else's promise. This applies whatever value the member carries.

### 4. Vector impact

`none`.

There are no node-surface vectors. The suite covers canonicalization, hashing, signatures,
derivation, transitions and addressing; §7's tool contract has no vector family, so no committed
file mentions `commit` at all. The `MUST reject` sentence is enforceable only against an
implementation's own tests — `impl:packages/node/test/musts/` holds those — and per
`GOVERNANCE.md` it is not a suite-level conformance requirement until a node-surface family
exists. That is a pre-existing gap in the suite scope (`spec/08-conformance.md:33` does not list
node-surface tests) and is worth a separate issue rather than blocking this wording.

### 5. Confidence

**High.** Editorial, no decision required, and the proposed wording states what the reference
implementation already does — including the stricter "presence, not just mismatch" rule, which is
the only substantive addition and is what makes the MUST testable.

---

## Summary

| # | Issue | Class | Proposed resolution, in one line | Vector impact | Changes a hash preimage? | Confidence |
|---|---|---|---|---|---|---|
| 1 | **#17** rotation `sig_old`/`sig_new` | ratification | Add a §0 signing-preimage rule (strip `sig` and `sig_*`); §1.7 keeps a single `sig` by `old`; §1.6 `link`'s shared preimage becomes normative | `none` (new `link` / `sig_new`-only cases would be additions) | No | High on facts; option choice is the author's |
| 2 | **#11** `closure_policy` shares an `edge_id` | ratification | **A:** keep the preimage, require bind-on-first-sight and reject a conflicting body under one `edge_id`. **B:** widen the preimage | A: `none`. B: `regenerates transitions/valid.json, transitions/invalid.json, signatures/signatures.json, addressing/oob-bootstrap.json` | **Direction B: yes — every `edge_id` changes** | High |
| 3 | **#13** three acts, one row | ratification | Split §4.3's `open → closed` row into four rows over a computed `pending-acceptance`; strike "citing window expiry" | `none` (issue #13's own wire-state variant regenerates both transition files) | No | High |
| 4 | **#9** `superseded` successor | ratification | **A:** state that the assertions bind the fact, not the successor. **B:** add `supersedes_with` to §4.2 | A: `none`. B: `regenerates transitions/valid.json, transitions/invalid.json` + `schema/common.schema.json` | No — but **B re-signs every `superseded` assertion** | High on facts; direction is a real decision, and `ADR-0010` is `[unverified]` |
| 5 | **#10** `\|\|` undefined | ratification | State UTF-8 octet concatenation, no separator, no length prefix, with a byte-offset worked example | `none` if ratified as-is | **Yes if any other encoding or a domain tag is chosen — every `edge_id` changes** | High |
| 6 | **#14** `ext` has no rank | ratification | Fix the order `0 < 1 < ext < 2 < 3`; state that `0`, `1` and `ext` carry no display name | `none` — **and no M-12 vector exists at all, so M-12 is currently unenforceable** | No | High on facts; the ordering's substance is the author's |
| 7 | **#12** explicit `open` | **two readings** | **1:** `open` never assertable, discard under M-14. **2:** `open` is valid and redundant. Both written out; neither collapsed | 1: `none`. 2: `regenerates transitions/valid.json, transitions/invalid.json` | No | Medium — the ambiguity is real |
| 8 | **#5** acceptance window | **two readings** + open question | **A:** present, nullable, `null` means `P5D`. **B:** required non-null iff `on-acceptance`. Default duration left open | Both `none` for existing cases; B needs a new negative case. Changing `P5D` regenerates both transition files | No | Medium on the contradiction; **low** on the default duration |
| 9 | **#8** five-field `commitment_hash` | ratification | Confirm the five fields; add domain-separation disclosure, `created_at` ownership, and the `due`-mismatch MUST | `none` to confirm. Real domain separation `regenerates hashing/commitment-hash.json` + all four `edge_id` files | **Yes if domain separation is adopted — every `commitment_hash` AND every `edge_id` changes** | High; **deferring this one costs more than deciding it** |
| 10 | **#15** `owner` in `commit` | **editorial** | Reword: `commit` takes no `owner`, the owner is the calling persona by construction, and a supplied `owner` MUST be rejected citing M-1 | `none` (no node-surface vector family exists) | No | High |

### Resolutions that would change a hash preimage

Four, and every one of them is optional — no resolution in this packet *requires* a preimage
change:

1. **#11 Direction B** (widen the `edge_id` preimage to the whole edge object) — every `edge_id`.
2. **#10** if any encoding other than UTF-8-no-separator is chosen, or a domain tag is added —
   every `edge_id`.
3. **#8** if domain separation is adopted — every `commitment_hash`, and therefore every `edge_id`.
4. **#8** if `conditions` is added to the preimage — same blast radius as 3.

Each is a breaking change to stored data: vaults, assertion chains, `blocked_by` arrays and
`supersedes` pointers all reference these identifiers, and existing records cannot be migrated
without recomputing identities that parties have already signed against. If any of the four is
wanted, taking all the wanted ones in **one** normative change is strictly cheaper than taking
them separately.

### Sequencing note

#8, #10 and #11 all touch §4.1's preimage or its first element, and issue #11's own *Related*
section asks for them to be resolved together. §4 (#9) and §3 (#13) both add to §4.2/§4.3 and
should be decided before either is drafted, since Direction B of #9 changes the assertion object
that #13's rows assert over. #14 and #15 are independent of everything else and can be ratified
alone.

### Downstream consequence of any ratification here

A normative change in this repo is a two-repo event. `escapeboy/servanda` vendors the vectors
(`gates/sync-vectors.sh`, pinned via `vendor/vectors/.SOURCE_COMMIT`) and `gates/ga-node.sh`
enumerates the M-numbers explicitly, so a new or renumbered MUST breaks a gate there until it is
updated. Sections 2, 3, 4, 6 and 10 above add MUSTs. New MUSTs **append** to the §8 M-N list —
nothing is ever renumbered — and each must also be added to the "v0 suite scope" sentence at
`spec/08-conformance.md:33`. Whichever sections are ratified, the follow-up is a `spec-sync` issue
on the implementation repo naming the affected M-numbers and gate scripts.

Per `CONTRIBUTING.md`, vectors are a build artifact: any regeneration named above is produced by
`cd tools/vectors-gen && npm run generate && npm test`, never by hand-editing a `vectors/*.json`
file, which CI fails on by design.
