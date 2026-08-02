# Implementer packet

*Informative. This document is a reading path; `spec/` and `vectors/` are what bind you.*

For someone about to write a second implementation. It answers four questions the specification
does not answer at its entry point: what is normative, what order to read it in, what your
conformance level actually obliges you to build, and which mistakes the spec's own text predicts
you will make.

## What is normative

- **`spec/` is normative.** Ten sections, RFC 2119 key words, and nothing in them is illustrative
  unless it says so. §9 is a normative appendix, not background.
- **`vectors/` is normative and executable.** GOVERNANCE.md: *"implements Servanda" means "passes
  the conformance suite."* Where the prose and a vector appear to disagree, you have found a defect
  in one of them — see *The rules that bite* below.
- **`docs/` is explanation.** This file, `docs/must-coverage.md`, and
  `docs/appendix-a-vc-mapping.md` bind nothing. `docs/decisions/` holds the v0.1-pre packets: the
  arguments behind decisions that are now spec text, useful when you want to know *why* and useless
  as a source of *what*. They describe a state of the spec that no longer exists.
- **README.md, GOVERNANCE.md, CONTRIBUTING.md** govern the repository and the change process, not
  the wire — with one exception that is load-bearing and is quoted in full below.

The specification is **DRAFT v0.2** on this branch (`spec/00-overview.md`). v0.1 is frozen at tag
`v0.1` with its suite pinned at `0.1.0`, and there is no compatibility path between them. Read the
branch you intend to implement, and check the status line in `spec/00-overview.md` rather than
README.md's banner.

## Reading order

Each step exists because of what the next one assumes. Read in this order and each section arrives
after the thing it depends on; read §8 first, as its name invites, and you will meet twenty-one
MUSTs written in vocabulary you have not been given yet.

**0. `GOVERNANCE.md`, the section "Conformance is the definition" — two paragraphs, before any
spec text.** It decides how you read everything after it: the suite outranks the prose, *and a
behaviour not covered by the suite is not yet a conformance requirement, however clearly the prose
states it.* That sentence is why `docs/must-coverage.md` exists and why you should read it before
you plan your work rather than after.

**1. `spec/00-overview.md`, in full, twice.** It is the only section whose rules apply inside every
other section, and no later section repeats them. Canonical JSON, the signing preimage, the three
domain tags, the `v` field, the layering. Every byte you emit is wrong if §0 is wrong, and the
failure will look like it lives in §3 or §4.

**2. `vectors/canonicalization/jcs.json`, and the "How to consume them" section of
`vectors/README.md`.** Write the canonicalizer and pass all 16 cases before reading §1. Every hash
and every signature in this protocol is computed over JCS output, so a canonicalizer that is
subtly wrong makes every later vector fail — and it fails them in the *later* family, which is
where you will look for the bug. Two cases decide it:
`key-ordering-non-bmp` (UTF-16 code-unit ordering) and `numbers-exponent-boundaries` (1e21). An
implementation that passes the other fourteen and fails these two is the common outcome.

**3. §1.1–§1.2, then `vectors/derivation/persona-keys.json`.** Seed, SLIP-0010, `m/7391'/{i}'`,
`persona_id = hex(pubkey)`. Stop at §1.2; §1.3–§1.7 are attestation, anchoring, the verification
ladder, rotation and recovery, and none of them is needed to hold an edge. Note what the vectors do
*not* pin: §1.2 also requires an X25519 key at `m/7391'/{i}'/1'`, and no vector derives it.

**4. §3, then `vectors/hashing/commitment-hash.json`.** Short, and it produces the
`commitment_hash` that §4 consumes. The fourteen cases are mostly there to prove what does *not*
reach the digest — evidence, confidence, source, conditions — which is the part an implementer
gets wrong by including too much.

**5. §4 in full, then `vectors/transitions/valid.json` and `invalid.json`.** The longest section
and the centre of the protocol. §4.1's worked byte-offset example is what you implement the
`edge_id` against; `transitions/valid.json` is declared normative for those exact bytes. Then the
25 invalid cases, which are the operative definition of M-14 — a verifier that accepts any of them
still passes every positive test, which is why the negatives are the point.

