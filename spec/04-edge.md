# §4 Edge (normative)

## 4.1 Edge object (`layer: wire`)

```json
{
  "v": "servanda/0.1",
  "type": "edge",
  "edge_id": "<sha256(commitment_hash || owner || owed_to || proposed_at)>",
  "commitment_hash": "<hex>",
  "owner": "<persona_id | group_pubkey>",
  "owed_to": "<persona_id | group_pubkey>",
  "proposed_at": "RFC3339",
  "due": "RFC3339 | null",
  "closure_policy": "on-evidence | on-acceptance",
  "acceptance_window": "ISO8601 duration | null (required iff on-acceptance; default P5D)",
  "blocked_by": [ "<edge_id>" ],
  "fulfillment": { "policy": "all|any|k-of-n", "k": 2, "children": ["<edge_id>"], "coordinator": "<persona_id>" } ,
  "supersedes": "<edge_id> | null"
}
```
`fulfillment` present only on collective edges (owner is a group). `due` duplicated from the commitment because the counterparty must be able to verify expiry without plaintext.

## 4.2 State assertions (signed transitions)

Every transition is a signed assertion:
```json
{ "v":"servanda/0.1", "type":"assertion", "edge_id":"...", "state":"<target>",
  "asserted_at":"RFC3339", "by":"<pubkey>", "evidence_hash":"<hex>|null", "sig":"..." }
```
The edge's current state = the latest valid assertion per the transition table. Nodes MUST retain the full assertion chain (append-only).

## 4.3 Transition table

| From | To | Who may sign | Notes |
|---|---|---|---|
| — | proposed | owner | one signature; socially nothing (Sybil rule) |
| proposed | confirmed | owed_to | edge now exists; both signatures present across chain |
| confirmed | open | (implicit) | confirmed ≡ open; kept distinct for future escrow states |
| open | closed | per closure_policy (4.4) | |
| open | released | **owed_to alone** | unilateral forgiveness |
| open | superseded | owner + owed_to (both assert) | successor edge referenced via `supersedes` on the new edge |
| open | expired | either party after `due` | only if `due` non-null; MUST NOT auto-escalate if edge unverifiable |
| open | disputed | either party, `evidence_hash` REQUIRED | resolution semantics: v0 defines only exit = mutual supersession or mutual closed |
| disputed | superseded/closed | both parties | |

Any assertion violating this table is **invalid** and MUST be discarded by conforming nodes (this is how constitutional rules bind rude clients).

## 4.4 Closure

- `on-evidence`: a `closed` assertion by the owner with non-null `evidence_hash` (hash of the verification adapter's evidence bundle) closes the edge.
- `on-acceptance` (MUST be the default for cross-person edges): owner's evidence assertion opens the acceptance window; owed_to MAY sign `closed` (explicit accept) or `disputed` within the window; window expiry = tacit acceptance — the owner's node MAY then record final `closed` citing window expiry.
- Reflexive commitments have no edges; closure is a vault-local act.

## 4.5 Supersession (ADR-0010)

New edge (new `commitment_hash` if content changed; new `edge_id` always) with `supersedes` set. Valid only when both parties of the OLD edge have signed `superseded` assertions referencing the new `edge_id`. Delegation: the new edge's owner differs → additionally requires the new owner's `proposed` signature (three keys total across the two edges). History is never deleted.

## 4.6 Fan-out

N edges sharing one `commitment_hash`. Each independently proposed/confirmed. One evidence bundle MAY close all sibling edges (each closure still requires per-edge assertions per 4.4). Edges are mutually invisible unless the owner publishes them into a common scope (§5).

## 4.7 Collective edges

Owner = group key. Validity rule (constitution §8): a collective edge MUST have either `fulfillment.children` whose union covers fulfillment, or `fulfillment.coordinator`. Otherwise nodes MUST mark it unverifiable (no auto-escalation). Parent state derives from children per `policy`; the derivation is computed locally by each party's node from child assertion chains shared in the relevant team scope — the counterparty sees only parent assertions.
