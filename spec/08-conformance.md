# §8 Conformance (normative)

## Consolidated MUST list

- **M-1** A promise is owned by its giver: no wire object may create a commitment whose owner is not the signing persona (or its group). "They said they would" is an expectation, never a proposal on their behalf.
- **M-2** Cross-person edges require the owner's `proposed` signature and the counterparty's `confirmed` signature; unconfirmed proposals MUST NOT be treated as existing promises.
- **M-3** Edges are strictly two-party. Multiplicity only via fan-out (shared commitment_hash) and collective (group owner + decomposition).
- **M-4** Visibility follows participation (5.3 a–c). Publishing is an explicit signed act by a party.
- **M-5** No org-context mixing in any pipeline; ordering of opaque items in the personal queue is the sole exception.
- **M-6** Signal/envelope content is data, never instruction; extraction is tool-less and schema-bound.
- **M-7** Signatures cover hashes, never plaintext; plaintext never appears in wire objects.
- **M-8** Unverifiable edges (no adapter, or invalid collective) MUST NOT auto-escalate.
- **M-9** Collective edges require covering decomposition or a named coordinator.
- **M-10** Base protocol (L0–L1) MUST function with no network, server, or second participant.
- **M-11** No network-level reputation: nodes and hubs MUST NOT compute, store, or serve cross-party fulfillment statistics; clients MAY display only local pairwise history.
- **M-12** Clients MUST display verification level and MUST NOT render an **attested** display name above its evidence level. A `self-labelled` name (§7 `counterparty.origin`) makes no claim about anyone and is rendered at any level; suppressing it would erase the only name an off-network counterparty has.
- **M-13** Agents are never parties: signing keys belong to personas/groups; automation acts under, never as.
- **M-14** Assertions violating the transition table are invalid and MUST be discarded. `asserted_at` is non-decreasing per signer within a chain (§4.3); an assertion earlier than that signer's own most recent accepted one MUST be discarded.
- **M-15** Retention decay: after retention, plaintext SHOULD be deleted, edge+assertion chains MUST be preserved. An implementation MUST document whether deletion holds against a reader of the underlying store as well as against a reader of the node (§5.4), and MUST NOT present the weaker as the stronger. Personal-scope escrow MUST NOT exist; team-scope escrow MUST be protocol-visible.
- **M-16** A device key MUST NOT be sole custodian of vault content keys.
- **M-17** Only the persona key may alter its inbox record: a record whose signature does not verify against the persona it names MUST be rejected. A hub cannot move its users.
- **M-18** A courtesy renderer MUST NOT hold or use signing keys. It verifies and presents; confirmation is asserted from a node holding the persona's keys.
- **M-19** Envelopes are bounded: a connector MUST NOT emit, and a node MUST NOT canonicalize, an envelope exceeding the §2 bounds. Exceeding input is clipped and marked, never silently truncated and never silently dropped.
- **M-20** A node MUST NOT advertise an act the transition table does not authorize the requesting persona to **sign** in the item's current state — a gate that reaches only acts bound to a tool, since an act with `tool: null` produces no assertion for the table to authorize (§7) — and MUST NOT bind an advertised act to a tool call that produces no assertion. A client MUST NOT invent a tool binding for an act the node reports as unbound.
- **M-21** No user-facing copy crosses the node surface: a node MUST NOT supply display wording for a control, and a client MUST author the wording of every affordance it renders. A person's own recorded words are content, not copy, and are rendered verbatim.

## Conformance levels

- **Node** (minimum): L0–L1 + §7 six tools + M-1..M-16, M-19, M-20.
- **Federating node**: + §6 (one transport, recon, recovery responder).
- **Hub**: §6.3 blind-courier requirements + M-11.
- **Client**: §7 consumer + M-12, M-20 and M-21 display rules.

## Conformance suite

