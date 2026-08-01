# Servanda Protocol

*Servanda — from* pacta sunt servanda *("agreements must be kept").*

> **Status: DRAFT v0.1-pre — not frozen.**
> Pre-review. No section is stable. Wire formats, hashes, and the transition table MAY change
> without a compatibility path until v0.1 is tagged. Do not ship against this yet.
> The protocol name is settled: "Servanda" is the name, and no trademark will be registered
> ([#1](../../issues/1)).

An open protocol for **commitments**: typed, evidenced, cryptographically owned records of promises
between people and organizations, with bilateral signed edges, sovereign local vaults, and optional
federation.

A commitment is what you owe. An expectation is what you await. An **edge** exists only when both
parties have signed. Nothing else counts as a promise.

The base protocol (vault + edges) is fully functional with no network, no server, and no second
participant. Federation is additive, never required.

## Specification

Normative. Key words per RFC 2119.

| § | Document | Contents |
|---|---|---|
| 0 | [spec/00-overview.md](spec/00-overview.md) | conventions, layering, versioning |
| 1 | [spec/01-identity.md](spec/01-identity.md) | seeds, derivation, personas, groups, attestation, binding proofs, rotation, recovery |
| 2 | [spec/02-signal-envelope.md](spec/02-signal-envelope.md) | normalized ingress format |
| 3 | [spec/03-commitment.md](spec/03-commitment.md) | commitment object, canonical form, hashing; expectations |
| 4 | [spec/04-edge.md](spec/04-edge.md) | edge object, state machine, signatures, closure, supersession, multiplicity |
| 5 | [spec/05-scopes-visibility.md](spec/05-scopes-visibility.md) | scopes, publish act, visibility rules |
| 6 | [spec/06-reconciliation-federation.md](spec/06-reconciliation-federation.md) | messages, transports, blind courier, edge recovery |
| 7 | [spec/07-node-surface.md](spec/07-node-surface.md) | node MCP tool contract |
| 8 | [spec/08-conformance.md](spec/08-conformance.md) | consolidated MUSTs (M-1…M-16), conformance levels |
| 9 | [spec/09-threat-model.md](spec/09-threat-model.md) | normative security appendix |

Design rationale documents (`docs/`, referenced from the spec text) and the ADR series
(ADR-0001…0014) are not published in this repository yet.

## Test vectors

[`vectors/`](vectors/) holds language-neutral JSON test vectors — the executable half of the spec:

- [`canonicalization/`](vectors/canonicalization) — RFC 8785 (JCS) cases: key ordering, unicode, number edge cases
- [`hashing/`](vectors/hashing) — `commitment_hash` cases proving only the five fields of §3.2 affect the hash
- [`signatures/`](vectors/signatures) — Ed25519 over `sha256(JCS(obj sans sig))` for attestations, assertions, rotation
- [`derivation/`](vectors/derivation) — BIP-39 → SLIP-0010 `m/7391'/{i}'` persona keys
- [`transitions/`](vectors/transitions) — valid **and invalid** assertion sequences per §4.3; the invalid ones define M-14

Vectors are generated deterministically by [`tools/vectors-gen/`](tools/vectors-gen) and are checked
in. `npm test` regenerates them and fails on any drift. See [vectors/README.md](vectors/README.md)
for the encoding decisions the generator had to make where the spec is currently under-specified.

## Constitutional principles

The spec is downstream of these. A change that violates one of them is a change to the constitution,
not to the spec (see [GOVERNANCE.md](GOVERNANCE.md)).

1. A promise is owned by the one who gives it.
2. A cross-person edge does not exist without the owner's confirmation (confirm-first).
3. The system has an opinion only where it has evidence (verification adapters).
4. Visibility follows participation, never membership.
5. Org contexts never mix in any pipeline.
6. Signal content is data forever, never instruction.
7. Autonomy is a measured quantity, not a permission.
8. Escalation always terminates at a named human; "the team" cannot be nudged.
9. Solo is not a mode — it is a network of one node. Everything must work on a laptop offline.
10. Remember *that*, not *what*: closed loops decay to signed hashes by default.
11. **No reputation.** (M-11)
12. **Agents are never parties.** (M-13)
13. A commitment is what you owe; an expectation is what you await; an edge exists only when both parties signed.

## Spec ↔ reference implementation

This repository contains **the specification and its conformance vectors only**. No implementation
lives here, and none is required to read the spec.

- The spec defines the wire: objects, canonicalization, hashes, signatures, the transition table,
  visibility rules, and the five-tool node surface (§7).
- An implementation claims conformance by passing the conformance suite (§8) — the vectors here plus
  the property tests that grow alongside them. The suite, not a blessed codebase, is the definition
  of "implements Servanda".
- The reference implementation is a separate repository (not yet published). Everything — spec text,
  tooling, vectors, and the reference implementation — is Apache-2.0.
- Reference-impl-only requirements (trust gradient, autonomy ceilings — §9.4) are explicitly **not**
  wire-protocol matters. Do not implement them to be conformant; implement them to use the brand.

## Contributing

New ideas belong in issues, not in a fork. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the change
process for normative text is in [GOVERNANCE.md](GOVERNANCE.md). Security reports go through
[SECURITY.md](SECURITY.md), not the public tracker.

The fastest useful contributions right now:

- Attack the transition table. An invalid sequence that a naive verifier accepts is a bug in §4.3.
- Add canonicalization vectors that break a plausible implementation.
- Answer an open question — issues [#1](../../issues/1)–[#8](../../issues/8) are the unresolved
  design decisions, each blocking some part of v0.1.

## License

[Apache-2.0](LICENSE) throughout: specification text (`spec/`, and the prose of this repository),
tooling and test vectors (`tools/`, `vectors/`), and the reference implementation.
[LICENSE-SPEC](LICENSE-SPEC) is retained only as a pointer — the earlier CC-BY-4.0 grant on the
prose is superseded.

**No trademark will be registered** ([#1](../../issues/1)). ADR-0001 reserved the name and mark as
one of three defences against capture of the protocol's meaning; that one is now deliberately not
taken. Two remain, and they carry the weight: passing the conformance suite is what "implements
Servanda" means (§8), and the licence governs the text. No clearance search was run, so the name
is used without any claim that it is free of anyone else's rights.
