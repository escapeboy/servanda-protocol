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
| 3 | No known divergence between the specification and the reference implementation | **NOT met** — §1.7 rotation is unimplemented |
| 4 | The conformance suite is executable by a third party without this repository's test harness | **met** — `tools/conformance-runner` |
| 5 | Every normative change has served its `GOVERNANCE.md` discussion window | open until **2026-08-16** — see the register below |

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

## Gate 3: §1.7 rotation is prose

The gate read "met" on the strength of one divergence being closed (§2's connector transport).
It is a universal negative and one example does not support it — which S8 said at the time, and
which S5 then demonstrated by finding another.

**§1.7's central MUST is unimplemented.** *"The signature by `old` is what transfers continuity:
verifiers MUST treat `new` as the successor for all open edges of `old`."* In the reference
implementation:

- `resolveSuccessor` exists, is correct, and has **no production caller** — only tests.
- `Vault` has **no rotation record type at all**, so a counterparty holding a valid rotation
  statement has nowhere to put it.
- Consequently: a rotated key on its own open edge is refused `signer-not-a-party`, and over the
  wire the counterparty's inbox discards it `sender-is-not-a-party`.

What makes this worth naming rather than filing quietly is what it costs. §1.7 lists rotation as
one of two seedless recovery paths, and ADR-0014's whole argument is that a persona survives the
loss of a device. It does not: the story S5 ran only continued because the persona still held the
seed — that is, because the rotation was unnecessary. **The recovery path that exists for the case
where you have lost everything works only when you have lost nothing.**

Not fixed here. It is a feature, not a patch — a vault record type, an ingestion path, and a
transition table that accepts a successor key — and doing it badly under time pressure is how a
key-continuity mechanism becomes an account-takeover vector. Recorded as the gate it blocks.

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

**§6.1 landed with no vector, and `GOVERNANCE.md` says a normative PR MUST update `vectors/` in
the same PR.** It is the one entry here that is not merely late to the register: the audience
binding is a wire-visible rule, a vector can pin it, and none does. Until one exists, a conforming
implementation may omit the check and pass the suite — which is `GOVERNANCE.md`'s own rule that an
uncovered behaviour is not yet a conformance requirement, applied to the day's largest security
fix. **Outstanding work, not bookkeeping.**

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