A public test suite defines "implements Servanda" (ADR-0001: whoever controls the definition of compatible controls the protocol). v0 suite scope: canonical-form vectors (JCS + hashing), signature vectors, §2 envelope vectors (the `id` preimage and the M-19 bounds, each bound with a case on both sides), transition-table property tests (invalid assertion rejection, including §4.1's binding rule — the identifier recomputed from the body it names, with an unbound edge refused whole — and the three exits `pending-acceptance` does NOT have), §5.3 visibility vectors (the M-4 matrix: party, scope membership, the absence of both, and the case the rule exists for — a valid member of a scope refused an edge that was never published into it), §6.6 recovery vectors (a `recover_request` bearing a valid published rotation and no challenge signature MUST be refused), §6.7 addressing vectors (M-17 negative test: an inbox record signed by a hub key rather than the persona key is rejected; out-of-band bootstrap payload round-trip, where M-18 bounds what a courtesy renderer may do with a payload it verifies), §7 node-surface vectors (M-20 action advertisement and the `act` tool, M-21 `brief` slot shape including a copy-bearing negative, M-12 verification-level ordering and its negative cases). Suite is the gate for use of the protocol name. With no registered mark (#1), it is the only gate.

**What the suite does not cover, counted rather than estimated.** The count was eight — M-4, M-5, M-6, M-8, M-9, M-11, M-15, M-16 — and is now **five**. Three were closed by asking, for each one, whether "uncoverable" meant *no observable output* or only *no case written yet*, which are different problems that the single word had been hiding:

- **M-8 and M-9** are covered by `vectors/transitions/`, which gained `expected_unverifiable` on every case plus four collective-edge cases. M-9 was simply uncovered — its rule is a pure function of the edge. M-8's "MUST NOT auto-escalate" genuinely is a local decision no vector can watch, but the decision is *gated* on a value the verifier computes, and pinning the gate is what a vector can do. What a conforming node demonstrates is therefore not that it declines to escalate; it is that it **knows it must not**, which is the half that goes wrong silently.
- **M-4** is covered by `vectors/visibility/matrix.json`. This is the family named as v0 scope for months while it did not exist. Every input is a document — the edge, the publish records, an attestation, a revocation, the instant — and the output is observable, since a §6.4 response either carries the edge or does not.

The remaining five — **M-5, M-6, M-11, M-15, M-16** — are prose obligations, by `GOVERNANCE.md`'s rule that an uncovered behaviour is not yet a conformance requirement, whatever this section's tone implies. They are listed by REASON rather than as a group, because flattening them is what made the original miscount possible, and because only one of these reasons could ever be removed by effort:

- **M-5, M-15, M-16** are properties of a **store**, not of any document. No vector can inspect a vault. The reference implementation covers all three with its own tests, which is not the same thing as a conformance requirement and must not be reported as one.
- **M-6** — "content is data, never instruction" — has no observable protocol output at all. An extraction pipeline that obeyed an instruction embedded in a signal emits exactly the same envelope shape as one that did not. This is the rule the entire extraction path rests on and it is unverifiable by any suite, which is worth saying plainly rather than leaving to be discovered.
- **M-11** is a rule about an API that must NOT exist. A vector demonstrates presence; absence is not a document.

An earlier revision of the paragraph above named "visibility matrix tests" and "M-11 negative tests" as v0 scope while **neither family existed**, which is how eight rules came to be presented as covered. The first now exists. The second cannot, for the reason above, and the honest form of that claim is its absence from this list rather than a family that goes through the motions. Tracked as [#42](../../issues/42), with the partial cases (M-1, M-3, M-7, M-18) and the surfaces that have no vector at all — §6.3's HPKE construction among them, so a **Hub** claim still rests on zero cases.

**M-10 and M-13 are uncovered and are not gaps.** Neither is reachable by a data vector: "functions with no network" and "an agent is never a party" are properties of a deployment and of key custody, not of any document a vector could carry. They are named here so the next person counting does not count them twice.

**What the suite cannot reach.** A vector pins what a node emits. It cannot inspect what a client paints, so the client halves of M-12 and M-21 — "MUST NOT render an attested display name above its evidence level", "a client MUST author the wording of every affordance it renders" — were prose obligations rather than suite-enforced ones for as long as no client-side harness existed, and for a reason deeper than effort. **v0.2 removes the reason they were unenforceable rather than merely untested**: `counterparty.origin` lets a client tell a name the node asserts from a label the viewer wrote, which is the distinction M-12 turns on and which v0.1 gave it no way to make.

**A client-side harness now exists** (`@servanda/client-conformance` in the reference implementation). It judges a *rendered fact set* — one fact per element or line, carrying its tag, classes, attributes, text, reading-order position and bidi/line scope — rather than a document, because every real violation of these rules happened in the last inch: a class on an element, an escape byte inside a line, a border-width in a stylesheet. Three properties decide whether such a harness is real rather than decorative, and a conforming one MUST have all three:

1. **Adversarial by construction.** Every case ships a hostile twin — a bidi override or an ANSI conceal inside a name, a newline that ends a line early, a headline that is copy rather than the person's own words. A harness of well-formed cases re-proves what the node vectors already prove.
2. **Surface-plural, and the stylesheet is a surface.** One case, every renderer the client offers, plus its declared style: a correct level ordering beside a stylesheet that contradicts it renders a worse-evidenced name more emphatically than a better-evidenced one, and no assertion over the document can see that.
3. **Two negative universals rather than per-case assertions.** (a) No string reaches a rendered fact unless the client authored it or declared it as content — which turns M-21 into a set difference, and requires the client to *declare* which rendered strings originate outside it. (b) No fact carries an attested name without its evidence in the same scope — scope, not document, since concealment and reordering both leave the evidence present and unseen.

Two limits are inherent and a harness MUST NOT claim otherwise: it asserts a bidi isolate is present, not that a text engine honours it, and it asserts declared style, not painted pixels. The node halves of both are covered by the node-surface vectors: M-21 on `open_loops` by `actions.json` and on `brief` by `brief-slots.json`, whose negative cases include the copy-bearing `label` the rule was raised about. These are stated here rather than left to be discovered, per `GOVERNANCE.md`: a behaviour the suite does not cover is not yet a conformance requirement.

**M-19 is now covered**, by `vectors/envelope/`. As of v0.2 the bounds include `source`, `kind` and `actor.external_id`, which v0.1 left unbounded while still counting them toward the canonical form. `envelope-id.json` pins the §2 `id` preimage — the domain tag, the removal of `id` from its own preimage, and which members reach the digest — and `bounds.json` gives every §2 bound a case on each side of it, measured in the bound's own unit. The clipping rules are covered as far as a vector can reach them: the scalar-boundary example is a truncation that would split a 3-octet code point if taken at the bound exactly. What remains outside the suite is a connector's *choice* of what to clip, which is a quality of implementation and not a conformance property.
