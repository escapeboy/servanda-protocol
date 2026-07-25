---
name: Normative change
about: Propose a change to what an implementation MUST/SHOULD do, or to bytes on the wire
title: 'normative: '
labels: normative-change
assignees: ''
---

<!--
Read GOVERNANCE.md first. Normative issues stay open at least 14 days before a PR merges
(30 days if the change touches one of the 13 constitutional principles).

A normative change is anything that alters a MUST/SHOULD/MAY, a wire object, a hash
preimage, or a row of the §4.3 transition table.
-->

## Sections affected

<!-- e.g. spec/04-edge.md §4.3, spec/08-conformance.md M-14 -->

## What breaks today

<!--
REQUIRED: a concrete failing case, not a preference.

Good: "Two conforming nodes derive different edge_ids from the same edge because §4.1 does
not define the encoding of `||`. Here are the two byte strings: ..."

Not enough: "I think this would be cleaner."

If the failure can be expressed as a test vector, attach it — that is the strongest form.
-->

## Proposed text

<!-- The replacement wording, as it should read in the spec. -->

## Affected conformance requirements

<!-- List the M-numbers from spec/08-conformance.md, or "none". -->

## Which implementations does this invalidate?

<!--
Everything that must change to stay conforming, including the test vectors. A normative
change with no vector change is either not normative, or the vectors are incomplete.
-->

## Constitutional check

<!--
Does this contradict any of the 13 principles in the README? If yes, say WHICH one and why
the principle was wrong — not why the change is convenient. That is a 30-day discussion.
-->

- [ ] This change is consistent with all 13 constitutional principles
- [ ] I have described the test vector(s) that would catch a violation
