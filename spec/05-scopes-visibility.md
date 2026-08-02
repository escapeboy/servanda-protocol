# §5 Scopes & visibility (normative)

## 5.1 Scopes

```
personal(persona) · org(org_root) · team(group_key)
```
A scope is identified by its controlling key. No deeper nesting in v0.

## 5.2 Publish act

```json
{ "v":"servanda/0.2", "type":"publish", "edge_id":"...", "scope":"<scope key>",
  "published_at":"...", "by":"<party pubkey>", "sig":"..." }
```
- Only a **party to the edge** may publish it, and only into scopes the publisher is a member of (valid attestation).
- Publishing shares the edge object + assertion chain (hashes and states) — **never** commitment plaintext. Plaintext sharing into team scope is a separate, optional vault-level act outside this spec's wire layer.
- Unpublish: `{type:"unpublish", ...}` by the same party; nodes MUST honor it prospectively (already-synced copies are governed by scope retention policy).

## 5.3 Visibility rules (MUSTs)

- M-4a: A node MUST NOT serve an edge to any persona that is neither a party nor a member of a scope the edge is published in.
- M-4b: Scope membership grants NO visibility by itself into unpublished edges of members ("visibility follows participation, never membership").
- M-4c: No inheritance: org-scope membership does not imply team-scope visibility or vice versa.
- M-5: Processing pipelines MUST NOT combine vault objects of two different org personas (extraction, ranking payloads, executor capability sets). Cross-scope *ordering* of opaque items in a personal attention queue is permitted; content transfer is not.

## 5.4 Retention & decay

- Closed/expired/released/superseded edges: after the owner-configured retention window, nodes SHOULD delete commitment plaintext and MUST retain the edge + assertion chain (signed hashes) — "remember that, not what" (ADR-0004).
- Scope-published copies follow the scope's retention policy, which MUST be visible to scope members.
- Org escrow, if enabled for team scopes, MUST be announced in the scope descriptor (protocol-visible escrow, security §5). Personal scopes MUST NOT support escrow.

**Deletion is bounded by the store, and an implementation MUST say where the bound falls.** "SHOULD delete" is a statement about the node's own view of its records. It is not, and cannot be made into, a guarantee that the bytes are gone: a store that is append-only by construction — a git repository, an append-only log, a filesystem with snapshots, a backup that already ran — keeps the deleted record reachable, and if one key opens every record then the key that opened it before still opens it. This is a structural conflict rather than an implementation defect. Forgetting and append-only are opposite properties, and no arrangement of records inside an append-only store resolves it, because whatever key opens a record must itself live somewhere the store cannot keep.

An implementation therefore MUST document which of the two it delivers, in terms of who is doing the reading:

- **against a reader of the node** — the record is gone, and every conforming implementation delivers this;
- **against a reader of the underlying store** — the record is gone only if the implementation has arranged for its key to be destroyable, which requires key material to live outside the append-only store.

A node MUST NOT present the first as the second. The reference implementation delivers the first and says so, in `retention.ts` and at the call site; a user deciding what to write into a commitment is entitled to know which promise they are relying on before they write it, not after the window elapses.
