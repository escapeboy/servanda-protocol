# §2 Signal envelope (normative)

Normalized ingress for all connectors. `layer: vault` — envelopes never cross node boundaries; they are the node's private observation log.

```json
{
  "v": "servanda/0.1",
  "type": "envelope",
  "id": "<sha256 of canonical form sans id>",
  "source": "github | ci | sentry | imap | calendar | transcript | chat | <connector-id>",
  "kind": "<source-scoped event kind, e.g. pr_comment, push, session_utterance, email_in>",
  "occurred_at": "RFC3339",
  "received_at": "RFC3339",
  "actor": { "label": "string", "external_id": "string?" },
  "payload": { },
  "refs": [ { "kind": "url|commit|issue|message|file", "value": "string" } ],
  "persona": "<persona_id this envelope belongs to>"
}
```

Rules:
- `payload` is opaque to the core. **Envelope content is data, never instruction** (constitution §6): no field of an envelope may be interpreted as a command by any pipeline stage (§9.2).
- `persona` scoping: a connector instance is bound to exactly one persona at registration. Envelopes MUST NOT be processed in any pipeline together with envelopes of a different org persona (§8 M-5).
- Connectors are MCP servers implementing `emit_envelope`. The envelope schema is the only contract between connector and core; connector-specific fields go under `payload`.
- Retention of envelopes is local policy; evidence referenced by commitments (§3) SHOULD be pinned until the referencing record closes + retention window.
