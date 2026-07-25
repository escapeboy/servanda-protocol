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
- **M-12** Clients MUST display verification level and MUST NOT render a display name above its evidence level.
- **M-13** Agents are never parties: signing keys belong to personas/groups; automation acts under, never as.
- **M-14** Assertions violating the transition table are invalid and MUST be discarded.
- **M-15** Retention decay: after retention, plaintext SHOULD be deleted, edge+assertion chains MUST be preserved. Personal-scope escrow MUST NOT exist; team-scope escrow MUST be protocol-visible.
- **M-16** A device key MUST NOT be sole custodian of vault content keys.

## Conformance levels

- **Node** (minimum): L0–L1 + §7 five tools + M-1..M-16.
- **Federating node**: + §6 (one transport, recon, recovery responder).
- **Hub**: §6.3 blind-courier requirements + M-11.
- **Client**: §7 consumer + M-12 display rules.

## Conformance suite

A public test suite defines "implements Servanda" (ADR-0001: whoever controls the definition of compatible controls the protocol). v0 suite scope: canonical-form vectors (JCS + hashing), signature vectors, transition-table property tests (invalid assertion rejection), visibility matrix tests, M-11 negative tests. Suite is the gate for use of the protocol name/mark.
