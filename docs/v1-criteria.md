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
| 1 | Every §8 MUST is either covered by a vector or **counted** as a prose obligation, with no third category | **met** — five prose obligations, each with its reason ([#42](../../issues/42)) |
| 2 | A second implementation, written from the specification and vectors alone | **NOT met** — see below |
| 3 | No known divergence between the specification and the reference implementation | **met** — §2's connector-transport requirement was withdrawn |
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

**The four §9.6 items** — threshold group signing, formal verification of the transition table,
anonymous credentials for cross-org level-3, post-quantum suites. §9.6 records why each is
deferred rather than treating them as one bundle.

## Gate 2, and what "independent" was narrowed to mean

The gate was originally "a second implementation with an independent AUTHOR". It has been
reformulated, and the reformulation is a narrowing that should be visible rather than absorbed:

> A second implementation, written from `spec/` and `vectors/` alone, with no access to the
> reference implementation, which passes the conformance suite.

A Python derivation was built from the specification and the vectors, and it did real work: it
found six disagreements, three of them defects in the reference implementation, all since fixed.

**It no longer exists.** The derivation was produced to answer a question, its findings were
absorbed, and the code was not kept. So what this project holds is a RECORD that a second
implementation once agreed, not a second implementation — and the gate as written says "which
passes the conformance suite", which nothing currently does. The suite has also grown since:
`visibility/`, the collective-edge cases and `edge-id-does-not-bind-its-body` all postdate it, so
even a preserved copy would not pass today without changes.

This was recorded as met until someone checked. It is worth noting how it read while it was
wrong — "**met** — see below" over a paragraph that described a past event in the past tense —
because that is what a gate looks like when it has quietly decayed rather than been abandoned.

**What it would take.** The conformance runner exists precisely so a third-party implementation
can be graded without this repository's harness, and the NDJSON protocol is documented in
`tools/conformance-runner/PROTOCOL.md`. An implementation that answers the Node-level ops and is
run under it would meet the gate as written.

**What it still would not be:** an independent author. Every implementation this project can
produce shares the priors of the one that wrote the specification, so the classes of mistake
nobody thought to look for stay unlooked-for. Meeting the narrowed gate is worth doing; calling it
"independent implementation" without this paragraph would be the claim the audit found this
project making elsewhere.

## Gate 5: the discussion-window register

`GOVERNANCE.md` requires a normative change to stay open **14 days** before merge, and a
constitutional one **30**. That rule was written to stop one author deciding alone, so a register
of what is inside the window belongs where the gate is, not in a commit message.

| Change | Class | Landed | Window ends |
|---|---|---|---|
| §4.1 an unbound `edge_id` is refused | normative | 2026-08-02 | 2026-08-16 |
| §0 signing-preimage stripping is top-level only | normative | 2026-08-02 | 2026-08-16 |
| §9.3 two Argon2id profiles, passphrase-generation MUST, required re-wrap path | normative | 2026-08-02 | 2026-08-16 |
| §5.4 / M-15 an implementation MUST document deletion's reach | normative | 2026-08-02 | 2026-08-16 |
| §2 the MCP-server requirement for connectors is withdrawn | normative | 2026-08-02 | 2026-08-16 |
| §4.3 `pending-acceptance` has exactly three exits | editorial-with-vectors | 2026-08-02 | — |
| §4.7 `expected_unverifiable`, M-8 and M-9 covered | editorial-with-vectors | 2026-08-02 | — |
| §5.3 visibility matrix, M-4 covered | editorial-with-vectors | 2026-08-02 | — |
| §9.6 deferred past v1; external review removed as a gate | editorial | 2026-08-02 | — |

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
