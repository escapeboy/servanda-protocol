# Governance

How the Servanda specification changes, and what "implements Servanda" means.

## Scope

This document governs `spec/`, `vectors/`, and the conformance suite. It does not govern any
implementation.

## Roles

- **Editors** — merge rights on `spec/`. Currently: N. Katsarov. Editors do not decide by fiat on
  normative changes; they decide when the process below has been satisfied.
- **Contributors** — anyone opening an issue or PR.

While the spec is at `v0.x` and pre-review, the editor set is deliberately small. It widens at v1.

## Change classes

Every change is one of four classes. The class determines the process and the version bump.

| Class | Meaning | Examples |
|---|---|---|
| **Editorial** | Cannot change any conforming implementation's behaviour. | typos, broken links, clarified prose that adds no requirement, reordering |
| **Normative** | Changes what an implementation MUST/SHOULD do, or changes bytes on the wire. | new field, changed hash preimage, altered transition table row, new MUST |
| **Constitutional** | Contradicts one of the 13 principles in the README. | anything introducing reputation, membership-based visibility, agents as signing parties |
| **Editorial-with-vectors** | Editorial prose, but the conformance vectors change. | tightening an under-specified encoding the generator already assumed |

If a change's class is disputed, it is treated as the higher class until an editor rules otherwise.

## Process

### 1. Issue first

Every normative change starts as an issue, not a PR. Use the
[normative change template](.github/ISSUE_TEMPLATE/normative-change.md). It must state:

- the section(s) affected,
- what breaks today (a concrete failing case, not a preference),
- the proposed text,
- which implementations the change invalidates.

A PR without a linked issue will be asked for one. Editorial fixes are exempt — open the PR.

### 2. Discussion

Normative issues stay open for **at least 14 days** before a PR is merged, so that people in other
timezones and other implementations can object. Constitutional changes: **30 days minimum**, and
they require an explicit statement of which principle is being amended and why the principle was
wrong — not why the change is convenient.

An issue with no objections is not the same as an issue with agreement. Silence on a normative
change from every known implementer blocks the merge; ping them.

### 3. PR

- Label `normative-change` on every PR touching a MUST/SHOULD/MAY, a wire object, a hash preimage,
  or the transition table. Labelling is the author's responsibility; a reviewer adding it is a
  signal the change was under-declared.
- A normative PR MUST update `vectors/` in the same PR. A normative change with no vector change is
  either not normative, or the vectors are incomplete — resolve which before merging.
- A normative PR MUST list the affected M-numbers (§8) in its description.
- CI must be green: link check, vector schema validation, and `vectors-gen` self-check.

### 4. Merge

Editorial: one editor. Normative: one editor + the discussion window elapsed with objections
resolved. Constitutional: all editors, and the README principle list is amended in the same PR.

## Versioning

The protocol version string (`v` on every wire message) is `servanda/MAJOR.MINOR`.

- **MINOR bump** (`servanda/0.1` → `servanda/0.2`) — any normative change. Pre-1.0 there is no
  backward-compatibility guarantee between minors; the `v` field exists so a node can refuse rather
  than misinterpret.
- **MAJOR bump** — reserved for post-v1 incompatible change.
- **Editorial changes do not bump anything.** They are released as spec revisions dated in
  `spec/00-overview.md`.
- **Pre-freeze exception — ENDED 2026-08-01.** While the status banner read `DRAFT v0.x-pre`,
  normative changes could land without a minor bump, because nothing was expected to be
  interoperating yet. The banner came off when v0.1 froze, which is the act this clause was written
  to make deliberate and visible. It is kept here rather than deleted so that the rule which
  governed every commit before that date remains legible.

  Since the freeze: **a normative change requires `servanda/0.2`.** There is no longer a way to
  alter normative text without moving the version a node reads off the wire.

Every released version tags the repository and pins the vectors that define it.

## Conformance is the definition

**"Implements Servanda" means "passes the conformance suite."** Not "was written by the editors", not
"looks like the reference implementation".

- The suite is `vectors/` plus the property tests that consume them (§8 lists v0 scope: canonical
  form, signatures, transition-table rejection, visibility matrix, M-11 negative tests).
- A claim of conformance names the suite version it passed and the conformance level it claims
  (Node / Federating node / Hub / Client, per §8).
- **A behaviour not covered by the suite is not yet a conformance requirement**, however clearly the
  prose states it. This is intentional: it puts pressure on the suite to be complete, and it stops
  conformance from being an argument about interpretation.
- Consequently, the correct response to "the spec says X but nothing tests X" is a PR adding the
  vector — and that PR is `editorial-with-vectors`, not normative.
- Use of the protocol name is gated on passing the suite (ADR-0001). **There is no registered mark
  and there will not be one** (#1), so the suite is not one defence among three — it is the one
  that has to hold. A claim of "implements Servanda" is answerable here and nowhere else.

## Where things that are not spec changes go

- An idea for the product or the reference implementation → the implementation repository, not here.
- A question about what a section means → the [question template](.github/ISSUE_TEMPLATE/question.md).
  If the answer requires reading the author's mind, that is a spec defect: the issue stays open and
  becomes an editorial PR.
- A security problem → [SECURITY.md](SECURITY.md). Not the public tracker.