You may **defer §4.6 (fan-out) and §4.7 (collective edges)**. No vector reaches either, both are
additive to a working two-party implementation, and §4.7's derivation rule for `any` and `k-of-n`
parent state is not specified in enough detail to implement confidently.

**6. §1.6, then §7, then the four `vectors/node-surface/` families.** §1.6 comes here rather than at
step 3 because `verification-levels.json` is what checks it and §7 is where its output surfaces.
This step is where an L0–L1 vault becomes a Node: six tools, the `{act, tool, args}` shape, and the
`counterparty.origin` member that makes M-12 decidable at all. Take the families in this order:
`verification-levels` (§1.6, pure grading), `actions` (which acts you advertise), `act-tool` (the
one tool that signs), `brief-slots` (what a slot may carry).

**7. §2, then `vectors/envelope/`.** Deliberately late. An envelope is ingress, and a node that
cannot hold an edge has nothing to ingest into — §2 is also `layer: vault`, so nothing here crosses
a node boundary and no counterparty depends on it. Read it in one sitting with a calculator: it is
where octet counting, clipping and the `clipped` marker live, and its single Bounds paragraph
carries more MUSTs per line than any other paragraph in the spec.

**8. §5.** Read it and implement it, knowing that no vector will tell you whether you got it right:
there is no `publish` object anywhere in `vectors/`. §5 is short and its rules are simple; that is
not the same as their being tested.

**9. §8, last, as a checklist.** By this point the twenty-one MUSTs are a summary of things you
already know, which is what a consolidated list is for. Read it alongside `docs/must-coverage.md`.

**10. §9, before you ship keys — not before you write code.** §9.3 is the only place the Argon2id
parameters, the content-encryption suite and the salt requirement are written. §9.5's attack table
is the fastest way to check you understood why a rule exists.

**Then, only if you are federating:** §6 in order (6.1 transports → 6.2 messages → 6.3 courier →
6.4 recon → 6.5 anti-spam → 6.6 recovery → 6.7 addressing), and §1.3–§1.5 and §1.7 alongside it,
since attestation, the domain anchor and rotation all first become load-bearing here. Then
`vectors/addressing/` and `vectors/recovery/`.

`docs/appendix-a-vc-mapping.md` is optional at every step. It maps Servanda edges onto W3C
Verifiable Credentials and is informative by §0's own statement.

## By conformance level

§8 defines four levels. What follows expands each into what you build, what you may leave out, and
which vector families you must pass. Where §8's definition does not decide something, that is
recorded rather than smoothed over — see `docs/must-coverage.md`, *Levels that do not determine
their vectors*.

### Node — the minimum claim

**Build:** L0 (vault: commitments, expectations, evidence) and L1 (edges: the object, the
transition table, assertion chains), the six §7 tools, and §2 ingress if you have connectors.
M-1..M-16, M-19, M-20.

**Skip:** all of §6. No transport, no reconciliation, no hub, no inbox record, no recovery
responder. §0's base rule is that L0–L1 must be fully functional with no network, no server and no
second participant — a Node is that sentence made into a level, and the solo path is not a degraded
mode of a federated one.

**You may also defer:** §4.6, §4.7, and §1.3–§1.5 (attestation and anchoring) if you are content
to grade every counterparty at level 0, 1 or `ext`.

**Vector families (153 of the 165 cases):** `canonicalization/` (16), `hashing/` (14), `signatures/` (5),
`derivation/` (5), `envelope/envelope-id` (12), `envelope/bounds` (19), `transitions/valid` (9),
`transitions/invalid` (25), all four `node-surface/` families (11 + 17 + 7 + 13 = 48). Not
`addressing/`, not `recovery/`.

**What the suite will not catch you on:** M-4, M-5, M-6, M-8, M-9, M-11, M-15 and M-16 have no
vector. Six of the eight are Node obligations you must implement from prose alone, and two of them
— M-4's visibility matrix and M-11's negatives — are named in §8's description of the suite as
though they were tested.

