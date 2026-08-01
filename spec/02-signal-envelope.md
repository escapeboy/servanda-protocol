# §2 Signal envelope (normative)

Normalized ingress for all connectors. `layer: vault` — envelopes never cross node boundaries; they are the node's private observation log.

```json
{
  "v": "servanda/0.1",
  "type": "envelope",
  "id": "<sha256 of the domain-tagged canonical form sans id — see below>",
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
- **Bounds.** An envelope MUST be bounded where it is created. A connector MUST NOT emit an envelope whose canonical form (§0) exceeds 65536 octets, whose `payload` nests more than 8 levels below `payload` itself, or whose `refs` array holds more than 32 entries; no `refs` entry's `value` may exceed 2048 octets of UTF-8, and `actor.label` may not exceed 200 octets of UTF-8. Where the observed source exceeds any of these, the connector MUST clip and MUST NOT discard the observation: the fact that something was observed is the part that cannot be recovered later. Every string member of `payload` MUST be truncated to at most 8192 octets of UTF-8, and a truncation MUST fall on a Unicode scalar boundary — a clipped value MUST NOT contain a code point absent from the source. An envelope in which any member was clipped MUST carry `"clipped": true` at the top level, and for each clipped string member `x` SHOULD carry `payload.x_length`, the length in octets of the value as observed. `clipped` is absent, not `false`, when nothing was clipped. A node MUST reject an envelope that exceeds any bound above rather than canonicalize it; a node MAY apply stricter local bounds to envelopes it did not itself create, and MUST clip and mark such an envelope in exactly the manner above rather than silently storing or silently dropping it.

  Independently of these bounds, a canonicalizer MUST refuse a document nested more than 256 levels deep and MUST report that refusal to its caller rather than failing with a platform-dependent stack error. These bounds constrain the envelope, not the source; nothing here licenses any pipeline stage to interpret `payload` (M-6).
- `persona` scoping: a connector instance is bound to exactly one persona at registration. Envelopes MUST NOT be processed in any pipeline together with envelopes of a different org persona (§8 M-5).
- Connectors are MCP servers implementing `emit_envelope`. The envelope schema is the only contract between connector and core; connector-specific fields go under `payload`.
- Retention of envelopes is local policy; evidence referenced by commitments (§3) SHOULD be pinned until the referencing record closes + retention window.
- **`id` construction.** `id = sha256( "servanda/0.1:envelope_id" || 0x00 || JCS(envelope with `id` removed) )`, per the §0 domain-separation rule. The preimage is the whole envelope sans `id`, so **two nodes MUST compute the same `id` exactly when they emit the same envelope** — and `persona` and `received_at` are members of it, which means they must also share a persona and have recorded the same receipt instant. Because the bounds above fix what may be in that canonical form, this is a real guarantee and not an implementation-defined one: without the bounds, two nodes emitting the identical envelope could still disagree, which is why the bounds are normative rather than local policy.

  **There is no cross-node identifier for "the same observation" in v0.** An earlier revision of this paragraph claimed one, requiring two nodes that saw one source event to agree on an `id` given the same `source`, `kind`, timestamps, `actor`, `payload` and `refs`. That obligation could not be met: it named neither `persona`, which differs by construction between two nodes (M-5), nor the fact that `received_at` is the observing node's own clock rather than a property of the event. Whether such an identifier should exist is [#36](../../../issues/36), and it is a v0.2 matter because any answer changes a preimage.
