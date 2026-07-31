# Gaps packet — DRAFT v0.1-pre

**Purpose.** Three issues that are *different in kind* from the ten in
[`ratification-packet-v0.1-pre.md`](ratification-packet-v0.1-pre.md). There, the spec had taken a
position and the reference implementation followed the narrowest reading available, so the question
was whether the spec should now say what the implementation already does. **Here the spec is
silent.** A silence cannot be ratified: the implementation had to invent something to ship at all,
and each of these three needs *new normative text* rather than a confirmation of existing text.

**The distinction this packet is organized around.** For each issue, section 2 separates:

- **a reasonable default** — the implementation chose something the spec would plausibly have
  chosen, and the spec's job is to write it down so it stops being per-implementation; from
- **a guess the spec should overrule** — the implementation chose something because it had to
  choose, and the choice is either wrong, or right for local reasons that do not generalize.

Both appear below, named as such.

**This document decides nothing.** It supplies, per issue: what the spec says (or the nearest text a
reader would wrongly expect to cover it), the verified behaviour of the reference implementation
with `file:line`, the concrete failure the silence permits, literal prose to insert, the effect on
the vector suite, and a confidence rating with both readings given uncollapsed where the design
genuinely admits more than one.

**Repositories cited.**

| Short form | Path | Role |
|---|---|---|
| *(bare path)* | `/Users/katsarov/htdocs/servanda-protocol` | this repo — spec, vectors, generator |
| `impl:` | `/Users/katsarov/htdocs/servanda` | reference implementation (read-only here) |

---

## Two corrections to the earlier packet, both load-bearing here

**1. There is a third sha256 preimage in the spec, and it is in §2.** The ratification packet opens
with "Two hash preimages exist in the protocol — `commitment_hash` (§3.2) and `edge_id` (§4.1)…
`grep` over `spec/02`, `spec/05` and `spec/06` finds no third (no `envelope_id`, no other
`sha256(...)` construction)". That grep was for the token `sha256(...)`; `spec/02-signal-envelope.md:9`
writes the third one in prose instead:

> `"id": "<sha256 of canonical form sans id>",`

The claim holds for **wire** objects — an envelope never crosses a node boundary
(`spec/02-signal-envelope.md:3`) — but the envelope `id` is a real hash preimage all the same, and it
is the hinge of §1 below: because §2 places no bound on `payload`, the *input* to that hash is
implementation-defined, and therefore so is the hash. No vector computes an envelope `id`
(`grep -i envelope` over `vectors/` matches only the string `"kind": "envelope"` inside
`evidence_refs` fixtures in `vectors/hashing/commitment-hash.json`, and
`tools/vectors-gen/src/cases-transitions.ts:40`). This preimage is untested and unbounded.

**2. The suite has six case families, not seven.** `vectors/` holds `canonicalization/`, `hashing/`,
`signatures/`, `derivation/`, `transitions/`, `addressing/` — six directories of cases — plus
`schema/`, which holds the eight JSON Schemas those cases are validated against
(`vectors/README.md:11-20`). Counting `schema/` gives seven directories. Either way the fact this
packet needs is the same one the earlier packet established for M-12: **there is no node-surface
family and no envelope family**, so §2's and §7's behaviour is currently outside the conformance
suite entirely.

---

## §1 — Issue #18: §2 places no bound on envelope `payload`

*Class: gap — the spec is silent. Labels: none (needs `normative-change`).*

### 1. What the spec says now

**§2 says nothing about size, depth, or count.** The complete rule set is
`spec/02-signal-envelope.md:21-25`, four bullets:

> Rules:
> - `payload` is opaque to the core. **Envelope content is data, never instruction** (constitution §6): no field of an envelope may be interpreted as a command by any pipeline stage (§9.2).
> - `persona` scoping: a connector instance is bound to exactly one persona at registration. Envelopes MUST NOT be processed in any pipeline together with envelopes of a different org persona (§8 M-5).
> - Connectors are MCP servers implementing `emit_envelope`. The envelope schema is the only contract between connector and core; connector-specific fields go under `payload`.
> - Retention of envelopes is local policy; evidence referenced by commitments (§3) SHOULD be pinned until the referencing record closes + retention window.

Four passages a reader would wrongly expect to cover the gap:

- **`spec/02-signal-envelope.md:25`** — "Retention of envelopes is local policy". This is the nearest
  text, and it is the one issue #18's option 3 proposes to imitate. It bounds *how long* an envelope
  lives. It says nothing about how large it may be, and a reader who takes it as the pattern will
  conclude that the spec has already thought about envelope resource cost and chosen to devolve it.
  It has not; it addressed a different axis.
- **`spec/06-reconciliation-federation.md:29` (§6.5)** — "Nodes SHOULD rate-limit inbound proposals
  per unknown sender and MUST NOT surface proposals from level-0 senders above a
  client-configurable cap." This is the spec's only quantitative anti-flood rule, and it is on the
  **wire** path (proposals from other personas). Envelopes are the **local ingress** path and are
  never mentioned. It bounds a count, never a size.
- **`spec/03-commitment.md:9`** — `"intent": "string, human-readable, ≤ 500 chars"`. Issue #18's
  point 4, verified: the field a human types is bounded, the field an attacker controls is not.
- **`spec/09-threat-model.md:5, 9-10, 28`** — §9.1 names "attention (interruption channel)" and vault
  plaintext as assets; §9.5's first row is "Prompt injection in signal | 9.2; worst case junk
  proposal (M-2)"; §9.2 contains what a fooled model may *emit*. Nothing in §9 bounds what a signal
  source may make a node *read* or *store*. The containment argument is entirely on the output side.

### 2. What the reference implementation invented

**Documented as an interpretation?** Partly, and thinly. The only prose that names the gap is
`impl:packages/connectors-github/README.md:48-50`:

