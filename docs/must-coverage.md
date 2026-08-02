# MUST → vector coverage map

*Informative. This document describes the conformance suite; `spec/` and `vectors/` define it.*

§8 lists twenty-one MUSTs and, separately, four conformance levels. It does not say which vector
cases exercise which MUST, so a claim of "Node-conformant" names a level whose contents nobody has
written down. This document writes them down.

**Read the blank cells first.** GOVERNANCE.md is explicit that *a behaviour not covered by the suite
is not yet a conformance requirement, however clearly the prose states it* — so every MUST with no
vector behind it is a rule an implementation can violate while passing all 165 cases. §8 already
admits this for the client halves of M-12 and M-21. It admits it for fewer rules than are actually
uncovered.

A MUST is listed as covered only where a case's own `description` and inputs exercise the rule. A
family name is not evidence: `node-surface/actions.json` is named for a §7 output, and what it
actually proves spans M-3, M-20 and part of M-21.

## How to read the table

- **Levels** is taken from §8's level definitions, expanded from its ranges. `—` means no level
  names the MUST; see *Levels that do not determine their vectors* below.
- **Vector cases** names family and case. Where a whole family exercises a MUST, the family is named
  with its case count rather than listing every case.
- **Nothing** means exactly that: no case in `vectors/` exercises the rule. It is not shorthand for
  "covered indirectly".

## The table

