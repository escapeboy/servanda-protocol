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