> Because §2 places no bound on `payload` (upstream issue #18), strings are clipped to 8192
> characters with the original length preserved as `text_length`, and only scalars are lifted from
> nested structures. A 2 MB PR body should not become a 2 MB vault object.

The code site itself carries only a one-line rationale, `impl:packages/envelope/src/index.ts:26`:

> `/** Payload strings are clipped: an envelope must stay bounded whatever the source does. */`

which does not record that the spec is silent. That is a weaker treatment than the interpretations
the ratification packet examined (`identity-hash.ts`, `ladder.ts`, `edge.ts`), each of which states
the ambiguity at the code site.

**The mechanism.** `impl:packages/envelope/src/index.ts:26-33`:

```
export const MAX_PAYLOAD_TEXT = 8192;
export const MAX_LABEL = 200;
export const MAX_REF = 2048;
export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
```

Sealing is `sha256(JCS(envelope sans id))` at `impl:.../index.ts:49-52`, which is §2:9 exactly.

**Five properties of the invention, all verified:**

1. **The bound is per-string, never per-envelope.** `impl:packages/types/src/envelope.ts:45-46`
   defines `payload: z.record(z.unknown())` and `refs: z.array(EnvelopeRef).default([])` — no
   `.max()`, no serialized-size check, on either. Nothing anywhere bounds the number of members in
   `payload`, the total canonical length of the envelope, or the length of `refs`. An envelope with
   N clipped members is N × 8192 and parses cleanly.
2. **The unit is UTF-16 code units, not octets or scalars.** `s.slice(0, 8192)` counts code units,
   so 8192 astral-plane characters are 32768 octets of UTF-8 — a 4× spread the constant does not
   name. It can also cut a surrogate pair in half; the resulting lone surrogate survives
   canonicalization because `JSON.stringify` escapes it (the property recorded at
   `impl:packages/crypto/src/jcs.ts:58-62`). So the bound is neither a byte bound nor a character
   bound, and the clipped value can contain a code point that was not in the source.
3. **Nesting is bounded only by accident, and only at the hash.** No connector bounds payload depth;
   GitHub's payload is flat by construction because every value passes through the scalar helpers
   `str`/`num`/`bool` (`impl:packages/connectors-github/src/webhook.ts:39-49`, applied at e.g.
   `:117-131`). The only actual depth defence in the system is in crypto —
   `impl:packages/crypto/src/jcs.ts:29` `MAX_CANONICALIZATION_DEPTH = 256`, enforced at `:68`, which
   throws `JcsDepthExceeded`. It is a *thrown exception inside `sealEnvelope`*, not a connector-level
   refusal, and the comment at `impl:.../jcs.ts:15-28` records why it exists: without it a deep
   payload exhausted the stack with a platform-dependent `RangeError`, and "the connector's hostile-input
   suite passed on macOS and overflowed on Linux CI".
4. **The three connectors do not clip alike — the divergence issue #18 predicts *between*
   implementations is already present *inside one*.**
   - claude-code clips and records the original length:
     `impl:packages/connectors-claude-code/src/transcript.ts:109-110` and `src/hook.ts:78-79`
     (`text` + `text_length`), pinned by `impl:packages/connectors-claude-code/test/musts/M-06.test.ts:113-125`.
   - email clips, records the length **and** a `truncated` flag
     (`impl:packages/connectors-email/src/capture.ts:199-205`), on top of a whole second limit set
     the spec knows nothing about: `impl:packages/connectors-email/src/mime.ts:36-46` —
     `maxBytes: 2 MiB, maxHeaderBytes: 128 KiB, maxHeaders: 256, maxParts: 64, maxDepth: 8,
     maxAddresses: 64, maxReferences: 32, maxTextChars: 256 KiB, maxAttachments: 32`.
   - github clips and records **nothing**: `impl:packages/connectors-github/src/webhook.ts:39-41`
     returns `clip(v, MAX_PAYLOAD_TEXT)` with no length and no flag, and `grep text_length`
     over `impl:packages/connectors-github/src/` finds no match. Its own README (quoted above)
     states that the original length *is* preserved. **The README is wrong about its own code.**
5. **Two of issue #18's framing claims do not hold against the current implementation, and the
   packet should not carry them forward.**
   - "Each becomes a vault object that is stored, encrypted, git-committed, retained until the
     retention window." The vault has **no envelope record type**: `grep -i envelope` over
     `impl:packages/vault/` matches one line, `impl:packages/vault/src/records.ts:33`
     (`envelope_id: Sha256Hex.nullable()`, a reference on a pending-extraction record). Envelopes are
     not persisted by the reference node. `layer: vault` in `spec/02-signal-envelope.md:3` is design
     intent that the implementation has not yet built.
   - "an evidence reference that was clipped differently by two nodes is a reconciliation hazard".
     It is not, on the wire: `evidence_refs` live on the commitment (`spec/03-commitment.md:14`),
     the commitment's plaintext never leaves the vault (M-7), and `evidence_refs` is **not** one of
     the five fields in the `commitment_hash` preimage (`spec/03-commitment.md:28`). Envelope-id
     divergence changes no hash that any counterparty ever sees.

**Also verified, and relevant:** `emit_envelope` — the MCP method `spec/02-signal-envelope.md:24`
names as "the only contract between connector and core" — **does not exist anywhere in the
implementation**. `grep -rn emit_envelope` over `*.ts`/`*.md`/`*.json` outside `node_modules/` and
`dist/` returns nothing. Connectors are in-process libraries whose only entry point is the bounded
`sealEnvelope`. So today no untrusted process can hand the core an unbounded envelope directly. The
spec says one should be able to, and when that path is built, nothing in §2 or in the `Envelope`
schema bounds what crosses it.

**Reasonable default vs guess:**

- *Reasonable default*: clip rather than refuse, so the fact of the observation survives. That is the
  right instinct and the spec should adopt it — a connector that drops a 5 MB PR comment has silently
  destroyed evidence a person may need, which is worse than storing a prefix of it.
- *A guess the spec should overrule*: (a) that the limit can be per-implementation at all — see §1.3;
  (b) the unit, which is code units and should be octets; (c) that the truncation marker is optional
  and per-connector, which produced three incompatible conventions and one incorrect README inside a
  single codebase.

### 3. Why the silence is a problem — the attack

**The primary failure is not resource exhaustion. It is that §2 defines a hash whose input the spec
declines to specify.** `spec/02-signal-envelope.md:9` makes `id = sha256(canonical form sans id)`.
Because no bound exists, two conforming nodes given byte-identical source material legitimately
produce different envelopes and therefore **different `id` values for the same observation** — the
github connector's 8192-code-unit prefix, the email connector's 256 KiB text, an unclipping
implementation's full 5 MB. There is no reading of §2 under which one of them is wrong. A protocol
that defines an identifier as a hash and then leaves the preimage to local policy has not defined
the identifier. This is the strongest argument against issue #18's option 3: declaring bounds "local
policy" is declaring a hash preimage implementation-defined, which the spec does not do anywhere
else — §3.2 and §4.1 both pin their preimages exactly.

**The resource attack, stated concretely and honestly scoped.** Take a node whose github connector
watches any repository an attacker can comment on — the reference connector reads
`issue_comment` and `pull_request_review_comment` on repositories it is configured for
(`impl:packages/connectors-github/src/webhook.ts:92-131`). The attacker posts comments. Under the
spec as written, a conforming node MUST accept each in full; there is no size at which it is
permitted to say no, and no clause it could cite if it did.

Each accepted envelope then enters extraction, and the input side of §3.4 has no budget either:
`impl:packages/extraction/src/prompt.ts:46-56` renders each envelope's `text` into the model prompt,
and `:58-67` concatenates **all** rendered envelopes into one user message with no cap on count or
total length. Note the fallback at `:54`: when `payload.text` is not a string it emits
`JSON.stringify(envelope.payload)` — the entire payload, whatever its size or shape. The attacker's
cost is one HTTP POST; the target's cost is a vault write plus a model call sized by the attacker.
§9.1 lists attention as an asset and §9.2 argues containment purely on the output side ("the fooled
model can produce at most an unconfirmed proposal"). Nothing in §9 notices that the *input* side is
the attacker's to size.

The reference implementation is not fully exposed to this — its per-string clip caps each envelope's
text at 8192 code units, so the amplification is per-envelope rather than per-byte, and a flood is
bounded by how fast the attacker can post. What is exposed, in the reference and in any conforming
node: unbounded `refs`, unbounded `payload` member count, an unbounded number of envelopes in one
extraction request, and a JCS depth failure that surfaces as a thrown `RangeError` subclass rather
than a refusal a caller can act on.

### 4. Proposed normative text

**Recommended: normative ceilings plus a mandatory clip marker — issue #18's options 1 and 2
together, and explicitly *not* option 3.** Option 3 is the one place in this packet where the cheap
answer is the wrong one, for the reason in §1.3: it would make an sha256 preimage
implementation-defined.

**Insert into `spec/02-signal-envelope.md`, as a new bullet in the Rules list immediately after the
`payload` bullet at `:22`:**

> - **Bounds.** An envelope MUST be bounded where it is created. A connector MUST NOT emit an
>   envelope whose canonical form (§0) exceeds 65536 octets, whose `payload` nests more than 8
>   levels below `payload` itself, or whose `refs` array holds more than 32 entries. Where the
>   observed source exceeds any of these, the connector MUST clip and MUST NOT discard the
>   observation: the fact that something was observed is the part that cannot be recovered later.
>   Every string member of `payload` MUST be truncated to at most 8192 octets of UTF-8, and a
>   truncation MUST fall on a Unicode scalar boundary — a clipped value MUST NOT contain a code
>   point absent from the source. An envelope in which any member was clipped MUST carry
>   `"clipped": true` at the top level, and for each clipped string member `x` SHOULD carry
>   `payload.x_length`, the length in octets of the value as observed. `clipped` is absent, not
>   `false`, when nothing was clipped. A node MUST reject an envelope that exceeds any bound above
>   rather than canonicalize it; a node MAY apply stricter local bounds to envelopes it did not
>   itself create, and MUST clip and mark such an envelope in exactly the manner above rather than
>   silently storing or silently dropping it.
>   These bounds constrain the envelope, not the source. Nothing here licenses any pipeline stage
>   to interpret `payload` (M-6).

**Append to the same Rules list, after the retention bullet at `:25`:**

> - `id` is `sha256` of the canonical form of the envelope with `id` removed (§0). Because the
>   bounds above fix what may be in that form, two nodes that observe the same source event and emit
>   the same `source`, `kind`, timestamps, `actor`, `payload` and `refs` MUST compute the same `id`.

**Append to `spec/08-conformance.md`'s MUST list — a new number, never a renumber, per the earlier
packet's rule:**

> - **M-19** Envelopes are bounded: a connector MUST NOT emit, and a node MUST NOT canonicalize, an
>   envelope exceeding the §2 bounds. Exceeding input is clipped and marked, never silently
>   truncated and never silently dropped.

and add M-19 to the Node level at `spec/08-conformance.md:26` (`M-1..M-16` → `M-1..M-16, M-19`) and
to the v0 suite scope sentence at `:33`.

**On the numbers.** 65536 / 8 / 32 / 8192 are proposals, not derivations. Two of them are anchored:
8192 is what the reference already clips to (so choosing it regenerates nothing in the
implementation), and 8 matches the email connector's independently-chosen MIME `maxDepth`
(`impl:packages/connectors-email/src/mime.ts:41`). 65536 and 32 are round numbers chosen to sit far
above any legitimate envelope; the author should set them deliberately. **The unit — octets, not
characters and not UTF-16 code units — matters more than the values, because it is the part the
reference got wrong and the part that makes the `id` reproducible.**

**If the author prefers option 3 anyway** (declare it local policy), the honest minimum is:

> - Bounds on `payload` size, nesting and `refs` count are local policy. A node MAY refuse or clip an
>   envelope on any of those grounds. In consequence an envelope's `id` is reproducible only within
>   the node that created it, and MUST NOT be treated as a stable identifier for an observation
>   across nodes or across a persona's devices.

That second sentence is the whole cost of option 3, and it should be written down rather than left
implicit.

### 5. Vector impact

`none` to the six committed case families — nothing in `vectors/` contains an envelope object today.

**Requires a NEW vector family.** There is no envelope family, and the §2 `id` construction has no
vector of any kind, so the third hash preimage in the spec is currently untested. A new
`vectors/envelope/` family would contain, at minimum:

- a within-bounds envelope with its canonical form and `id` pinned — this alone is worth the family,
  since it is the only way `sha256(JCS(envelope sans id))` becomes checkable;
- an over-long ASCII string clipped at exactly 8192 octets, with the resulting canonical form and `id`;
- an **astral-plane** string clipped at a scalar boundary — the case that catches the reference's
  UTF-16 `slice` and the lone-surrogate artefact it can produce;
- an envelope carrying `clipped: true` and an `x_length`, so the marker's placement is pinned;
- negative cases: payload nested past the depth bound, `refs` past the count bound, canonical form
  past the size bound, each with its rejection reason.

Cost, per the workflow the earlier packet enumerated for a new family: a generator module, a
`buildX()` in `generate.ts` plus a `buildAll()` entry, a numbered `selfcheck.ts` section, a `MAPPING`
entry in `validate.ts`, `vectors/schema/envelope.schema.json`, and the file-table and
interpretations rows in `vectors/README.md`. Unlike §2 of this packet, this family is a natural fit
for the existing suite shape: it is pure data-in/data-out, exactly like `canonicalization/` and
`hashing/`.

### 6. Confidence

**High** on every fact above: the silence, the three divergent connector conventions, the incorrect
github README, the missing `emit_envelope`, the absent vault record, the JCS depth guard's origin,
the unbudgeted extraction prompt, and the absence of any envelope vector.

**High** on the diagnosis that the silence makes an sha256 preimage implementation-defined, which is
the argument that decides between options 1/2 and option 3. This is a fact about the spec's own
structure, not a preference.

**Low** on the specific numbers. 65536 / 8 / 32 are chosen, not derived; only 8192 and depth 8 are
anchored in shipped behaviour. If the author wants them derived rather than chosen, the measurement
to make is the distribution of real envelope sizes across the three connectors, which nothing in
either repository currently records.

**Both readings, uncollapsed.** *Normative ceilings* make the `id` reproducible and the behaviour
testable, at the cost of a number in the spec that will be wrong for somebody's connector and cannot
be changed after freeze without regenerating the new family. *Local policy* costs nothing now and
concedes that an envelope `id` identifies an observation only within one node — which may be
perfectly acceptable given that envelopes never cross node boundaries (`spec/02-signal-envelope.md:3`),
and is the reading under which the reference's current per-connector divergence is not a defect at
all. The choice turns on whether a persona's own several devices are "one node" — a question §2
does not answer and this packet cannot; `[unverified]`, and it would be settled by whatever governs
multi-device vault sync, which is `ADR-0014` territory in the upstream Svod vault rather than
anything in `spec/`.

---

## §2 — Issue #19: §7 `open_loops` offers five actions but names a tool for none of them

*Class: gap — the spec is silent. Labels: none (needs `normative-change`).*

### 1. What the spec says now

**§7 names the five actions and never says how any of them is invoked.**
`spec/07-node-surface.md:36`, the last member of each `open_loops` item:

> `"actions":["done","release","supersede","delegate","ping"]`

Three passages a reader would wrongly expect to close the loop:

- **`spec/07-node-surface.md:3`** — "A conforming node exposes these five tools over MCP. Clients
  (assistants, UIs, CLIs) are **interchangeable above this contract**." Interchangeability is the
  stated purpose of the section, and it is what the gap breaks.
- **`spec/07-node-surface.md:51`** — "Additional tools MAY be exposed; these five are the minimum for
  the 'conforming node' claim (§8)." This reads like the licence to invent a sixth tool, and it is
  the opposite of one: because it is a MAY, any tool a client invents is a tool no other conforming
  node has to implement. It makes the gap permanent rather than filling it.
- **`spec/07-node-surface.md:44`** — the *other* list surface, `brief`, does supply
  `"primary_action":{ "label":"string", "tool":"string", "args":{} }`. A reader who has just read
  §7's `brief` has every reason to expect `open_loops` to carry the same shape. §3 of this packet is
  about why that shape is also not quite right; the inconsistency is real either way.

The acts themselves are **fully specified** in §4 — only their invocation is missing.
`spec/04-edge.md:41`:

> `| open | released | **owed_to alone** | unilateral forgiveness |`

is the sharpest case: the only unilateral signed act in the protocol, advertised on every item of
every `waiting` view, with no way to sign it. `spec/04-edge.md:42` gives `superseded` (both parties),
`spec/04-edge.md:57` gives delegation (three keys across two edges), and `ping` appears in no row of
§4.3 at all — it is not a transition, and §7 gives no hint of that.

### 2. What the reference implementation invented

**Documented?** The client side, thoroughly and by name. The node side, not at all.

**Node side — an undocumented role-and-state filter that §7 does not describe.**
`impl:packages/node/src/node.ts:663-670`:

```
function edgeActions(state: EffectiveState, isOwner: boolean): OpenLoopAction[] {
  if (state === 'proposed') return isOwner ? ['ping'] : [];
  if (state === 'open' || state === 'pending-acceptance') {
    return isOwner ? ['done', 'supersede', 'delegate'] : ['release', 'ping', 'supersede'];
  }
  if (state === 'disputed') return ['supersede'];
  return [];
}
```

§7 shows one array containing all five for every item. The implementation instead computes a subset
per (state, viewer role) — which is almost certainly right, since it mirrors §4.3's signer column —
but the function carries **no interpretation comment**, unlike essentially every other inferred
behaviour in that codebase. Two further sites: `impl:.../node.ts:531` gives vault-local commitments
`['done','supersede']`, and `impl:.../node.ts:548` gives expectations `['ping']` while open and `[]`
otherwise. Neither is derivable from §7.

**Client side — a typed refusal to invent, documented and cited.**
`impl:packages/client-web/src/view.ts:178-190`:

> §7 offers five item actions but names tools for only some of them. `confirm` covers accept,
> dismiss and revise-the-date; `done`, `release`, `delegate` and `ping` have no §7 tool at all — §7
> says additional tools MAY be exposed, and these evidently need them.
>
> SPEC GAP (narrowest reading): rather than invent tool names, the client emits a typed, unmapped
> intent for those four and leaves the binding to whoever wires the surface up.

```
export function dispatchFor(action: OpenLoopAction): ActionDispatch {
  if (action === 'supersede') return { kind: 'needs-input', tool: 'confirm', needs: 'date' };
  return { kind: 'unmapped', action };
}
```

The same decision is taken independently in `impl:packages/gestures/src/intent.ts:5-19` (which cites
"upstream issue #19" explicitly), with `UNMAPPED_ACTIONS = ['done','release','delegate','ping']` at
`:61` and the reason string at `:63-64`. `impl:packages/gestures/src/reaction.ts:30-34` maps the
emoji gestures ✅🙏↪️⏰ onto those same four actions and resolves every one of them to an inert
`UnmappedIntent` (`:58, :69`).

**Three findings beyond what the issue reports, all verified:**

1. **The reference node's own `brief` invents exactly the binding its client refuses to invent — and
   the binding is wrong.** `impl:packages/node/src/node.ts:605-609`, for a non-owner viewing a
   non-`proposed` edge, emits `{ label: 'Release', tool: 'confirm', args: { id, decision: 'dismiss' } }`.
   And `confirmEdge` with `decision: 'dismiss'` (`impl:.../node.ts:311-317`) sets a vault-local
   `dismissed` flag on the edge's metadata and **produces no assertion at all**, with the comment
   "§6.5: a proposed edge is socially nothing. Dismissal produces no assertion — there is no
   'rejected' state in §4.3, and inventing one would be a protocol change." §4.3's `release`
   (`spec/04-edge.md:41`) is a signed transition to `released` by `owed_to`. So one node presents a
   control called "Release" that performs a local hide. This is not a hypothetical divergence
   between two vendors; it is one implementation's two surfaces disagreeing about one verb.
2. **The single mapping the client did make would fail if it were ever invoked.** `dispatchFor` maps
   `supersede` to `confirm` with a date — i.e. `decision: 'edit'`. `confirmEdge` for
   `decision: 'edit'` **throws** (`impl:.../node.ts:319-324`): "§4.5: an edge's content cannot be
   edited in place; changing it requires supersession." Only the *pending-extraction* branch handles
   `edit` (`impl:.../node.ts:298-304`). So the one action §7's array can be mapped to is mapped to a
   call that errors for every edge.
3. **End to end, all five actions are inert in the reference.** `dispatchFor` returns only
   `needs-input` (for `supersede`) or `unmapped` (for the rest) — it never returns `{kind:'tool'}`,
   and `actionsFor` (`impl:packages/client-web/src/view.ts:192-199`) routes every item action
   through it. The TUI's dispatcher then treats anything that is not `kind:'tool'` as unmapped and
   performs nothing (`impl:packages/tui/src/app.ts:73-87`), and the web client does not dispatch at
   all — it hands `onAction(actionId)` to whoever mounts it
   (`impl:packages/client-web/src/mount.ts:37, 76-79`). So §7's `actions` array is, in the reference
   implementation, decorative from the node's computation to the person's screen.

**Reasonable default vs guess:**

- *Reasonable default*: emitting a typed, inert `unmapped` rather than inventing a tool name. Given
  the silence this is the only choice that does not fork the protocol, and the spec should record
  that a client MAY do it — an affordance a client cannot invoke should be visible as such rather
  than hidden or faked.
- *Reasonable default*: filtering `actions` by state and viewer role. §4.3's signer column already
  decides who may sign what; a node that advertised `release` to the owner would be advertising an
  assertion the transition table forbids. The spec should say this, because §7 currently reads as
  though the array is constant.
- *A guess the spec should overrule*: binding `release` to `confirm{decision:"dismiss"}` in `brief`.
  It is not a §4.3 transition, it produces no signature, and the counterparty never learns of it. The
  spec should name a real tool for `release` or state plainly that v0 has none.

### 3. Why the silence is a problem — the interoperability failure

**§8's own definition of a conforming Client is what breaks.** `spec/08-conformance.md:29`:

> - **Client**: §7 consumer + M-12 display rules.

Take one node and two conforming clients, both reading the same `open_loops` output containing
`"release"` on an item the person is waiting on.

- **Client A** is this repository's reference client. It renders the affordance and does nothing:
  `dispatchFor` → `{kind:'unmapped'}` → the TUI reports `'unmapped'`
  (`impl:packages/tui/src/app.ts:84`) and the copy shown is "There is no action for this here yet."
  (`impl:packages/gestures/src/copy.ts:73`).
- **Client B** takes the obvious hint: the same node's `brief` binds a control called "Release" to
  `confirm{decision:"dismiss"}` (`impl:packages/node/src/node.ts:609`), so Client B binds
  `release` there too. This is not a strawman — it is the binding the node itself publishes.

Both are conforming. Neither violates any MUST. The person using Client B presses a button, sees
the item disappear from their list, and believes they have forgiven a debt. What actually happened
(`impl:.../node.ts:311-317`): a boolean was written to their own vault metadata. No assertion was
created, nothing was signed, nothing reached the counterparty, and the edge is still `open` — so it
remains eligible for `open → expired` (`spec/04-edge.md:43`) against a counterparty who was told
nothing and against a person who believes they released it. The protocol's one act of forgiveness
becomes a local hide that the forgiven party never receives.

That is the failure: §7 exists to make clients interchangeable, and here two conforming clients
produce opposite outcomes from the same five strings — with the *more helpful* client being the one
that silently destroys the act. `delegate` has the same shape with a larger blast radius (three
signatures across two edges, per `spec/04-edge.md:57`, behind one verb). And `ping` compounds it:
it is not in §4.3 at all, so a client cannot determine from §7 whether pressing it produces a
signature, a message, or nothing.

### 4. Proposed normative text

**Recommended: issue #19's options 1, 2 and 3 together, in the minimal form that does not
over-promise.** Option 1 alone (give `open_loops` the `brief` shape) makes the surfaces consistent
but leaves four of the five with nothing to point at. Option 2 alone (add an `act` tool) leaves the
two list surfaces describing the same thing differently. Option 3 (separate `ping`) is one sentence
and there is no reason not to take it. The honest limit is that `supersede` and `delegate` are
two-edge, multi-signature acts (`spec/04-edge.md:57`) that no single tool call can complete, so the
text below binds `done` and `release` and states plainly that the other three are unbound in v0 —
rather than pretending otherwise.

**Replace the `actions` member in `spec/07-node-surface.md:36` with:**

> `"actions":[ { "act":"done|release|supersede|delegate|ping", "tool":"string|null", "args":{} } ]`

**Insert a new tool section between `confirm` and `open_loops` (i.e. before `spec/07-node-surface.md:30`):**

> ## act
> ```json
> { "name": "act",
>   "input": { "id":"edge_id", "act":"done|release", "evidence_hash":"hex|null" },
>   "output": { "state":"<the edge's effective state after the assertion>" } }
> ```
> `act` signs one assertion against one edge, as the calling persona, and is the only tool that
> does. The node MUST verify the resulting assertion against the §4.3 transition table before
> recording it and MUST reject the call rather than record an invalid assertion (M-14). `done`
> requires the caller to be the edge's `owner` and `evidence_hash` to be non-null; `release`
> requires the caller to be `owed_to` and `evidence_hash` to be null (§4.3). A node MUST NOT accept
> an `act` call from a persona that is not a party to the edge (M-3).

**Append to §7's Conformance notes, after `spec/07-node-surface.md:51`:**

> - `actions` describes what this person may do to this item *now*: a node MUST omit any act whose
>   §4.3 row does not authorize the requesting persona to sign it in the item's current state, and
>   MUST NOT list any act for an item in a terminal state. The array is therefore a function of the
>   item's state and the caller's role, not a constant.
> - `tool` names the §7 tool that performs the act, or is `null` where this specification defines
>   none. In v0 `tool` is `"act"` for `done` and `release`, and `null` for `supersede`, `delegate`
>   and `ping`: `supersede` and `delegate` are supersessions (§4.5) requiring signatures across two
>   edges, which no single tool call completes, and `ping` is not a transition at all — it produces
>   no assertion and changes no state. A client MUST NOT invoke a tool of its own devising for an
>   act whose `tool` is `null`, and MUST NOT present such an act as though it had been performed. A
>   client MAY show that the act exists and is not yet invocable.
> - `args` is the input object the client passes to `tool` verbatim. Where `tool` is `null`, `args`
>   MUST be `{}`.

**Append to `spec/08-conformance.md`'s MUST list:**

> - **M-20** A node MUST NOT advertise an act the transition table does not authorize the requesting
>   persona to sign in the item's current state, and MUST NOT bind an advertised act to a tool call
>   that produces no assertion. A client MUST NOT invent a tool binding for an act the node reports
>   as unbound.

and add M-20 to the Node and Client levels at `spec/08-conformance.md:26, 29` and to the suite scope
at `:33`.

**Cost, stated plainly.** This changes the `open_loops` output shape, so every §7 consumer breaks —
in the reference that is `impl:packages/client-web/src/view.ts:192-199` and
`impl:packages/node/src/node.ts:531, 548, 663-670`, plus `OpenLoopItem`/`OpenLoopAction` in
`impl:packages/types/src/node-surface.ts:64-86`. It changes **no** hash preimage and **no** signing
preimage: `open_loops` output is not a signed object and appears in no vector. The change is cheap
in stored data and expensive in client code, which is the opposite balance from most of the
ratification packet.

### 5. Vector impact

`none` to the six committed case families — no vector file mentions `open_loops`, `actions`, or any
§7 tool.

**Requires a NEW vector family, and it is the same one §3 of this packet needs.** There is no
node-surface family; `spec/08-conformance.md:33` does not list node-surface tests in the v0 suite
scope. Per `GOVERNANCE.md`, until such a family exists none of the text above is a conformance
requirement — the same standing hole the earlier packet found for M-12.

A `vectors/node-surface/` family would contain, for #19:

- **`actions.json`** — a set of cases, each giving an edge body, an assertion chain and a viewing
  persona, and pinning the exact `actions` array the node MUST return. This is the case that catches
  a node advertising `release` to the owner. It is expressible in the suite's existing data-in/data-out
  shape, because the transitions family already knows how to express "this edge, this chain".
- **`act-tool.json`** — for each `(edge state, caller role, act)` triple, whether the `act` call is
  accepted and, if not, the rejection reason; and for accepted calls, the assertion the node must
  have produced, which the transitions verifier can then check.

Estimated shape: roughly 12–20 `actions` cases (the cross-product of §4.3's states and two roles,
minus terminal states) and 10–14 `act` cases. **One caveat the author should weigh:** unlike the
envelope family in §1, this family is not pure data-in/data-out unless the vault state is expressed
as edge-plus-chain, which constrains what it can test — it can pin the *output* of `open_loops` for
a given chain, but it cannot pin anything about a *client*, for the same reason M-12 has no vector.

### 6. Confidence

**High** on every fact: the undocumented role filter, the client's documented refusal, the node's
own contradictory `release` binding, the `edit`-throws path, and the end-to-end inertness of all
five actions.

**Medium on the shape of the fix**, and the readings are genuinely different in kind:

- **Reading A — fill the gap (proposed above).** §7 grows a sixth tool and the actions become
  invocable for the two acts a single call can complete. Cost: a wire-shape change to `open_loops`
  before freeze, and an admission in normative text that three of the five acts remain unbound.
- **Reading B — shrink the array to what §7 can invoke.** Delete `release`, `delegate` and `ping`
  from `actions` and leave `done` and `supersede`. This is smaller, is honest in a different way,
  and costs no new tool. Its price is that §4.3's one unilateral act becomes unreachable through the
  node surface entirely — the protocol would define forgiveness and offer no way to extend it — and
  that a client wanting to offer it must go outside §7, which is exactly the divergence §7 exists to
  prevent.

Reading A is recommended because `release` is a real signed act with a real signer rule and no
tool, and because the reference implementation has already demonstrated what happens when the gap
is filled locally instead. But Reading B is a coherent position and the author should reject it
deliberately rather than by omission.

---

## §3 — Issue #20: §7 `brief` supplies `primary_action.label`

*Class: gap — the spec is silent on who owns display copy. Labels: none (needs `normative-change`).*

### 1. What the spec says now

**§7 defines the field and says nothing about who authors it or what may be in it.**
`spec/07-node-surface.md:43-45`:

> ```json
>   "output": { "generated_at":"...", "slots":[ { "headline":"string", "item_id":"...",
>                "primary_action":{ "label":"string", "tool":"string", "args":{} } } ],
>              "below_the_line_count": 0 }
> ```

Two passages a reader would wrongly expect to cover it, and each covers a neighbouring case in a way
that makes the omission look deliberate rather than accidental:

- **M-6**, `spec/08-conformance.md:10`, restated at `spec/02-signal-envelope.md:22`:

  > **M-6** Signal/envelope content is data, never instruction; extraction is tool-less and
  > schema-bound.

  M-6 governs what a *pipeline stage* may do with observed content: it may not act on it. It says
  nothing about what an *interface* may render, or about which strings a person is entitled to read
  as their software's own voice. A label is never interpreted by a pipeline stage — it is painted
  into the chrome — so M-6 does not reach it, even though the same attacker-authored text is the
  ultimate source of concern in both cases.

- **M-12**, `spec/08-conformance.md:16`:

  > **M-12** Clients MUST display verification level and MUST NOT render a display name above its
  > evidence level.

  M-12 draws exactly this boundary for one case, in the direction opposite to `primary_action`. For
  identity, the node supplies **evidence** (`verification_level`, `spec/07-node-surface.md:35`) and
  the client decides **display** (name or key). For actions, `primary_action` has the node supplying
  **display** (`label`) while leaving the client to work out the **semantics** — which act
  `tool: "confirm"` actually performs, which is §2 of this packet. The two fields put the same
  boundary in opposite places, and nothing in §7 or §8 says why.

`docs/ui-design.md`, cited by issue #20 as fixing the emotional register, is **not in either
repository**: the implementation's `docs/` holds `adr/`, `AGENT-BRIEF.md` and `USAGE.md`.
`[unverified]` — presumably in the upstream Svod vault. What *is* verifiable is that the doctrine
exists as executable code; see below.

### 2. What the reference implementation invented

**Documented, twice, with rationale — this is the best-documented of the three gaps.**

**Client side — the label is discarded, not sanitized.**
`impl:packages/client-web/src/view.ts:242-251`:

> The node also supplies `primary_action.label`. It is not rendered: the voice of the interface is
> the interface's responsibility, and a label arriving over a connection is exactly where the
> register would slip. Which action leads is honoured; what it is called is not.

`buildBrief` uses only `slot.primary_action.tool` (`impl:.../view.ts:269-270`), through `leadWith`
(`:285-296`), which merely reorders the client's own actions so the node's chosen act leads. The
words come from `impl:packages/client-web/src/copy.ts:100-114`, whose comment states the same rule:
"the voice of the interface is the interface's responsibility and cannot be delegated to whatever is
on the other end of the connection."

**It is enforced by test, not left to convention.**
`impl:packages/client-web/test/view.test.ts:150-161` asserts that no node-supplied label appears in
any rendered action label and that every rendered label is a member of `COPY.actions`.
`impl:packages/client-web/test/vocabulary.test.ts:73-87` feeds the slot label
`'CLOSE THE EDGE IN YOUR VAULT NOW!!!'` and asserts both that the chrome is unaffected and that
`scanAll` finds no violation — while the adjacent test at `:60-72` asserts that a *person's own
words* containing the same forbidden vocabulary pass through verbatim. Content is quoted; chrome is
authored.

**The doctrine is code.** `impl:packages/client-web/src/vocabulary.ts:13-21` defines
`FORBIDDEN_TERMS = ['node','vault','mcp','edge','persona','supersession','ledger']`, and `:43-49`
sets the exclamation-mark budget to zero ("One exclamation mark is the whole register slipping, so
the count is zero rather than low"), checked by a gate against rendered output across all three
surfaces. The TUI (`impl:packages/tui/src/frame.ts:44, 75`) and the email brief
(`impl:packages/brief-email/src/index.ts:36`) both render `CardView.actions[].label`, which is the
client's copy — so all three surfaces inherit the discard rather than reimplementing it.

**Two findings beyond what the issue reports:**

1. **The injection path is not live in the reference node.** Every label the node emits is a fixed
   constant: `impl:packages/node/src/node.ts:606` `'Mark done'`, `:608` `'Confirm'`, `:609`
   `'Release'`, `:620` `'Propose to counterparty'`, `:633` `'Ping'`. None is derived from an
   envelope. Issue #20's concern is therefore **structural, not observed** — the field permits the
   attack, and nothing in the reference performs it. What *is* envelope-derived is `headline`
   (`impl:.../node.ts:601, 617, 630` — `commitment.intent` / `expectation.expect`, which reach the
   vault through extraction), and the client renders that verbatim by design, because it is content.
   The line the implementation draws is exactly the one the spec does not: **content is quoted,
   chrome is authored.**
2. **`label` is already carrying a claim its `tool` and `args` do not support — and the failure is
   semantic, not tonal.** `impl:packages/node/src/node.ts:609` emits
   `{ label: 'Release', tool: 'confirm', args: { id, decision: 'dismiss' } }`, and that call sets a
   vault-local flag and produces no assertion (`impl:.../node.ts:311-317`; see §2 of this packet).
   A client that trusted the label would tell a person they had released a debt when the node had
   hidden a row. So the strongest argument against `label` is not that a hostile node might shout —
   it is that a *well-intentioned* node has already used it to name an act it does not perform.

**Reasonable default vs guess:**

- *Reasonable default, and the one the spec should adopt wholesale*: the client authors every word
  it paints into its own chrome, and honours the node's choice of *which* act leads. That is the
  M-12 split applied consistently, and the reference derived it correctly from a spec that does not
  state it.
- *A guess the spec should overrule*: that a client may silently ignore a field the spec declares.
  The reference discards `label` entirely, which is defensible only because the spec is silent. If
  the spec keeps `label` and calls it advisory, discarding it becomes conforming; if the spec keeps
  it and means it, the reference is non-conforming today. The field cannot be left in this state.

### 3. Why the silence is a problem — the trust failure

The person is the one who loses something, and what they lose is the ability to tell who is
speaking.

An interface has exactly two kinds of text: **quoted content** (what someone else wrote or what I
recorded — rendered verbatim, and read as a claim by its author) and **chrome** (what my software
says — read as the software's own voice, and acted upon). A person can only distinguish these if
the boundary is stable. Every convention that makes an interface trustworthy under adversarial
input — quoting, attribution, the visual difference between a message and a button — rests on the
chrome being authored locally.

`primary_action.label` is chrome that arrives over a connection, and §7 gives no rule that keeps it
from carrying content. That is the trust failure, and it decomposes along the two MUSTs:

- **Against M-6.** M-6's containment argument is that observed-world content is data: no pipeline
  stage acts on it, and §9.2's residual-risk statement bounds the damage at "an unconfirmed
  proposal — nothing a human didn't sign". That argument holds for everything the node *does*. It
  does not extend to what the person does, because the person is not a pipeline stage: they read the
  chrome, believe it is their software talking, and act. A button is the point in the system where
  text most directly becomes an action — and it is the one text §7 lets arrive from elsewhere. M-6
  contains injection into the machine; nothing contains injection into the sentence the person reads
  before clicking.
- **Against M-12.** M-12 answers the question "how much authority may a client grant a name it did
  not author?" with: none above the level of evidence backing it. The same question about button
  copy has no answer at all — and a button is the *higher*-authority surface. A display name is a
  claim the person can weigh; a button is an instruction the person is about to follow. M-12
  correctly declines to let a node decide how a name is shown, then §7 lets the same node decide
  what a control is called.

The failure does not require a hostile node. It requires only a node whose copy is wrong — and
`'Release'` on `confirm{decision:'dismiss'}` (§3.2 above) is that node, in this repository's own
reference implementation, today.

### 4. Proposed normative text

**Recommended: issue #20's option 2 — replace `label` with a typed act kind.** It is the only one of
the three that makes the boundary structural rather than conventional; it puts display authority
where M-12 already puts it; and it composes with §2 of this packet so that both §7 list surfaces
describe an action with one vocabulary instead of two shapes. Options 1 and 3 are stated after the
text, with why each is weaker.

**Replace `spec/07-node-surface.md:44` with:**

> ```json
>   "output": { "generated_at":"...", "slots":[ { "headline":"string", "item_id":"...",
>                "primary_action":{ "act":"<act>", "tool":"string|null", "args":{} } } ],
>              "below_the_line_count": 0 }
> ```

**Append to §7's Conformance notes (after `spec/07-node-surface.md:51`, and after the bullets
proposed in §2 of this packet):**

> - An act is named by `act`, drawn from one closed vocabulary shared by both list surfaces:
>   `done`, `release`, `supersede`, `delegate`, `ping`, `confirm`, `dismiss`, `propose`. The same
>   `{act, tool, args}` shape appears in `open_loops[].actions` and in `brief.slots[].primary_action`;
>   a node MUST NOT describe an act differently on the two surfaces.
> - **No user-facing copy crosses this contract.** A node MUST NOT supply the words shown to a
>   person for any control, and a client MUST author the wording of every affordance it renders,
>   from `act`. `headline` and `intent_or_expect` are the exception and the reason for the rule:
>   they are a person's own recorded words. They are content, MUST be rendered verbatim, and MUST
>   NOT be treated as instruction by the client or by any stage that produced them (M-6).
> - A client MUST NOT present an act whose `act` value it does not recognize as though it were
>   invocable. It MAY show that an unrecognized act exists, identified by the `act` value itself,
>   and MUST NOT supply wording that implies an effect it cannot produce.

**Append to `spec/08-conformance.md`'s MUST list:**

> - **M-21** No user-facing copy crosses the node surface: a node MUST NOT supply display wording
>   for a control, and a client MUST author the wording of every affordance it renders. A person's
>   own recorded words are content, not copy, and are rendered verbatim.

and extend the Client level at `spec/08-conformance.md:29` from "§7 consumer + M-12 display rules"
to "§7 consumer + M-12 and M-21 display rules", and add M-21 to the suite-scope sentence at `:33`.

**The other two options, and why they are weaker.**

- **Option 1 — keep `label`, declare it advisory.** One sentence: *"`label` is advisory. A client MAY
  render it and SHOULD prefer its own wording for controls."* Cheapest, breaks nothing, and makes the
  reference's discard conforming. Its weakness is that it resolves the *ownership* question and not
  the *authority* one: a MAY still permits a conforming client to paint a node's string into its
  chrome, so the failure in §3.3 remains reachable by a conforming pair. It also leaves the two §7
  list surfaces shaped differently, so §2 of this packet cannot be resolved consistently with it.
- **Option 3 — keep `label`, forbid envelope-derived content in it.** Issue #20 calls this the
  weakest and that is right, for a reason worth stating: it is not merely hard to test, it is
  **untestable in principle by this suite**. "Derived from an envelope payload" is a property of a
  node's internal data flow, and a vector sees only outputs. It would also not have caught the one
  real defect found here — `'Release'` on a dismiss call — which is not envelope-derived at all.

**Cost of removing `label`.** Any client that renders it breaks. In the reference, nothing does:
`impl:packages/client-web/src/view.ts:269` reads only `.tool`, and the TUI and email brief consume
the client's `CardView` rather than the node's slot. Verified across all three surfaces. The removal
is free there, and the two tests that pin the discard
(`impl:packages/client-web/test/view.test.ts:150-161`,
`impl:packages/client-web/test/vocabulary.test.ts:73-87`) would need rewriting to assert the field's
absence instead of its irrelevance. No hash preimage and no signing preimage changes: `brief` output
is not a signed object.

### 5. Vector impact

`none` to the six committed case families — no vector mentions `brief` or `primary_action`.

**Requires the same NEW node-surface family as §2 of this packet — this is the strongest argument
for deciding #19 and #20 together.** One family covers both, and the `act` vocabulary is the thing
both need to pin.

What this issue would add to that family: cases pinning, for a given vault state, the exact `act`
value each `brief` slot must carry, and a negative case asserting that a slot object carries **no**
copy-bearing member (i.e. that `label` is gone rather than empty).

**One limitation, stated plainly because it decides how much the text above is worth.** The half of
M-21 that binds the *client* — "a client MUST author the wording of every affordance it renders" —
**cannot be expressed as a data vector at all**, for exactly the reason M-12 has no vector today
(`spec/08-conformance.md:33` lists visibility-matrix tests as in scope and they have not been
written). A vector can pin what a node emits; it cannot inspect what a client paints. Enforcing the
client half needs a client-side conformance harness that the suite does not have and the v0 scope
does not describe. Per `GOVERNANCE.md` that half is prose, not a conformance requirement, whichever
option the author picks — and the reference implementation's own approach (a gate scanning rendered
output against `vocabulary.ts`) is the shape such a harness would take, if the author wants one.

### 6. Confidence

**High** on the facts: the constant labels, the discard and its two tests, the vocabulary gate, the
absent `docs/ui-design.md`, and the `'Release'`/dismiss mismatch.

**Medium on which option to take**, and the readings do not collapse:

- **Reading A — `label` is a node's legitimate output.** A node knows things a client does not: which
  persona, which act, which state, and — for a hosted or org-operated node — what vocabulary that
  organization uses. On this reading `primary_action.label` is a feature, the reference client's
  blanket discard throws away real information, and the right fix is option 1: keep the field, make
  it advisory, and let clients that trust their node use it.
- **Reading B — display is the client's, categorically (recommended).** M-12 already committed the
  protocol to that split for identity; `primary_action.label` is the one place it is not honoured,
  and the reference implementation independently arrived at the split anyway. On this reading the
  field is a v0 mistake that is cheap to remove now and permanent after freeze.

The evidence that moves this toward B rather than leaving it a taste question is the verified
`'Release'` mismatch: the field's first non-hypothetical use in this codebase was to name an act
the call does not perform. **That is a fact about the field, not a preference about registers.**

---

## Summary

| # | Issue | Class | Proposed resolution, in one line | Vector impact | Changes a hash preimage? | Confidence |
|---|---|---|---|---|---|---|
| 1 | **#18** unbounded envelope `payload` | gap — spec silent | Add normative bounds (canonical form, depth, `refs`, per-string octets) + a mandatory `clipped` marker to §2; new **M-19** | **NEW vector family** `vectors/envelope/` — none exists; the §2 `id` preimage has no vector at all | **Yes — the §2 envelope `id`.** But it is vault-local (`spec/02:3`), stored nowhere in the reference, so the blast radius is a node's own cache, not stored wire data | High on facts and on the "silence makes a preimage implementation-defined" diagnosis; **low on the numbers** |
| 2 | **#19** `actions` name no tool | gap — spec silent | Give `actions` the `{act, tool, args}` shape, add a sixth `act` tool for `done`/`release`, declare `supersede`/`delegate`/`ping` unbound with `tool: null`; new **M-20** | **NEW vector family** `vectors/node-surface/` — none exists | No. Changes the `open_loops` output shape only; no signed object, no vector | High on facts; **medium** on the fix — Reading B (shrink the array) written out uncollapsed |
| 3 | **#20** `primary_action.label` | gap — spec silent | Replace `label` with a typed `act` from one shared vocabulary; no user-facing copy crosses the surface; new **M-21** | **Same NEW family as #19** — decide the two together | No. `brief` output is not a signed object | High on facts; **medium** on the option — Reading A (`label` is legitimate node output) written out uncollapsed |

### Proposals that change a hash preimage

**One, and only one: #18.** Any bound on `payload` — and equally, the *absence* of one — determines
the input to `spec/02-signal-envelope.md:9`'s `id = sha256(canonical form sans id)`. This is the
third preimage in the spec and the correction at the head of this packet; the ratification packet's
"two hash preimages" statement is correct for wire objects and does not cover it.

The blast radius is unlike the four preimage changes the ratification packet identified. `edge_id`
and `commitment_hash` are referenced by stored, signed, cross-party data — vaults, assertion chains,
`blocked_by`, `supersedes`. An envelope `id` never crosses a node boundary
(`spec/02-signal-envelope.md:3`), appears in no signed object, is not in the `commitment_hash`
preimage (`spec/03-commitment.md:28`), and is not persisted at all by the reference implementation
(`impl:packages/vault/src/records.ts:33` holds a reference, not a record). So changing it invalidates
a node's own local references and nothing else. **#18 is therefore the one preimage decision in
either packet that is genuinely cheap to defer — which is the opposite of #8, where deferring is
strictly more expensive than deciding.**

Neither #19 nor #20 touches any hash or signing preimage.

### Proposals requiring a NEW vector family

All three, and they are **two** families, not three:

1. **`vectors/envelope/`** (#18) — six or so cases: a pinned in-bounds envelope `id`, an ASCII clip at
   the octet boundary, an astral-plane clip at a scalar boundary, a `clipped: true` case, and
   negative cases for depth / `refs` count / total size. Fits the existing data-in/data-out shape
   exactly, like `canonicalization/` and `hashing/`.
2. **`vectors/node-surface/`** (#19 **and** #20) — roughly 12–20 `actions` cases (§4.3 states ×
   viewer role) plus 10–14 `act`-tool cases, plus the `brief` slot shape. Partly outside the suite's
   current shape: it can pin node output given an edge-and-chain state, and it **cannot** pin any
   client behaviour, which is why the client half of M-21 stays prose — the same hole M-12 already
   sits in.

Nothing in this packet extends an existing family.

### Sequencing note

**#19 and #20 must be decided together.** They propose the same `{act, tool, args}` shape, share the
`act` vocabulary, and need one vector family between them. Deciding #20 alone (advisory `label`)
forecloses the consistent shape #19 needs; deciding #19 alone leaves `brief` and `open_loops`
describing the same act two ways.

**#18 is independent of both** and of everything in the ratification packet: it touches §2 only, and
its preimage is not the `commitment_hash`/`edge_id` chain that #8, #10 and #11 all pull on. It can
be taken first, last, or alone.

Two follow-ups this packet does not resolve and that are not gaps in the spec:

- `spec/02-signal-envelope.md:24` names `emit_envelope` as the connector/core contract, and it does
  not exist in the reference implementation. That is an implementation gap, not a spec question,
  but it is where §1's bounds would have to be enforced once the path exists.
- `impl:packages/connectors-github/README.md:48-50` describes behaviour its own code does not have
  (`text_length` is not recorded by that connector). That is an implementation-repo correction, not
  a spec matter.

### Downstream consequence

Same two-repo mechanics as the ratification packet: `escapeboy/servanda` vendors the vectors and
`gates/ga-node.sh` enumerates the M-numbers, so **M-19, M-20 and M-21 each break a gate there until
it is updated**. New MUSTs append and nothing is renumbered; each must also be added to the "v0
suite scope" sentence at `spec/08-conformance.md:33`, which currently lists no envelope tests and no
node-surface tests. Both new families are build artefacts produced by
`cd tools/vectors-gen && npm run generate && npm test`, never by hand-editing `vectors/*.json`.
