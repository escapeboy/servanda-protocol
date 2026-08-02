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
| 2 | A second implementation, written from the specification and vectors alone | **met** — see below |
| 3 | No known divergence between the specification and the reference implementation | **met** — §2's connector-transport requirement was withdrawn |
| 4 | The conformance suite is executable by a third party without this repository's test harness | **met** — `tools/conformance-runner` |
| 5 | Every normative change has served its `GOVERNANCE.md` discussion window | open, and it is time rather than work |

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

That is what was produced: a Python derivation built from the specification and the vectors, which
found six disagreements — three of them defects in the reference implementation. It is real
evidence and it did real work.

**What it is not:** an independent author. Every implementation this project can produce shares
the priors of the one that wrote the specification, so the classes of mistake nobody thought to
look for stay unlooked-for. The narrowed gate is met; the broader one is not, and calling the
narrowed one "independent implementation" without this paragraph would be the claim the audit
found this project making elsewhere.

## Decisions recorded here rather than inferred

| Question | Answer | Date |
|---|---|---|
| §9.3 Argon2id values | desktop m = 1 GiB / t = 2 / p = 4, constrained-device 64 MiB / 3 / 1 as the floor, plus a MUST on passphrase generation and a required re-wrap path | 2026-08-02 |
| Are the §9.6 items v1 gates? | No — explicitly deferred past v1 | 2026-08-02 |
| Is an external cryptographic review a v1 gate? | No — removed, with `SECURITY.md` stating plainly that none has happened | 2026-08-02 |
| What counts as a second implementation? | Written from spec + vectors alone; independent *authorship* is acknowledged as unmet | 2026-08-02 |