### Federating node

**Build:** everything a Node builds, plus §6: at least one transport (git or hub), §6.4
reconciliation, and a §6.6 recovery responder. In practice this pulls in §1.7 (rotation), §6.7
(inbox records and out-of-band bootstrap), and — if you chose the hub transport — §1.2's X25519 key
and §6.3's HPKE sealing.

**Skip:** nothing from the Node level. Federation is additive by §0's base rule; you do not get to
drop the offline path once you have a network.

**Vector families:** all of Node's, plus `addressing/inbox-records` (4),
`addressing/oob-bootstrap` (2), `recovery/proof-of-possession` (6). That is the full 165.

**The one case to write first:** `recovery/proof-of-possession` → `bare-rotation-is-not-a-proof`.
It is a genuine, verifying, *published* rotation with no challenge signature. v0.1 answered it,
which handed the edges and assertion chains of two identities to anyone who had watched a rotation
go past. A responder that accepts it is not lenient; it is the v0.1 defect.

**Ambiguity to be aware of:** §8 defines this level as *"+ §6"* without naming M-17 or M-18, so the
six `addressing/` cases are required by inference rather than by text.

### Hub

**Build:** §6.3's blind-courier requirements — HPKE (RFC 9180) Base mode,
DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20-Poly1305, the exact `info` label, the `aad` over
`{v, type, recipient, sent_at}` — plus M-11: no cross-party fulfillment statistics, computed,
stored or served. Store-and-forward queueing with a 30-day TTL (§6.7), delivery only to the persona
under signature-challenge auth.

**Skip:** §8's definition (*"§6.3 blind-courier requirements + M-11"*) does not say whether a Hub
must also be a Node. A relay holds no vault, so reading it as standalone is defensible.

**Vector families: none.** No vector in this repository exercises §6.3 or M-11. RFC 9180 ships its
own test vectors and you should use them, but the `info` label and the `aad` construction are this
specification's own choices and nothing pins them — which is precisely where two hubs will silently
fail to open each other's payloads. Treat a Hub conformance claim as untested until that family
exists; see `docs/must-coverage.md`, *Whole surfaces with no vector*.

### Client

**Build:** a §7 consumer, plus the display halves of M-12, M-20 and M-21. Concretely: render the
verification level; never render an `attested` name above its evidence level while always rendering
a `self-labelled` one; never invent a tool binding for an act the node reports as unbound; and
author the wording of every affordance yourself, rendering `headline` and `intent_or_expect`
verbatim as the person's own words.

**Skip:** everything below §7. A client holds no keys, signs nothing, and never sees a canonical
form.

**Vector families: none apply directly.** All 165 cases pin what a node *emits*; a vector cannot
inspect what a client paints, and §8 says so. What exists instead is `@servanda/client-conformance`
in the reference implementation — a harness that judges a rendered fact set rather than a document,
and which §8 requires to be adversarial by construction, surface-plural (the stylesheet is a
surface), and expressed as two negative universals rather than per-case assertions. It is not in
this repository. Read the four `node-surface/` families anyway: they define the shapes you consume,
and `verification-levels.json` is the grading you must not contradict.

## The rules that bite

**`vectors/` is generated and read-only.** The files are a build artifact of
`tools/vectors-gen/`, and CI regenerates them and fails on a byte of drift. A hand edit fails by
design — the point is that anyone can reproduce the vectors and nobody has to trust a committed
blob. To change one, change the generator and run `npm run generate`.

**A failing vector is never fixed by editing it.** If your implementation disagrees with a case,
the presumption is that you are wrong, because the case is the executable form of a rule someone
argued for. Reproduce the case in isolation, read the `description` field — every case carries one,
and `vectors/README.md` states that no case requires reading the generator to understand — and
check the spec section named in the file's `spec_reference`.

**If you still think the vector is wrong, that is a protocol issue, not a patch.** GOVERNANCE.md
routes it: open an issue with a concrete failing case, not a preference. A normative change stays
open at least 14 days, must list its affected M-numbers, and must update `vectors/` in the same PR
— *a normative change with no vector change is either not normative, or the vectors are
incomplete*. If the spec is clear and only the vector is missing, the fix is
`editorial-with-vectors`, not normative, and it is explicitly the correct response to "the spec says
X but nothing tests X".

