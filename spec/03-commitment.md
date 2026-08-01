# §3 Commitment & expectation (normative)

## 3.1 Commitment object (`layer: vault`)

```json
{
  "v": "servanda/0.2",
  "type": "commitment",
  "intent": "string, human-readable, ≤ 500 chars",
  "owner": "<persona_id | group_pubkey>",
  "owed_to": "<persona_id | group_pubkey | external_label> | null",
  "due": "RFC3339 | null",
  "conditions": [ "<edge_id this is blocked_by>" ],
  "evidence_refs": [ { "kind": "envelope|url|commit|file", "value": "string" } ],
  "created_at": "RFC3339",
  "source": "extracted | explicit | archaeology | converted_expectation",
  "confidence": 0.0
}
```

- `owed_to: null` → reflexive commitment. Never leaves the vault.
- `owed_to` as `external_label` (string, not a key) → counterparty off-network; record stays vault-local (half-network case).
- `due: null` is valid and expected to be the majority. Undated commitments MUST NOT time-escalate; they rank by age × blocking (informative: docs/execution).
- `created_at` is set by the owner's node and is part of the `commitment_hash` preimage (§3.2). It is the owner's value, not a negotiated one: a counterparty MUST take `created_at` from the commitment it was given and MUST NOT substitute its own observation of when the commitment arrived. A counterparty that never receives the plaintext (M-7) never learns `created_at` at all and verifies only the digest it was sent.

## 3.2 Commitment hash (the wire identity of the promise)

```
commitment_hash = sha256( "servanda/0.1:commitment_hash" || 0x00
                          || JCS({ intent, owner, owed_to, due, created_at }) )
```

- **Only these five fields.** Evidence, confidence, source are vault-local and excluded — two parties agreeing on a promise need not share evidence sets. `conditions` is excluded too: it holds `edge_id` values (§3.1), which are references to other edges rather than content of this promise, and the dependency a counterparty needs to see is carried on the edge as `blocked_by` (§4.1). The consequence is real and intended: "I'll do X" and "I'll do X once you deliver Y" hash identically.
- **Domain separation.** The preimage is the octets `servanda/0.1:commitment_hash`, then a single `0x00`, then the JCS form of exactly the five members above (§0). The tag is what makes a `commitment_hash` a statement about a commitment: without it, the same five values hashed for any other purpose would yield the same digest, and a digest alone would not establish what was hashed. Implementations MUST NOT compute this digest over the untagged canonical form.
- The hash, not the object, appears in edges (ADR-0004). Plaintext lives only in party vaults.
- Fan-out: one hash, many edges (§4.6).

## 3.3 Expectation object (`layer: vault`, informative but recommended)

```json
{
  "v": "servanda/0.2",
  "type": "expectation",
  "expect": "string",
  "from": "<external_label | persona_id>",
  "since": "RFC3339",
  "context_refs": [ ],
  "state": "open | closed"
}
```

- MUST NOT appear in any wire message (ADR-0013). Escalates only to its holder.
- Conversion: when `from` becomes a reachable persona, the node MAY construct a commitment (owner = counterparty) and send a `propose` (§6.2) — subject to the anti-spam rule §6.5.

## 3.4 Extraction requirements

- Extraction MUST run with no tool access and MUST emit only objects valid against §3.1 or nothing (§9.2).
- Cross-person results (owner ≠ the node's persona, or owed_to is another persona) MUST be created with `source:"extracted"` and MUST NOT produce a wire `propose` without an explicit confirmation act by the local user when the local user is the owner, or at all when the owner is a different person (you cannot propose someone else's promise — constitution §1; the correct object for "they said they would" is an expectation).
