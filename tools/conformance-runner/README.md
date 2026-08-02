# Conformance runner

Runs `vectors/` against an implementation under test and reports a verdict per §8
conformance level.

`GOVERNANCE.md` says "implements Servanda" means "passes the conformance suite", and §8
adds that with no registered mark the suite is the *only* thing that answers a conformance
claim. Until this tool existed the suite could only be run from inside the reference
implementation's own tests, which meant the one governance claim the project rests on was
unexercisable by anyone except its author. This runner exists so that an outsider, in
another language, can say "I passed" and hand someone the transcript.

```bash
node run.mjs -- <command to start your implementation>
```

## Usage

```
node run.mjs [options] -- <command> [args...]

  --vectors <dir>    vectors/ directory            (default ../../vectors)
  --levels <file>    level scope map               (default ./levels.json)
  --claim a,b        levels claimed; exit 2 if any is not granted
  --only fam,fam     run only these families (diagnostic; NO level is graded)
  --timeout <ms>     per-request timeout           (default 10000)
  --json <file>      write the full report as JSON
  --verbose          show unverified pins even on a clean run

exit: 0 all good   1 a case failed or the pipe broke   2 a claimed level was not granted
```

In CI, state the claim and let the exit code answer it:

```bash
node tools/conformance-runner/run.mjs --claim node,federating-node -- ./my-node --conformance
```

`--only` is for debugging one family. It deliberately turns every level verdict into
`not-assessable`: grading a level from the subset of families you chose to run would let
anyone mint a green Node verdict by naming the families they pass.

Node 22+, no dependencies, nothing to install.

**Why Node.** `tools/vectors-gen` is TypeScript on Node 22+ and `tools/linkcheck.mjs` is
plain Node, so the repo already assumes a Node toolchain and this adds no new one. The
usual argument for Python — better crypto libraries — does not apply, because the runner
performs no cryptography at all. It never recomputes a hash, a signature or a derivation;
it reads pinned values out of the vectors and compares strings. That is a deliberate
property, not a shortcut: see below.

## The protocol

[`PROTOCOL.md`](./PROTOCOL.md) — line-delimited JSON over the implementation's stdin and
stdout. The implementation runs as a subprocess and is never imported, because a runner
that imports the thing it judges can only judge implementations in its own language, and
the entire point of a conformance suite is that the second implementation is in a
different one.

## What the runner does not contain

**No expected value from any case appears in this runner's source.** Every comparison is
`result[field]` against a value read out of a vector file at run time. Where a family
states an expectation as a whole `expected` object, the pins are derived from that
object's own members — which is why `recovery`'s `reason` and `addressing`'s
`rejection_reason` both work without the runner knowing that they differ.

A runner that restated the oracle would be a second place for the oracle to be wrong, and
the second place is the one nobody regenerates. `selftest.mjs` checks this the only way it
can be checked: it points the runner at an empty vectors directory and asserts that it
cannot run.

What the runner *does* carry is scope — which families each level requires — in
[`levels.json`](./levels.json), with the §8 sentence that puts each family where it is.
That is a reading of §8 rather than a fact about the vectors, so it lives in a data file
you can argue with rather than inside a `.mjs`.

## The report

Per **level**, not per file, because §8 defines conformance in levels. A claim of
"Node-conformant" has to mean the Node cases passed and has to name them, so a failing
level prints every case id that failed.

| verdict | meaning |
|---|---|
| `pass` | every case in every family the level requires passed |
| `fail` | at least one did not |
| `partial` | the ceiling for **Client** — see below |
| `not-assessable` | the level has no vectors behind it, or the run was filtered |

**A skipped case is a failure.** An op the implementation left out of its handshake fails
as `declined`. A crash fails every remaining case as `process-exited`. A timeout, a
desynchronized `id`, an unparsable line and a stray debug print on stdout are all
failures with names. There is no path through this runner on which a case produces no
verdict — a suite in which "no answer" reads as "no problem" cannot support a conformance
claim.

