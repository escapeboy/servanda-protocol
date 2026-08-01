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
- **M-15** Retention decay: after retention, plaintext SHOULD be deleted, edge+assertion chains MUST be preserved. Personal-scope escrow MUST NOT exist; team-scope escrow MUST be protocol-visible.
- **M-16** A device key MUST NOT be sole custodian of vault content keys.
- **M-17** Only the persona key may alter its inbox record: a record whose signature does not verify against the persona it names MUST be rejected. A hub cannot move its users.
- **M-18** A courtesy renderer MUST NOT hold or use signing keys. It verifies and presents; confirmation is asserted from a node holding the persona's keys.
- **M-19** Envelopes are bounded: a connector MUST NOT emit, and a node MUST NOT canonicalize, an envelope exceeding the §2 bounds. Exceeding input is clipped and marked, never silently truncated and never silently dropped.
- **M-20** A node MUST NOT advertise an act the transition table does not authorize the requesting persona to sign in the item's current state, and MUST NOT bind an advertised act to a tool call that produces no assertion. A client MUST NOT invent a tool binding for an act the node reports as unbound.
- **M-21** No user-facing copy crosses the node surface: a node MUST NOT supply display wording for a control, and a client MUST author the wording of every affordance it renders. A person's own recorded words are content, not copy, and are rendered verbatim.

## Conformance levels

- **Node** (minimum): L0–L1 + §7 six tools + M-1..M-16, M-19, M-20.
- **Federating node**: + §6 (one transport, recon, recovery responder).
- **Hub**: §6.3 blind-courier requirements + M-11.
- **Client**: §7 consumer + M-12, M-20 and M-21 display rules.

## Conformance suite

A public test suite defines "implements Servanda" (ADR-0001: whoever controls the definition of compatible controls the protocol). v0 suite scope: canonical-form vectors (JCS + hashing), signature vectors, §2 envelope vectors (the `id` preimage and the M-19 bounds, each bound with a case on both sides), transition-table property tests (invalid assertion rejection), visibility matrix tests, M-11 negative tests, §6.7 addressing vectors (M-17 negative test: an inbox record signed by a hub key rather than the persona key is rejected; out-of-band bootstrap payload round-trip, where M-18 bounds what a courtesy renderer may do with a payload it verifies), §7 node-surface vectors (M-20 action advertisement and the `act` tool, M-21 `brief` slot shape including a copy-bearing negative, M-12 verification-level ordering and its negative cases). Suite is the gate for use of the protocol name. With no registered mark (#1), it is the only gate.

**What the suite cannot reach.** A vector pins what a node emits. It cannot inspect what a client paints, so the client halves of M-12 and M-21 — "MUST NOT render an attested display name above its evidence level", "a client MUST author the wording of every affordance it renders" — are prose obligations, not suite-enforced ones, until a client-side conformance harness exists. **v0.2 removes the reason they were unenforceable rather than merely untested**: `counterparty.origin` lets a client tell a name the node asserts from a label the viewer wrote, which is the distinction M-12 turns on and which v0.1 gave it no way to make. The node halves of both are covered by the node-surface vectors: M-21 on `open_loops` by `actions.json` and on `brief` by `brief-slots.json`, whose negative cases include the copy-bearing `label` the rule was raised about. These are stated here rather than left to be discovered, per `GOVERNANCE.md`: a behaviour the suite does not cover is not yet a conformance requirement.

**M-19 is now covered**, by `vectors/envelope/`. As of v0.2 the bounds include `source`, `kind` and `actor.external_id`, which v0.1 left unbounded while still counting them toward the canonical form. `envelope-id.json` pins the §2 `id` preimage — the domain tag, the removal of `id` from its own preimage, and which members reach the digest — and `bounds.json` gives every §2 bound a case on each side of it, measured in the bound's own unit. The clipping rules are covered as far as a vector can reach them: the scalar-boundary example is a truncation that would split a 3-octet code point if taken at the bound exactly. What remains outside the suite is a connector's *choice* of what to clip, which is a quality of implementation and not a conformance property.
