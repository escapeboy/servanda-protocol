# Contributing

This repository holds a protocol specification and its conformance vectors. Contributions are
mostly *arguments and test cases*, not code.

Read [GOVERNANCE.md](GOVERNANCE.md) before proposing normative text — it defines change classes,
the discussion windows, and what "implements Servanda" means.

## What is most useful

1. **Break the transition table.** Construct an assertion sequence that §4.3 does not clearly reject
   but that a reasonable verifier would accept. Send it as a vector in `vectors/transitions/`.
2. **Break canonicalization.** A JSON value where two plausible RFC 8785 implementations disagree
   belongs in `vectors/canonicalization/`.
3. **Find under-specification.** Anywhere two independent implementers would produce different bytes
   from the same spec text is a defect, even if the prose reads well. `vectors/README.md` lists the
   places we already know about.
4. **Answer an open question.** Issues #1–#8 are unresolved design decisions. A reasoned argument
   with tradeoffs is worth more than a vote.

## Before opening an issue

Search existing issues. Then pick the template:

- **[Normative change](.github/ISSUE_TEMPLATE/normative-change.md)** — you want an implementation to
  have to behave differently. Requires a concrete failing case.
- **[Editorial](.github/ISSUE_TEMPLATE/editorial.md)** — typo, dead link, unclear sentence that adds
  no requirement.
- **[Question](.github/ISSUE_TEMPLATE/question.md)** — you cannot tell what a section requires. This
  is a valid contribution: if the answer is not in the text, the text is wrong.

## Pull requests

- One concern per PR.
- **Conventional commits.** `spec:`, `vectors:`, `tools:`, `docs:`, `ci:`, `chore:`. Breaking
  normative changes carry `!` (e.g. `spec!: change commitment_hash preimage`).
- A PR that changes any MUST/SHOULD/MAY, wire object, hash preimage, or transition-table row **must**
  carry the `normative-change` label, link its issue, update `vectors/`, and list the affected
  M-numbers from §8.
- Editorial PRs need no issue.
- CI must pass: markdown link check, JSON schema validation of every vector, and the `vectors-gen`
  self-check (committed vectors must equal regenerated vectors, byte for byte).

### Working on vectors

Vectors are **generated, not hand-written**. Edit `tools/vectors-gen/src/`, then:

```bash
cd tools/vectors-gen
npm ci
npm run generate   # rewrites ../../vectors
npm test           # regenerates into a temp dir and diffs against the committed tree
```

A PR that edits a file under `vectors/` by hand will fail CI. That is the point: the vectors are a
build artifact of a deterministic generator, so anyone can reproduce them and nobody has to trust a
committed blob.

Generation must stay deterministic — no timestamps, no randomness, no network. Test keys are derived
from fixed seeds committed in the generator.

## Style

- RFC 2119 key words in caps, and only where a requirement is meant. If a sentence would read the
  same with "should" lowercase, it is not a SHOULD.
- Prefer a table or a JSON block to a paragraph.
- Every normative statement should be testable. If you cannot describe the vector that would catch a
  violation, reconsider the statement.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licensing of contributions

By contributing you agree that your contributions are licensed under:

- [CC-BY-4.0](LICENSE-SPEC) for specification prose (`spec/`, repository documentation), and
- [Apache-2.0](LICENSE) for tooling and vectors (`tools/`, `vectors/`).