**Hub is always `not-assessable`.** §8 defines it as "§6.3 blind-courier requirements +
M-11", and no vector family covers either. The runner will not print `pass` for a level it
has nothing to test, however tempting the empty set is.

**Client tops out at `partial`.** §8 is explicit that "a vector pins what a node emits. It
cannot inspect what a client paints." The four node-surface families pin the node halves
of M-12, M-20 and M-21; the client halves are judged by the rendered-fact-set harness
(`@servanda/client-conformance`), not here. A `partial` from this runner is not a Client
conformance claim and the report says so in those words.

Every run prints **WHAT THIS RUN DOES NOT CLAIM** — the MUSTs at each level that no vector
reaches. Ten of the sixteen MUSTs the Node level requires have no vector family at all.
That is not a defect in the runner; it is the shape of the suite, and printing it on every
run is the difference between a green tick and an honest one.

## Demonstration

```bash
npm run demo:correct    # a correct implementation: 170/170, node + federating-node pass
npm run demo:faults     # eight injected bugs: exactly eight failures
npm run demo:jcs-only   # a real but partial implementation: 16 pass, 154 declined
npm run selftest        # asserts all of the above, exactly
```

Two fixtures, because a runner demonstrated only against a correct implementation has not
been demonstrated to be able to fail, and one demonstrated only against a broken one has
not been demonstrated to be able to pass.

**`fixtures/jcs-node-stub.mjs`** is a real implementation of one family. It canonicalizes
for actual — RFC 8785 in about ten lines, reading no vectors — and declines everything
else. Canonicalization passes on merit; all 154 other cases fail as `declined`, naming the
op each one needed.

**`fixtures/replay-stub.mjs`** answers from the vectors and then corrupts named answers.
It is a harness fixture and not an example implementation: it knows nothing about
Servanda, only how to look one up. Its value is that the expected failure set is exactly
known. The eight defaults, each a bug a real implementation could plausibly have:

| fault | breaks |
|---|---|
| `canonicalization#string-escapes-solidus` | escapes `/` — changes the canonical form and every hash over it |
| `transitions-invalid#owner-self-confirms` | M-14 — the owner confirms their own proposal and the verifier allows it |
| `node-surface-actions#open-owner` | M-20 — offers `release` to the owner; §4.3 gives it to `owed_to` alone |
| `node-surface-brief-slots#invalid-label-on-the-primary-action` | M-21 — accepts a node-supplied `label` |
| `recovery#bare-rotation-is-not-a-proof` | §6.6 — accepts a bare published rotation as proof of possession (the v0.1 defect) |
| `addressing-inbox#invalid-signed-by-hub` | M-17 — accepts an inbox record signed by a hub |
| `envelope-bounds#payload-string-over-the-limit` | M-19 — measures correctly, judges in-bounds anyway |
| `node-surface-verification-levels#negative-name-not-shown-at-ext` | M-12 — emits a display name at a level that carries none |

The runner catches those eight and nothing else. They land where §8 puts them: five at
Node, seven at Federating node (the same five plus the two §6 families), three at Client,
and the brief-slots one shows as *advisory* at Node — reported, not counted — for the
reason in findings/1. Hub stays `not-assessable` throughout, because a level with no
vectors cannot be failed any more than it can be passed.

`selftest.mjs` asserts the failure set as an exact set rather than a count, so a fault that
stops firing is caught instead of hidden behind the other seven still failing.

## Findings — where §8 is ambiguous about which vectors apply

These are spec observations, not runner bugs. Nothing under `spec/` or `vectors/` was
modified.

**1. `brief-slots.json` judges a node, but M-21 is only listed at the Client level.**
§8's levels give Node "M-1..M-16, M-19, M-20" — M-21 is absent — and name M-21 only under
Client. Yet the same section says "the node halves of both are covered by the node-surface
vectors: M-21 on `open_loops` by `actions.json` and on `brief` by `brief-slots.json`", and
every case in that file judges what a **node** may emit. So the file tests a node
obligation that the Node level does not require. Read literally, an implementation can be
Node-conformant while emitting `{"label": "Mark done"}` on every brief slot — which is the
exact shape `vectors/README.md` says the rule was raised about. The runner requires it for
Client and reports it as advisory for Node; the fix is a decision, not a default.

