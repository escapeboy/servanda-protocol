# §6 Reconciliation & federation (normative)

## 6.1 Transport abstraction

Wire messages are transport-agnostic signed JSON. v0 defines two transports:
- **git**: a shared repository; messages are files under `servanda/{edge_id}/{seq}-{type}.json`; sync = fetch/push. Suits team scopes (self-hosted, offline-tolerant).
- **hub**: HTTPS relay. `POST /servanda/v0/deliver` with an encrypted envelope; `GET /servanda/v0/inbox?persona=...` (authenticated by persona signature challenge). Hubs are discovered via the domain anchor (§1.5).

## 6.2 Message types

`propose` (edge + proposed assertion) · `assert` (any subsequent assertion) · `publish`/`unpublish` · `attestation`/`revocation`/`rotation` · `recon_request`/`recon_response` (6.4) · `recover_request`/`recover_response` (6.6)

All messages: `{ v, type, payload, sender:"<persona_id>", sent_at, sig }`.

## 6.3 Blind courier requirement

Hub-bound payloads MUST be encrypted to the recipient persona key (X25519 ECDH from the Ed25519 keys, XChaCha20-Poly1305; HPKE profile candidate for v0.2). A conforming hub sees: recipient persona_id, ciphertext, timestamps — nothing else. Hubs MUST NOT be able to read or fabricate edges (fabrication is prevented by signature verification at recipients regardless of hub honesty).

## 6.4 Reconciliation

Periodic pairwise sync between nodes sharing edges:
- `recon_request`: `{ edges: [ {edge_id, latest_assertion_hash} ] }` for all shared open edges.
- `recon_response`: missing assertions for divergent chains.
- Divergence in *state* is resolved by the transition table — assertions invalid per §4.3 are discarded; the valid chain wins. Divergence in *content* cannot occur post-confirmation (content is the hash; changes require supersession).
- Escalation on drift (owner forgot) is a local decision of the owner's node upon seeing its own overdue open edge — reconciliation only guarantees both sides see the same chain.

## 6.5 Anti-spam / proposal budget

- A `proposed` edge is socially nothing (Sybil rule). Nodes SHOULD rate-limit inbound proposals per unknown sender and MUST NOT surface proposals from level-0 senders above a client-configurable cap. Expectation→proposal conversion MUST be user-initiated per counterparty (no bulk auto-invites).

## 6.6 Edge recovery (ADR-0014)

- `recover_request`: `{ persona: "<restored persona_id>", proof: "<rotation statement | fresh signature challenge>" }` sent to known counterparties/hubs.
- `recover_response`: all edges + assertion chains where the requester is a party. Responders MUST verify the persona (or its rotation successor) before answering and MUST NOT include plaintext (hashes only; plaintext recovery is a human act between counterparties).
