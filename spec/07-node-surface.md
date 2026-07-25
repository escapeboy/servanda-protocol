# §7 Node surface (normative MCP contract)

A conforming node exposes these five tools over MCP. Clients (assistants, UIs, CLIs) are interchangeable above this contract.

## commit
```json
{ "name": "commit",
  "input": { "intent":"string", "owed_to":"string|null", "due":"RFC3339|null",
             "persona":"string|null (default active)", "propose":"bool (default false)" },
  "output": { "commitment_hash":"hex", "edge_id":"hex|null", "state":"vault-local|proposed" } }
```
`propose:true` requires `owed_to` resolvable to a persona; otherwise the record stays vault-local.

## expect
```json
{ "name": "expect",
  "input": { "expect":"string", "from":"string", "context":"string|null" },
  "output": { "expectation_id":"string" } }
```

## confirm
```json
{ "name": "confirm",
  "input": { "id":"edge_id | pending_extraction_id", "decision":"confirm|dismiss|edit",
             "edit":{ "intent":"string?", "due":"RFC3339?" } },
  "output": { "state":"confirmed|dismissed|revised" } }
```
Serves both inbound proposals and the local extraction-confirmation queue. Every decision is a flywheel label (ADR-0012); telemetry of the decision (never content) is emitted only if opt-in.

## open_loops
```json
{ "name": "open_loops",
  "input": { "view":"owe|waiting|closed|all", "persona":"string|null", "limit":"int" },
  "output": { "items":[ { "kind":"commitment|expectation|edge", "id":"...", "intent_or_expect":"...",
               "counterparty":"...", "verification_level":"0|1|2|3|ext", "age_days":0,
               "due":"...", "state":"...", "actions":["done","release","supersede","delegate","ping"] } ] } }
```

## brief
```json
{ "name": "brief",
  "input": { "persona":"string|null (null = all, personal attention market)" },
  "output": { "generated_at":"...", "slots":[ { "headline":"string", "item_id":"...",
               "primary_action":{ "label":"string", "tool":"string", "args":{} } } ],
             "below_the_line_count": 0 } }
```
`persona:null` is the only place cross-org *ordering* occurs (§5.3 M-5: ordering yes, content mixing no — each slot's content originates from exactly one persona's pipeline).

## Conformance notes
- Tools MUST NOT accept free-text that bypasses §3.4 extraction rules (e.g. `commit` with `owner` ≠ caller's persona is invalid — you cannot record someone else's promise as theirs; use `expect`).
- Additional tools MAY be exposed; these five are the minimum for the "conforming node" claim (§8).