**2. The range `M-1..M-16` sweeps in two MUSTs that are then named again elsewhere.**
M-11 is inside the Node range and is also the Hub level's own requirement. M-12 is inside
it and is also the Client level's. Either the range is shorthand that was not meant to be
read member by member, or the later mentions are redundant. It decides a real question:
whether `verification-levels.json` (M-12) is a Node requirement or Client-only. The runner
takes the range literally and requires it at both, which is the stricter reading — but if
the range is shorthand, M-11 has no home at Node either and the Node level's MUST list is
two entries shorter than it appears.

**3. `signatures.json` pins no verdict and has no negative case.** It is the only
verification family without an `expected` member. All five cases are positive, so an
implementation whose signature check returns `true` unconditionally passes the family.
The runner therefore asks only for the preimage (`canonical`, `sha256_preimage`), which is
what the file actually pins, and checks no verdict — it will not invent an expectation the
vector does not state. Signature verification with both polarities does exist in the suite,
in `addressing/inbox-records.json` and `addressing/oob-bootstrap.json`, so this is a gap in
one family rather than in the suite; but the asymmetry is worth closing.

**4. `bounds.json`'s `clipping.scalar_boundary_example` names no bound.** It gives
`source_octets: 8196` and `clipped_to_octets: 8190` and says "the cut at 8192 octets",
which matches `bounds.payload_string_octets` — but the example carries no `bound` member,
unlike every case in the same file. A consumer has to infer which limit produced 8192. The
runner reads `bounds.payload_string_octets` and says so at the call site.

**5. `oob-bootstrap.json`'s round-trip flags are not round-trip flags on the tampered
case.** `vectors/README.md` says "`decoded_equals_original` and `edge_equals_original` are
the round-trip assertions", and on `tampered-payload-does-not-verify` both are `false` —
while `decode(encode(m)) == m` is plainly **true** for that message, as the case's own
description ("It decodes cleanly") confirms. "Original" there means the *other* case's
message, and nothing in the file names that reference. A consumer following the README
computes `true` and fails a vector for being right. The runner leaves both fields
unchecked and lists them under UNVERIFIED PINS rather than guess; `signature_verifies`,
which is unambiguous and is what the case is actually about, is checked on both cases.

**6. `vectors/README.md`'s inventory table is stale and incomplete.** It lists
`transitions/valid.json` at 7 cases (actual 9), `transitions/invalid.json` at 19 (25),
`node-surface/act-tool.json` at 14 (17) and `node-surface/verification-levels.json` at 10
(13), and omits `envelope/envelope-id.json`, `envelope/bounds.json` and
`recovery/proof-of-possession.json` entirely — three families and 37 cases. The prose
below the table describes all three, so only the table drifted. The actual total is 165,
which the runner reaches by loading the files.

**7. Ten of the Node level's own MUSTs have no vector.** M-1, M-3, M-5, M-6, M-7, M-9,
M-10, M-13, M-15 and M-16 are required by the Node level and exercised by nothing. So is
M-4, whose "visibility matrix tests" §8 lists as v0 suite scope and which does not exist.
The runner prints this on every run rather than letting a green Node verdict imply more
than it covers. Per `GOVERNANCE.md` — "a behaviour the suite does not cover is not yet a
conformance requirement" — these are, today, prose.

## Layout

```
run.mjs              CLI: load, drive, compare, report, exit
selftest.mjs         asserts the demonstrations above, exactly
levels.json          which families each §8 level requires, with citations (scope, never oracle)
PROTOCOL.md          the subprocess protocol — the part an implementer writes against
lib/vectors.mjs      vector files → cases (request shape + pins read from the vector)
lib/driver.mjs       the NDJSON pipe; every failure mode becomes a failed case
lib/report.mjs       level verdicts and rendering
fixtures/            the two demonstration implementations
```