| MUST | Rule (abridged) | Levels | Vector cases |
|---|---|---|---|
| **M-1** | A promise is owned by its giver | Node | `transitions/invalid` → `proposed-by-owed-to`. **Partial:** §7's *"a node MUST reject a `commit` call carrying an `owner` member"* and §3.4's extraction rules have **nothing** — no vector exercises the `commit` tool. |
| **M-2** | Confirm-first: proposal + confirmation, both signed | Node | `transitions/invalid` → `owner-self-confirms`, `closed-without-confirmation`, `signature-attributed-to-other-party`, `replayed-confirmation`; `transitions/valid` → `on-acceptance-explicit-accept`; `node-surface/act-tool` → `act-on-proposed-edge-rejected` |
| **M-3** | Edges are strictly two-party | Node | `transitions/invalid` → `confirmed-by-third-party`, `superseded-by-third-party`, `dispute-expiry-by-a-non-party`; `node-surface/actions` → `proposed-non-party`; `node-surface/act-tool` → `act-by-non-party-rejected`. **Partial:** the second sentence — multiplicity via fan-out (§4.6) and collective (§4.7) — has **nothing**. No vector contains a `fulfillment` member or two edges sharing a `commitment_hash`. |
| **M-4** | Visibility follows participation; publishing is a signed act | Node | **Nothing.** No vector contains a `publish` or `unpublish` object, a `scope`, or a visibility query. §8's suite-scope paragraph names *"visibility matrix tests"* as v0 scope; they do not exist. |
| **M-5** | No org-context mixing in any pipeline | Node | **Nothing.** `envelope/envelope-id` → `differs-in-persona` proves `persona` reaches the digest, which is a determinism property, not pipeline separation. |
| **M-6** | Envelope content is data, never instruction | Node | **Nothing.** |
| **M-7** | Signatures cover hashes, never plaintext | Node | `signatures/signatures` → `assertion-closed-with-evidence` (the only case that names M-7, and it is positive-only); `transitions/invalid` → `closed-without-evidence-hash`; `node-surface/act-tool` → `done-without-evidence-rejected`. **No negative:** no case presents a wire object carrying plaintext and requires its rejection. |
| **M-8** | Unverifiable edges MUST NOT auto-escalate | Node | **Nothing.** §4.1 names three ways an edge becomes unverifiable — two parties holding different bodies under one `edge_id`, a `due` that disagrees with the hashed commitment, and (M-9) an invalid collective. None has a case. `transitions/invalid` → `edge-id-mismatch` is a different rule: an assertion naming the wrong edge. |
| **M-9** | Collective edges need covering decomposition or a coordinator | Node | **Nothing.** |
| **M-10** | L0–L1 function with no network, server, or second participant | Node | **Nothing directly.** Three cases depend on it without testing it: `hashing/commitment-hash` → `reflexive-owed-to-null`, `addressing/oob-bootstrap` → `propose-roundtrip` (verification from the payload alone), `node-surface/verification-levels` → `self-labelled-name-at-level-0-is-rendered` (whose description cites *"the solo path M-10 protects"*). M-10 is a property of an implementation's architecture; no data vector can decide it. |
| **M-11** | No network-level reputation | Node, Hub | **Nothing.** §8's suite-scope paragraph names *"M-11 negative tests"* as v0 scope; they do not exist. |
| **M-12** | Display the verification level; do not render an attested name above its evidence | Node, Client | **Node half fully covered:** `node-surface/verification-levels`, all 13 cases — ladder order (`level-ext-outranks-continuity`, `level-2-outranks-ext`), name gating (`negative-name-not-shown-at-ext`, `negative-name-not-shown-at-continuity`, `negative-domain-anchor-without-attestation`), and the v0.2 `origin` distinction (`self-labelled-name-at-level-0-is-rendered`, `an-attested-name-outranks-the-viewers-own-label`, `the-viewers-label-survives-a-level-that-carries-no-name`). **Client half: nothing in `vectors/`** — §8 points at `@servanda/client-conformance`, which lives in the reference implementation and is not part of this repository. |
| **M-13** | Agents are never parties | Node | **Nothing**, and unreachable by construction: an agent signing with a persona's key is byte-identical to the persona signing. There is nothing in a wire object for a vector to look at. |
| **M-14** | Assertions violating the table are invalid; `asserted_at` non-decreasing per signer | Node | The best-covered MUST in the suite. `transitions/invalid`, all 25 cases; `transitions/valid`, all 9, of which `the-rule-is-per-signer-not-global` is the positive half of the monotonic rule and `owner-backdates-to-manufacture-an-elapsed-acceptance-window` / `counterparty-backdates-a-dispute` are its negatives; `node-surface/act-tool`, the 11 refusals, which re-prove the table through the tool that signs. |
| **M-15** | Retention decay; no personal-scope escrow; team escrow protocol-visible | Node | **Nothing.** No vector contains an escrow member or a scope descriptor. The retention half is time-based and generation is clockless by rule; the escrow half is not, and is uncovered for no stated reason. |
| **M-16** | A device key MUST NOT be sole custodian of vault content keys | Node | **Nothing.** There is no vault-key family: no Argon2id wrap, no content-key wrapping, no salt. `derivation/persona-keys` covers signing-key derivation only. |
| **M-17** | Only the persona key may alter its inbox record | — (see below) | `addressing/inbox-records`, all 4 cases: `invalid-signed-by-hub` is the operative negative, `invalid-corrupted-signature` the control that distinguishes the two failure reasons, `valid-self-signed` and `valid-self-signed-multi-hub` the positives (the second also pins §6.7's declared-order rule). |
| **M-18** | A courtesy renderer MUST NOT hold or use signing keys | — (see below) | **Verification half:** `addressing/oob-bootstrap` → `tampered-payload-does-not-verify`, `propose-roundtrip`. **Custody, retention and origin halves: nothing.** §6.7's *MUST NOT cache*, *MUST NOT log*, *MUST NOT persist beyond the request*, and *MUST NOT present its own branding as bearing on authenticity* are rules about a renderer's behaviour over time and about pixels; neither is in a payload. |
| **M-19** | Envelopes are bounded; clipped and marked, never silently truncated or dropped | Node | `envelope/bounds`, all 19 cases — every §2 bound with a case on each side, measured in octets; `envelope/envelope-id` → `clipped-true-changes-the-id`, which proves the marker reaches the digest. **Not cases, but checkable fixtures:** `bounds.clipping.scalar_boundary_example` (the Unicode-scalar rule), `bounds.clipping.length_member` (the `x_length` SHOULD), `bounds.canonicalizer_refusal` (the 256-level rule, stated with a `note` explaining why it gets no case). **Nothing:** the *`clipped` is absent, not `false`* rule has no case; the connector's *MUST NOT emit an envelope it could not bring inside every bound, and MUST report that refusal to its caller* has no case. |
| **M-20** | Advertise only authorized acts; never bind an act to a tool that produces no assertion | Node, Client | **Node half fully covered.** `node-surface/actions`, all 11 cases, with `must_not_advertise` as the operative half (`open-owner` for `release`, `pending-acceptance-owner-window-not-elapsed` for `done`, `proposed-non-party` and `terminal-released` for the empty array); `node-surface/act-tool` → `supersede-is-not-an-act-tool-call`, `ping-is-not-an-act-tool-call`, `dismiss-is-not-an-act-tool-call`; `node-surface/brief-slots` → `invalid-unbound-act-named-a-tool`, `invalid-args-on-an-unbound-act`. **Client half — *"a client MUST NOT invent a tool binding for an act the node reports as unbound"* — nothing.** |
| **M-21** | No user-facing copy crosses the node surface | Client | `node-surface/brief-slots` → `invalid-label-on-the-primary-action` (the case the family exists for), `invalid-copy-on-the-slot`, `invalid-act-outside-the-vocabulary`, and the positives `valid-owner-open-edge` and `valid-no-action-is-null-not-absent`. **On `open_loops`, coverage is structural rather than adversarial:** §8 credits `actions.json`, and what that file actually does is require `expected_actions` to match exactly, where every entry carries only `act`, `tool` and `args`. A node emitting a label fails on array inequality. There is no copy-bearing negative on that surface, unlike `brief`. **Client half: nothing in `vectors/`** — same boundary as M-12. |

## Every MUST with no vector behind it

Eight MUSTs have no case in `vectors/` at all:

**M-4, M-5, M-6, M-8, M-9, M-11, M-15, M-16.**

Three more are covered on one side only and uncovered on the other in a way the table above states
per-row: **M-1** (the `commit` tool), **M-3** (fan-out and collective multiplicity), **M-7** (no
plaintext negative). **M-10** and **M-13** are uncovered and, for different reasons, not reachable
by a data vector — M-10 because it is an architectural property and M-13 because the violation is
invisible on the wire.

Four of the eight are worth separating out, because their absence is not an oversight of the same
kind:

- **M-4 and M-11 are named in §8's own description of the suite.** The suite-scope paragraph lists
  *"visibility matrix tests"* and *"M-11 negative tests"* among v0 scope. Neither family exists.
  This is the one place in the specification where §8 describes the suite as containing something it
  does not contain, and it matters more than an ordinary gap: an implementer reading §8 has been
  told these are tested.

- **M-16 is the only cryptographic MUST with no vector**, and the parameters it depends on (§9.3:
  Argon2id m = 64 MiB / t = 3 / p = 1, XChaCha20-Poly1305, per-wrap salt ≥ 128 bits) are the
  parameter set §0 records as *accepted by the editors, not reviewed by a cryptographer*. An
  unreviewed parameter set with no vector is two independent absences of assurance on one
  construction.

- **M-6 is uncovered because of what it is.** "Content is data, never instruction" is a statement
  about what a pipeline does with a value, and every envelope in `vectors/envelope/` is inert JSON
  either way. Catching a violation needs an adversarial payload plus an oracle for whether a stage
  obeyed it — closer to the client-side harness §8 describes than to a data vector.

## Whole surfaces with no vector

Distinct from the MUST list, because they are named in the level definitions and therefore reached
by a conformance claim:

| Surface | Level that requires it | Coverage |
|---|---|---|
| §6.3 blind courier — HPKE Base mode, DHKEM(X25519)/HKDF-SHA256/ChaCha20-Poly1305, the `info` label, the `aad` construction | **Hub** (and any node sending over the hub transport) | **Nothing.** No sealed payload, no `info` octets, no `aad` canonical form. RFC 9180 ships its own vectors, but nothing pins Servanda's use of it — the `info` label and the `aad` members are this specification's choices and are exactly where two implementations would silently diverge. |
| §1.2 X25519 key agreement key at `m/7391'/{i}'/1'` | Federating node, Hub | **Nothing.** `derivation/persona-keys.json` derives the Ed25519 key at `m/7391'/{i}'` and stops. The `dh_key` in `addressing/inbox-records.json` is a fixture, not a derivation anyone can check — so two implementations can publish different `dh_key`s for the same seed and both pass. |
| §6.4 reconciliation — `recon_request` / `recon_response` | Federating node | **Nothing.** No vector contains a `recon_` message. §4.3 states that the monotonic-`asserted_at` rule *"does not survive §6.4 reconciliation"* because a batch is normalised by `asserted_at`; that normalisation has no vector either. |
| §5.2 `publish` / `unpublish` | Node (M-4) | **Nothing.** |
| §1.3 attestation and revocation objects, §1.6 `binding_proof`, §1.6 persona `link` | Node (M-12 inputs) | **Partial.** `signatures/signatures` → `attestation-by-org-root` pins one attestation's signature. There is no `revocation` object, no `binding_proof` object, and no `link` object anywhere in `vectors/` — including §1.6's rule that *"a link whose two signature members are byte-identical MUST be rejected"*, which is a MUST with an obvious negative case and no vector. `node-surface/verification-levels.json` grades an `evidence` fixture (`{priorConfirmedEdge, bindingProof, attestation, domainAnchored, …}`) rather than real objects, so the ladder is pinned but the evidence that feeds it is not. |
| §7 `commit`, `expect`, `confirm`, `open_loops` | Node ("six tools") | **Nothing for four of the six.** `act` is covered by `act-tool.json`; `brief`'s slot shape by `brief-slots.json`; `open_loops`' `actions` array by `actions.json` — but no vector exercises `commit`, `expect`, `confirm`, or `open_loops`' `view` semantics. §8 requires "§7 six tools" for the Node level. |

## Levels that do not determine their vectors

§8's four level definitions do not always decide which of the 165 cases a claimant must pass.

1. **M-17 and M-18 belong to no level.** Node is `M-1..M-16, M-19, M-20`; Federating node adds
   *"§6 (one transport, recon, recovery responder)"*; Hub is *"§6.3 + M-11"*; Client is
   *"§7 consumer + M-12, M-20 and M-21"*. M-17 and M-18 appear in no list. They are §6.7 rules, so
   *"+ §6"* presumably carries them — but "presumably" is what a conformance claim cannot rest on,
   and the six `addressing/` cases are therefore required by no level in writing.

2. **The Client level has no vectors.** All 165 cases pin what a node emits. §8 says so itself, and
   points at a client-side harness in a different repository. So *"which vectors apply to a Client"*
   answers either "none of them" or "all the node-surface ones, as the inputs it must consume
   correctly" — and §8 does not say which. This is the sharpest of the four ambiguities, because
   Client is a level someone can claim today.

3. **Hub does not say whether it inherits Node.** Federating node is written with a leading `+`,
   which reads as additive over Node. Hub's line has no `+`. A hub that relays ciphertext and serves
   inbox records is not obviously a Node — it holds no vault — yet reading Hub as standalone leaves
   it with M-11 and §6.3, for which no vector exists at all. Either reading makes "Hub-conformant"
   a claim backed by zero cases.

4. **M-11 is required twice.** Node's `M-1..M-16` range already contains it, and Hub names it again.
   Either the Hub level restates it for emphasis, or Node's obligation is meant to be weaker than
   Hub's — §8 does not say, and the two readings differ for a node that also relays.

5. **M-12 is a client rule inside the Node range.** M-12's text begins *"Clients MUST display…"*,
   and §8 assigns it to Node by range and to Client by name. A node cannot display anything. What a
   node owes is the grading in `verification-levels.json` and the `origin` member of §7 — but §8
   never says that, so an implementer must infer that "Node requires M-12" means "Node requires the
   half of M-12 a node can perform".

6. **M-19 binds a connector, and a connector is not a level.** §2 splits M-19: a *connector* MUST NOT
   emit an out-of-bounds envelope and MUST clip rather than discard; a *node* MUST reject one rather
   than canonicalize it. Node is the only level that names M-19, so the clipping obligations — which
   are most of `bounds.json`'s subject matter — are required of nobody by name.

## Divergence between §7 and the vectors

§7 requires: *"A node MUST report `terminal-state-reached`, `duplicate-assertion-by-same-party` and
`malformed-edge-acceptance-window` under their own names."*

The string `duplicate-assertion-by-same-party` appears in no vector. The case aimed at that rule,
`node-surface/act-tool` → `a-second-release-is-named-a-duplicate` — whose description is *"'you
already signed this one' is not 'the transition is illegal'"* — expects `terminal-state-reached`.
That is defensible for a second `release` (the edge really is terminal), but it means the reason
§7 names is exercised by nothing, and an implementation that never emits it passes.

The nine reason strings the suite does use (`illegal-source-state`, `wrong-role-for-act`,
`not-a-party`, `evidence-hash-required`, `evidence-hash-must-be-null`,
`acceptance-window-not-elapsed`, `terminal-state-reached`, `malformed-edge-acceptance-window`,
`act-not-bound-to-a-tool`) are enumerated in no section. §7 says a refusal *"MUST name its reason
from the §4.3 vocabulary"*; §4.3 contains no vocabulary of reason strings.
`vectors/README.md` records this as open interpretation #12.
