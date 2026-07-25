# §3 Commitment & expectation (normative)

## 3.1 Commitment object (`layer: vault`)

```json
{
  "v": "servanda/0.1",
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

## 3.2 Commitment hash (the wire identity of the promise)

```
commitment_hash = sha256( JCS({ intent, owner, owed_to, due, created_at }) )
```

- **Only these five fields.** Evidence, confidence, source are vault-local and excluded — two parties agreeing on a promise need not share evidence sets.
- The hash, not the object, appears in edges (ADR-0004). Plaintext lives only in party vaults.
- Fan-out: one hash, many edges (§4.6).

## 3.3 Expectation object (`layer: vault`, informative but recommended)

```json
{
  "v": "servanda/0.1",
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