**The suite is the whole gate.** No trademark is registered and none will be, so "implements
Servanda" is answerable against `vectors/` and nowhere else. A claim names the suite version it
passed and the level it claims.

**Do not read `expected` and agree with it.** `vectors/README.md` says this about
`brief-slots.json` and it generalises: a harness that reads the expected verdict out of the file
and asserts it against itself proves only that JSON parses. Compute your own answer, then compare.

## The traps

Every one of these is stated in the spec. They are collected because each is a place where the
obvious implementation is wrong and the vector that catches it lives somewhere you would not look.

### Versions and tags

- **The three domain tags keep their `servanda/0.1:` spelling in v0.2, deliberately.** A domain tag
  separates one *identifier* from another, not one version from another — its job is that a
  `commitment_hash` preimage can never be read as an `edge_id` preimage. Bumping them would
  recompute every identifier in existence and invalidate every signature made against them, for no
  separation that is not already present. The version a reader needs is `v`, which is inside every
  canonical form. §0 says a tag is a constant, not a version marker.
- **Two more strings keep `0.1` for the same reason:** §6.3's HPKE `info` label
  (`"servanda/0.1 blind-courier v2"`) and §1.5's DNS TXT value (`v=servanda0.1`). The DNS one
  versions the record's own format, which has not changed, and every anchored organisation would
  have to republish.
- Meanwhile the `v` member of every object *is* `servanda/0.2`. A node MUST refuse a `v` it does not
  implement rather than interpret it.

### Preimages

- **Signing preimages are NOT domain-separated; identifier preimages are.** `sha256(JCS(O))` where
  `O` is the object with every member named `sig` or beginning with `sig_` removed — and §0 says
  implementations MUST NOT add a domain tag to it. Getting this symmetric in either direction is
  wrong in one of them.
- **Strip `sig_*`, not just `sig`.** A multi-signature object carries one `sig_<role>` per signer,
  all of whom sign identical bytes, each verified against the key its role names.
- **The `edge_id` preimage concatenates the ASCII hex *text*, not the decoded bytes.** §4.1:
  implementations MUST NOT decode the hex values to their 32-octet binary form before hashing. The
  worked byte-offset example in §4.1 is there because this is the mistake.
- **`null` is hashed as the JSON literal, never omitted.** `owed_to: null`, `due: null`,
  `actor.external_id: null` — an absent member and a null one are different documents.
- **The `edge_id` does not cover the rest of the edge**, including `closure_policy`, which decides
  who may close. A node MUST bind an `edge_id` to the *first* edge body it accepts and reject any
  later body under that id whose other members differ — discarded whole, never merged.

### Canonicalization

- **JCS sorts object members by UTF-16 code units, not code points.** `key-ordering-non-bmp` is the
  only case that catches a code-point sort.
- **JCS never sorts arrays.** Array order is data. This is why `refs` order is part of an envelope's
  identity (`envelope-id` → `differs-in-refs-order`).
- **JCS applies no Unicode normalization.** Precomposed `é` and decomposed `e` + U+0301 are two
  distinct keys.
- **Number formatting switches to exponential at 1e21, not 1e20**, and `-0` canonicalizes to `0`.
- **A canonicalizer MUST refuse a document nested more than 256 levels deep** and MUST report the
  refusal rather than dying with a platform-dependent stack error. §2 states this independently of
  the envelope bounds; `bounds.json` records it under `canonicalizer_refusal` with a note saying why
  it is not a case.

### Envelope bounds (§2 / M-19)

- **Every bound is counted in OCTETS of UTF-8, not characters.** `ref-value-multibyte-at-the-limit`
  exists to fail a character count. The bounds: canonical form 65536, payload depth 8 below
  `payload`, 32 `refs` entries, 2048 per `refs` value, 200 each for `actor.label`,
  `actor.external_id`, `source` and `kind`, 8192 per `payload` string.
