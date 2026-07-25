# Servanda Protocol — Specification v0 (draft)

**Status:** DRAFT v0.1-pre · 2026-07-25 · not frozen, pre-review
**Name:** Servanda — from *pacta sunt servanda* ("agreements must be kept").
**Editors:** N. Katsarov
**License:** spec text CC-BY-4.0 (protocol name trademark reserved, ADR-0001)

## Abstract

An open protocol for commitments: typed, evidenced, cryptographically owned records of promises between people and organizations, with bilateral signed edges, sovereign local vaults, and optional federation. Design rationale lives in `../docs/`; this spec is normative.

## Sections

1. [01-identity.md](01-identity.md) — seeds, derivation, personas, groups, attestation, binding proofs, rotation, recovery
2. [02-signal-envelope.md](02-signal-envelope.md) — normalized ingress format
3. [03-commitment.md](03-commitment.md) — commitment object, canonical form, hashing; expectations (informative)
4. [04-edge.md](04-edge.md) — edge object, state machine, signatures, closure, supersession, multiplicity
5. [05-scopes-visibility.md](05-scopes-visibility.md) — scopes, publish act, visibility rules
6. [06-reconciliation-federation.md](06-reconciliation-federation.md) — messages, transports, blind courier, edge recovery
7. [07-node-surface.md](07-node-surface.md) — node MCP tool contract
8. [08-conformance.md](08-conformance.md) — consolidated MUSTs, conformance levels
9. [09-threat-model.md](09-threat-model.md) — normative security appendix

## Conventions

- Key words MUST / MUST NOT / SHOULD / MAY per RFC 2119.
- All timestamps RFC 3339, UTC.
- All hashes SHA-256 unless stated; hex-encoded lowercase.
- All signatures Ed25519 over the SHA-256 of the canonical form.
- Canonical JSON per RFC 8785 (JCS). Any object with a defined schema has exactly one canonical byte representation; hashes and signatures are computed over it.
- `layer: vault` objects never leave the owner's vault. `layer: wire` objects may cross node boundaries.
- Protocol version string: `servanda/0.1`. Every wire message carries `v`.

## Layering

```
L3  Clients (chat assistants, web UI, CLI) — via node surface (§7)
L2  Federation (reconciliation, hubs, transports) (§6)
L1  Edges (bilateral signed promises) (§4)
L0  Vault (sovereign local store: commitments, expectations, evidence) (§3)
```

Base rule (constitution §9): L0–L1 MUST be fully functional with no network, no server, no second participant. L2 is additive.
