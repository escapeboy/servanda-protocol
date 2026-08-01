# Servanda Protocol — Specification v0 (draft)

**Status:** DRAFT v0.1-pre · 2026-07-27 · not frozen, pre-review
**Name:** Servanda — from *pacta sunt servanda* ("agreements must be kept"). The name is
provisional: it is descriptive Latin in the public domain, but **no trademark clearance has been
performed**, and clearance is a blocker on publishing this specification.
**Editors:** N. Katsarov
**License:** Apache-2.0, for this specification and for the reference implementation (protocol name
mark reserved, ADR-0001; see [LICENSE](../LICENSE))

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

Informative appendices (not normative, not part of the conformance suite):

- [Appendix A — Servanda edges and W3C Verifiable Credentials](../docs/appendix-a-vc-mapping.md)

## Conventions

- Key words MUST / MUST NOT / SHOULD / MAY per RFC 2119.
- All timestamps RFC 3339, UTC.
- All hashes SHA-256 unless stated; hex-encoded lowercase.
- All signatures Ed25519 over the SHA-256 of the canonical form.
- Canonical JSON per RFC 8785 (JCS). Any object with a defined schema has exactly one canonical byte representation; hashes and signatures are computed over it.
- **Signing preimage.** The preimage of every signature is `sha256(JCS(O))`, where `O` is the object with every member whose name is `sig` or begins with `sig_` removed. A single-signature object carries exactly one member, `sig`. A multi-signature object carries one `sig_<role>` member per required signer; every signer therefore signs identical bytes, and each signature MUST be verified against the key its role names. An object MUST NOT be treated as signed unless every signature its schema declares as required verifies.
- **Identifier preimages are domain-separated.** Every identifier this specification defines as a SHA-256 digest is computed over a preimage that begins with a domain tag: a fixed ASCII string followed by a single `0x00` octet. The tag contains no `0x00`, so it is self-delimiting, and the octets after it are the construction the defining section states. The three tags are:

  | Identifier | Domain tag (ASCII, then `0x00`) | Defined in |
  |---|---|---|
  | `commitment_hash` | `servanda/0.1:commitment_hash` | §3.2 |
  | `edge_id` | `servanda/0.1:edge_id` | §4.1 |
  | envelope `id` | `servanda/0.1:envelope_id` | §2 |

  Signing preimages are **not** domain-separated: a signature is bound to its object by that object's own `type` and `v` members, which are inside the canonical form. Implementations MUST NOT add a domain tag to a signing preimage.
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

## Change note — the one preimage change (v0.1-pre)

Domain separation (the Conventions bullet above) changes **every** identifier preimage in the
protocol: `commitment_hash` (§3.2), `edge_id` (§4.1, which derives from `commitment_hash`), and the
envelope `id` (§2). Every identifier computed under any earlier draft is invalid and cannot be
migrated — an identifier is what parties have already signed against, so recomputing it is not a
migration but a new identity.

This is taken deliberately, once, now:

- After freeze it is not available at all. There is no deployed data to migrate today, and there
  will be after freeze.
- Hashing a canonical JSON form with no type tag lets two object types in principle share a
  preimage. A digest alone then does not establish what was hashed.

**This is the only preimage change in this revision.** Every other resolution considered for
v0.1-pre that would have altered a hash or signing preimage was rejected specifically so that the
break happens exactly once:

- `edge_id` keeps its four-value preimage; the edge body is bound on first sight instead (§4.1).
- `conditions` is **not** added to the `commitment_hash` preimage (§3.2).
- The §4.2 assertion object gains no `supersedes_with` member (§4.5).
- `pending-acceptance` is a computed state, never an assertion's `state` value (§4.3).
- The `||` encoding of the `edge_id` preimage is ratified exactly as implemented (§4.1).

Anything that would change a preimage again is now a v0.2 matter.

## Gates on the v0.1 freeze

These are not spec edits. They were open items that had to be closed before this specification
could be frozen. **Both are now closed, and they closed in three different ways.** The distinction
is recorded rather than flattened, because "closed" on its own would let a reader infer a review
that did not happen.

- **The Ed25519 → X25519 birational map is gone rather than cleared.** §6.3 now specifies HPKE
  (RFC 9180) over a persona's own X25519 key, so no key pair is used for two algorithms and there
  is no map to review. Removing a construction is not the same as having it reviewed, and here it
  is the better outcome: standard primitives used in standard ways, with the RFC's own test
  vectors as an oracle.

- **The Argon2id parameters (§1.7, §9.3) were accepted by the editors, not reviewed by a
  cryptographer.** An earlier revision of this section said the gate could not be discharged by
  the editors. It was discharged by the editors anyway, as a deliberate decision to freeze v0.1
  rather than wait indefinitely for a reviewer who was never engaged.

  What that decision does and does not buy: the values (m = 64 MiB, t = 3, p = 1) are concrete,
  they are within the range RFC 9106 §4 describes for the memory-constrained case, and every wrap
  records the triple it used, so a future revision can raise them without stranding old vaults.
  What it does not buy is assurance. **No cryptographer has examined this parameter set**, and a
  frozen v0.1 therefore ships one cryptographic assumption that rests on the editors' judgement.
  An implementer who needs that assurance should obtain it independently; the gate is closed, not
  satisfied.

- **Trademark clearance of the name "Servanda" will not be performed.** The maintainer has decided
  against registering a mark. The name is therefore the project's name in use and nothing more: it
  is not defended, and no search was run to establish that it is free of anyone else's rights.
  ADR-0001 named the mark as one of three defences against capture of the protocol's meaning; two
  remain — the conformance suite as the definition of "implements Servanda", and the licence.
