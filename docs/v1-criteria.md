# What v1 requires

Until this file existed, "v1" was a set of gates that lived in the maintainer's head and in one
sentence of `SECURITY.md`. That is a bad place for a release criterion: a gate nobody wrote down
is a gate that can be quietly met, quietly dropped, or quietly forgotten, and the difference is
invisible afterwards.

This document is normative about **process**, not about the wire. What v1 means for an
implementation is [`spec/08-conformance.md`](../spec/08-conformance.md) and nothing else.

## The gates

| # | Gate | State |
|---|---|---|
| 1 | Every §8 MUST is accounted for, in a category that says what it is | **met** — four categories, listed below ([#42](../../issues/42)) |
| 2 | A second implementation, written from the specification and vectors alone | **met** — `servanda-py`, Node PASS 176/176, claim granted |
| 3 | No known divergence between the specification and the reference implementation | **met again as of 2026-08-04** — §7 caught up with three behaviours the implementation had grown ahead of it; see below |
| 4 | The conformance suite is executable by a third party without this repository's test harness | **met** — `tools/conformance-runner` |
| 5 | Every normative change has served its `GOVERNANCE.md` discussion window | open until **2026-08-18** — see the register below |

## What is deliberately NOT a gate

**An external cryptographic review.** This was carried as a v1 gate and is now removed, as a
decision rather than an omission. The reasoning that removed it is worth keeping, because it is
the same reasoning that would have to be reversed to restore it:

- The gate could not be discharged from inside the project. An adversarial pass by agents the
  editor runs is the editor reviewing the editor: same priors about what is worth checking, no
  independent selection, no accountability. §00 said as much and was then discharged by the
  editors anyway, which is how a gate becomes a formality.
- Carrying a gate that will not be met blocks v1 indefinitely and, worse, makes the honest
  statement in `SECURITY.md` look like a temporary condition rather than the standing one.

So: **v1 may be declared without a cryptographic review, and `SECURITY.md` says plainly that none
has happened.** That sentence is the deliverable, not the audit. An implementer who needs
assurance obtains it independently, and the specification tells them clearly that they must.

## Gate 1: four categories, not two

This gate was written as "covered by a vector **or** counted as a prose obligation, with no third
category", and §8 has four. The gate's wording was wrong, not §8 — collapsing these would hide
exactly the distinctions that make the count meaningful:

| Category | MUSTs | What it means |
|---|---|---|
| **Covered** | M-2, M-4, M-8, M-9, M-12, M-14, M-17, M-18, M-19, M-20, M-21 | A vector case exercises the rule and pins the outcome |
| **Partial** | M-1, M-3, M-7 | Exercised in part. M-1 and M-3 have named negative cases in `transitions/invalid.json`; M-7's first half is pinned by `hashing/` and its second half ("plaintext never appears in a wire object") is a negative no vector demonstrates |
| **Prose obligation** | M-5, M-6, M-11, M-15, M-16 | No vector can reach them, for the reasons §8 gives per rule. Not work outstanding — the count that CAN fall is the one above |
| **Not a gap** | M-10, M-13 | Uncovered and unreachable by construction: one is a property of a deployment, the other of key custody. §8 names them so a reader counting does not count them as debt |

The categories are the deliverable, not the totals. "Eight uncovered" and "five uncovered" were
both true statements about different sets, and it was possible to say either without noticing —
which is how §8 came to claim two vector families that had never existed.

**The four §9.6 items** — threshold group signing, formal verification of the transition table,
anonymous credentials for cross-org level-3, post-quantum suites. §9.6 records why each is
deferred rather than treating them as one bundle.

## Gate 3 went red, and how

**This gate is the one that product work moves in the wrong direction, and it did.** Between
2026-08-03 and 2026-08-04 the reference implementation grew three normative behaviours that §7 did
not describe: `expire` from `open` after `due`, the `due-not-elapsed` refusal, and `open_loops`
paging with `next_cursor`/`skipped` — the last against a paragraph that still said "a count and
not a cursor, deliberately". Implementation-leads-specification is this project's working pattern
and is not itself a fault; leaving the text behind is, because this gate is worded as *no KNOWN
divergence* and three of them were known and written down.

It was closed on 2026-08-04 by landing the text rather than by reverting the code. One divergence
went the other way and closed itself: `view:"pending"` now serves both halves of the sentence §7
always had, which it did not before.

The lesson is about sequencing rather than about any of the three: a sprint that changes behaviour
opens this gate, and it stays open until a specification sprint follows. Planning product work
without pairing it to spec work therefore moves v1 further away while looking like progress.

## Gate 3, and why a universal negative is never really "met"

**§1.7 is implemented.** A vault record type, an ingestion path with three gates, and a transition
table that resolves each party to the keys it has held. What follows is kept because the gate read
"met" once before on weaker evidence, and the shape of that mistake is the useful part.

### What it was

§1.7's central MUST — *"verifiers MUST treat `new` as the successor for all open edges of
`old`"* — was prose. `resolveSuccessor` existed, was correct, and had **no production caller**.
`Vault` had no rotation record type, so a counterparty holding a valid statement had nowhere to
put it. §1.7 lists rotation as one of two seedless recovery paths and ADR-0014 argues a persona
survives the loss of a device; it did not. A 566-day story that rotated a key continued only
because the persona still held the seed — **the recovery path for the case where you have lost
everything worked only when you had lost nothing.**

### The three gates, and why possession is not enough

A rotation is a PUBLISHED artefact — that is the whole point of the second seedless path. §6.6
already learned what follows: anyone who merely OBSERVED one could replay it, and a signature that
verifies is not proof that the person it names is the one talking to you. So a node accepts a
statement only when it verifies under the key it rotates FROM, arrives from one of its own two
keys, and concerns a key that is party to an edge this node holds. The last one is not politeness:
without it any persona that can reach you fills your vault with rotations about strangers, an
unbounded store keyed by attacker-chosen values in a place §6.5's proposal budget does not look.

There is deliberately no further "proof" gate. §1.7's residual note asks a verifier to require the
new key to sign its own first assertion before treating it as active, and that is exactly what
happens: the successor becomes real by ACTING, and the transition table judges that act like any
other. No window exists in which the successor is trusted without having done anything.

### The rule that was nearly got wrong

Resolving a party to its newest key **invalidates its own history**. Every assertion the party
signed before rotating stops verifying, so the chain that opened the edge collapses and the edge
is not continued but erased. §1.3 had already settled this for revocation — *"edges signed before
`revoked_at` remain valid (offboarding semantics)"* — and the reasoning is identical: a key that
was current when it signed was current when it signed.

So a party resolves to a LINEAGE, each key valid up to the rotation that replaced it, and only the
newest one open. Going forward only the newest acts, which is the point: §1.7 exists for the case
where the old key is lost or compromised, and a rotation that merely ADDED a key would leave the
compromised one working beside its replacement.

At a fork, continuity stops and both candidate keys are strangers to the edge — §1.7's own rule,
and the safe direction to fail in.

### Why this gate stays provisional

It is a universal negative, and one example never supports one. It read "met" on the strength of
§2's connector requirement being withdrawn, and two more divergences were sitting behind that
sentence at the time. Nothing about implementing §1.7 makes the next one less likely; it makes it
unlooked-for, which is different.

## Gate 2, and what "independent" was narrowed to mean

The gate was originally "a second implementation with an independent AUTHOR". It has been
reformulated, and the reformulation is a narrowing that should be visible rather than absorbed:

> A second implementation, written from `spec/` and `vectors/` alone, with no access to the
> reference implementation, which passes the conformance suite.

A Python derivation was built from the specification and the vectors, and it did real work: it
found six disagreements, three of them defects in the reference implementation, all since fixed.

**It was not kept**, and the gate was recorded as met for weeks on the strength of it. The code
was thrown away once its findings were absorbed, so what the project actually held was a RECORD
that a second implementation had once agreed. It is worth noting how that read while it was
wrong — "**met** — see below" over a paragraph in the past tense — because that is what a gate
looks like when it decays rather than being abandoned. Nobody changed it; the world moved.

**A second implementation now exists and is kept.** `servanda-py` — a Python implementation of
the Node level, ~1200 lines, written against `spec/`, `vectors/` and this repository's
`tools/conformance-runner/PROTOCOL.md`, with the reference implementation and `tools/vectors-gen/`
both out of reach (the generator's own verifier is the same problem one level down). It answers
the runner's NDJSON protocol:

```
node run.mjs --vectors ../../vectors --claim node -- python3 .../servanda_node.py
→ Node PASS 176/176, CLAIM GRANTED
```

That it computes rather than replays was checked rather than assumed: it reads no vector file,
and its only JSON parsing is of the request it was handed.

**It earned its keep on the first run** — two defects, both below.

### What it found

**A conformance operation that could not be answered from its own input.**
`signing_preimage` was handed `{signed_object, signer}` and required to distinguish
`signature-by-another-key` from `signature-does-not-cover-this-object`. Those two inputs separate
"not a signature" from "not a signature over this object" and go no further: naming *another* key
requires having one. The op asked for a distinction without supplying the means.

It passed anyway — by accumulating keys it had seen in earlier families and relying on
`derivation` being asked before `signatures`. An ordering dependency `PROTOCOL.md` never stated,
which its author found only because it wrote the whole thing from the document. The reference
implementation could not have found it: it has every key in scope already.

Fixed by supplying `known_keys`, exactly as `verify_inbox_record` already did and for the same
stated reason. Naming the keys never rescues a bad signature; it lets a refusal say something
true.

**And §7's `args` was a partial tool input while the prose said "verbatim".** The vectors pin
`{id, act}` for `done` — without the `evidence_hash` that `act`'s own input schema requires. Both
cannot be true: passed verbatim, `{id, act}` is a malformed call. The vectors were right. §7 now
states the shape per member and says why `evidence_hash` is excluded — only the caller can produce
evidence, and a node filling it in would be asserting on the caller's behalf (M-13). Seventh
instance of `GOVERNANCE.md`'s mirror rule, and the first found from outside.

Neither was reachable from inside. The reference implementation and the generator's own verifier
agree with each other, and agreement between two things written by the same author is not evidence
about the text.

**And a third, from the same source on its second run.** §4.3's "the three `pending-acceptance`
rows are all of them" — added the same morning — contradicts §4.4's contest rule, which must fire
from `pending-acceptance` or an `on-acceptance` edge never converges. A cold reader hit the
contradiction, could not resolve it from the text, and worked out the right answer by reasoning
about §6.4 convergence instead. That is the definition of an under-specified sentence: correct
behaviour reachable only by rederiving why the rule exists.

It is worth noticing where all three came from. Not one is a defect in the Python. Every one is a
place where this specification said less than it meant, or two of its sections disagreed — and
each was invisible from inside, because the reference implementation and the generator agree with
each other and agreement between two things one author wrote is not evidence about the text.

**What it still is not:** an independent author. Every implementation this project can
produce shares the priors of the one that wrote the specification, so the classes of mistake
nobody thought to look for stay unlooked-for. Meeting the narrowed gate is worth doing; calling it
"independent implementation" without this paragraph would be the claim the audit found this
project making elsewhere.

## Gate 5: the discussion-window register

`GOVERNANCE.md` requires a normative change to stay open **14 days** before merge, and a
constitutional one **30**. That rule was written to stop one author deciding alone, so a register
of what is inside the window belongs where the gate is, not in a commit message.

**The register below covered one day and the gate says "every".** It was written on 2026-08-02
listing that afternoon's changes, and `servanda/0.2` opened on 2026-08-01 — so everything between
the freeze and that afternoon was missing, including the day's largest security fix. Found by
diffing this table against `git log`, which is the only way it was ever going to be found.

| Change | Class | Landed | Window ends |
|---|---|---|---|
| §1.5 the anchor TXT version does not follow the wire version (`d25985d`) | normative | 2026-08-01 | 2026-08-15 |
| §4.3 the backdating rule does not survive recon (`03e98ce`) | normative | 2026-08-01 | 2026-08-15 |
| §8 what a client conformance harness must be (`9977dbb`) | normative | 2026-08-01 | 2026-08-15 |
| §6.1 a challenge signature names the hub it is for (`b53b585`) | normative | 2026-08-02 | 2026-08-16 |
| #44 six surface rules the vectors were deciding (`11716a4`) | normative | 2026-08-02 | 2026-08-16 |
| §7 `args` is a partial tool input (`cf62083`) | normative | 2026-08-02 | 2026-08-16 |
| §4.1 an unbound `edge_id` is refused | normative | 2026-08-02 | 2026-08-16 |
| §0 signing-preimage stripping is top-level only | normative | 2026-08-02 | 2026-08-16 |
| §9.3 two Argon2id profiles, passphrase-generation MUST, required re-wrap path | normative | 2026-08-02 | 2026-08-16 |
| §5.4 / M-15 an implementation MUST document deletion's reach | normative | 2026-08-02 | 2026-08-16 |
| §2 the MCP-server requirement for connectors is withdrawn | normative | 2026-08-02 | 2026-08-16 |
| §4.3 `pending-acceptance` has exactly three exits | editorial-with-vectors | 2026-08-02 | — |
| §4.7 `expected_unverifiable`, M-8 and M-9 covered | editorial-with-vectors | 2026-08-02 | — |
| §5.3 visibility matrix, M-4 covered | editorial-with-vectors | 2026-08-02 | — |
| §9.6 deferred past v1; external review removed as a gate | editorial | 2026-08-02 | — |
| §7 `contested-closure` is live and advertises only `supersede` | normative-with-vectors | 2026-08-03 | 2026-08-17 |
| §7 `open_loops` is ranked and reports `total` | normative | 2026-08-03 | 2026-08-17 |
| §7 `expire` joins the act vocabulary; §4.4's third exit is bound to `act` | normative-with-vectors | 2026-08-03 | 2026-08-17 |
| §7 `expire` is legal from THREE states; `open` after `due` is the third, advertised to both parties | normative | 2026-08-04 | 2026-08-18 |
| §7 `due-not-elapsed` joins the `act` rejection projection | normative | 2026-08-04 | 2026-08-18 |
| §7 `open_loops` takes `cursor` and returns `next_cursor` + `skipped`; the ranking instant is frozen for a walk | normative | 2026-08-04 | 2026-08-18 |

**The register drifted a second time, and the same diff found it.** The three 2026-08-04 rows above
were normative changes made in the reference implementation on 2026-08-03/04 and written into §7
on 2026-08-04; none of them was recorded here until the v1 question was asked directly. The first
drift was caught by diffing this table against `git log`; so was this one. That is now twice, which
makes it a property of the process rather than an accident: **a register that is updated by
remembering to update it will be wrong.** The check that finds it is mechanical and the discipline
that prevents it is not, so the check is the thing to keep.

**§6.1 landed with no vector, and `GOVERNANCE.md` says a normative PR MUST update `vectors/` in
the same PR.** It is the one entry here that is not merely late to the register: the audience
binding is a wire-visible rule, a vector can pin it, and none does. Until one exists, a conforming
implementation may omit the check and pass the suite — which is `GOVERNANCE.md`'s own rule that an
uncovered behaviour is not yet a conformance requirement, applied to the day's largest security
fix. **Outstanding work, not bookkeeping.**

**`expire` widens a CLOSED vocabulary, which is the heaviest kind of change here, and it is the
one entry today that fixes a contradiction rather than a gap.** §4.4 argues at length that the
third exit from `disputed` and `contested-closure` is *not optional* — "a state two people can
enter by accident and cannot leave alone is a worse trap than the divergence it replaces" — while
§7 offered no act that reaches it and described the absence as "time and not an act". It is not
time: §4.3 and §4.4 both say a party *asserts* `expired`. So the escape one section calls
mandatory was, at the surface the other section defines, unreachable.

Found by the independent implementation, from the text alone, by asking what a trapped party is
supposed to press. That is the second time this artefact has produced a finding of exactly this
shape — the first was §1.7 rotation, correct in the transition table and refused on the wire — and
it is the shape a reference implementation cannot find in itself, because the code and the spec
were written by the same person on the same day and agree.

**`open_loops` is the second entry with no vector, for the same structural reason and it should
not be read as the same mistake.** §6.1 could be pinned and was not. This one *cannot* be pinned
today: there is no `open_loops` op in `tools/conformance-runner/PROTOCOL.md` and no vector family
for the tool at all — the suite reaches §7 through `advertise_actions`, `act`, `judge_brief_slot`
and `grade_verification`, none of which returns a page of items. So "ranked, and `total` is the
view's size" is a normative rule that no implementation can currently be failed for ignoring.

Building that family is real work — a runner op, a `PROTOCOL.md` shape, a generator case set, and
an independent implementation that has to grow a ranking to match. **Named here rather than done,
and named as outstanding rather than as covered**, because the failure this document exists to
prevent is a gate recorded as met with nothing behind it.

The `contested-closure` row above is the shape this should have: the rule went into §7 and
`node-surface/actions.json` gained both seats in the same change, which is why it is classed
`normative-with-vectors`.

None is constitutional: nothing above touches the thirteen README principles. The
editorial-with-vectors rows carry no window by `GOVERNANCE.md`'s own rule — they add cases for
behaviour the normative text already required, which is why the class exists.

**The window is time, not work, and it is also not a formality.** Its purpose is that somebody
else can object, and this project currently has no other implementers to ping. `GOVERNANCE.md`
says silence from every known implementer BLOCKS a merge rather than permitting it; with an
implementer set of zero, that clause has nothing to bite on. Recorded here rather than resolved,
because pretending a window did its job is worse than serving one that could not.

## Decisions recorded here rather than inferred

| Question | Answer | Date |
|---|---|---|
| §9.3 Argon2id values | desktop m = 1 GiB / t = 2 / p = 4, constrained-device 64 MiB / 3 / 1 as the floor, plus a MUST on passphrase generation and a required re-wrap path | 2026-08-02 |
| Are the §9.6 items v1 gates? | No — explicitly deferred past v1 | 2026-08-02 |
| Is an external cryptographic review a v1 gate? | No — removed, with `SECURITY.md` stating plainly that none has happened | 2026-08-02 |
| What counts as a second implementation? | Written from spec + vectors alone; independent *authorship* is acknowledged as unmet | 2026-08-02 |