- **A truncation MUST fall on a Unicode scalar boundary.** A clipped value MUST NOT contain a code
  point absent from the source. `bounds.clipping.scalar_boundary_example` is a 3-octet scalar
  straddling the cut at 8192: the correct answer is 8190, not 8192.
- **`clipped` is `true` or ABSENT — never `false`.** It is a member of the canonical form, so
  emitting `false` would change the `id` of every unclipped envelope ever produced.
- **Clip, never discard; and never emit what you could not bring inside the bounds.** The fact that
  something was observed is the part that cannot be recovered later — but a connector that cannot
  clip its way inside every bound MUST report the refusal to its caller rather than emit and leave
  the rejection to a node.
- **`payload.x_length` records the length as OBSERVED**, pre-clip. It is a SHOULD, and it is the
  number the stored envelope cannot otherwise yield.

### The transition table (§4.3)

- **`open` is never assertable.** `confirmed → open` is implicit; no row authorizes a signer to
  produce it, so an assertion whose `state` is `open` MUST be discarded under M-14. Report it as
  `implicit-transition-not-assertable`, not as a malformed object.
- **`pending-acceptance` is computed, never carried** in an assertion's `state`.
- **`asserted_at` is non-decreasing PER SIGNER, not globally.** A counterparty confirming at an
  instant earlier than the owner's proposal is honest clock skew and MUST be accepted —
  `transitions/valid` → `the-rule-is-per-signer-not-global` exists to stop you enforcing a global
  order. The rule also does not stop a party backdating its *first* assertion, and §4.3 says so: a
  window between two self-asserted instants is evidence about a cooperating counterparty and MUST
  NOT be relied on against a hostile one.
- **`release` is `owed_to` alone; `done` is the owner alone.** Getting this backwards hands the
  protocol's one unilateral act to the wrong party, and it is the negative case in three separate
  families.
- **`acceptance_window` MUST be non-null iff `closure_policy` is `on-acceptance`, with no default.**
  Both directions are malformed edges that accept no assertions at all — `transitions/invalid`
  carries a case for each.
- **`dispute_window` is a protocol constant of P30D and is not an edge member.** The party who
  benefits from a long freeze is exactly the party who disputes.
- **`window_elapsed` is an input, not a clock read.** Generation is clockless; two cases in
  `actions.json` differ only in that flag.

### The node surface (§7)

- **`commit` takes no `owner`, and a call carrying one MUST be rejected, not ignored** — citing M-1.
  Silently dropping the member leaves a client believing it recorded someone else's promise.
- **`tool: null` means `args` MUST be `{}`.** `supersede`, `delegate` and `ping` are unbound in v0,
  and routing them to `act` MUST be refused rather than served something that looks like it worked.
  `dismiss` binds to `confirm`, not `act`.
- **No user-facing copy crosses the surface.** A slot carries an `act`, never a `label`. The
  exception is `headline` and `intent_or_expect` — a person's own recorded words, which are content,
  travel verbatim, and MUST NOT be treated as instruction by any stage (M-6).
- **The ladder is `0 < 1 < ext < 2 < 3`.** `ext` sits in the middle, between continuity and
  attestation, and the numeric-looking values invite a sort that puts it last. A binding proof is
  self-assertion; an attestation is a third party staking its own key.
- **Level 3 requires level 2 first.** A domain-anchored org root with no attestation naming this
  persona grades to **0**, not 3.
- **A display name travels only at levels 2 and 3** — unless it is `self-labelled`, a name the
  viewer typed for an off-network counterparty, which carries no claim about anyone and is rendered
  at every level. Suppressing it would erase the only name that counterparty will ever have.
- **A refusal must name a reason the caller can act on.** §7 requires `terminal-state-reached`,
  `duplicate-assertion-by-same-party` and `malformed-edge-acceptance-window` under their own names.
  Note that the full vocabulary is enumerated in no section, and that
  `duplicate-assertion-by-same-party` appears in no vector — see `docs/must-coverage.md`,
  *Divergence between §7 and the vectors*.
