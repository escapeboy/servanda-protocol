# §2 Signal envelope (normative)

Normalized ingress for all connectors. `layer: vault` — envelopes never cross node boundaries; they are the node's private observation log.

```json
{
  "v": "servanda/0.2",
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
- **Bounds.** An envelope MUST be bounded where it is created. A connector MUST NOT emit an envelope whose canonical form (§0) **measured with `id` removed** exceeds 65536 octets, whose `payload` nests more than 8 levels below `payload` itself, or whose `refs` array holds more than 32 entries; no `refs` entry's `value` may exceed 2048 octets of UTF-8, and `actor.label`, `actor.external_id`, `source` and `kind` may each not exceed 200 octets of UTF-8. Where the observed source exceeds any of these, the connector MUST clip and MUST NOT discard the observation: the fact that something was observed is the part that cannot be recovered later. Every string member of `payload` MUST be truncated to at most 8192 octets of UTF-8, and a truncation MUST fall on a Unicode scalar boundary — a clipped value MUST NOT contain a code point absent from the source. An envelope in which any member was clipped MUST carry `"clipped": true` at the top level, and for each clipped string member `x` SHOULD carry `payload.x_length`, the length in octets of the value as observed. `clipped` is absent, not `false`, when nothing was clipped. **A connector MUST NOT emit an envelope it could not bring inside every bound**, and MUST report that refusal to its caller rather than emitting one and leaving the rejection to a node. In v0.1 `source`, `kind` and `actor.external_id` carried no bound of their own while still counting toward the 65536-octet canonical form, so a conforming connector could build an envelope no clipping rule could rescue: every member it was permitted to clip was already inside its own limit. Bounding those three makes that unreachable through ordinary input; the refusal covers what remains. A node MUST reject an envelope that exceeds any bound above rather than canonicalize it; a node MAY apply stricter local bounds to envelopes it did not itself create, and MUST clip and mark such an envelope in exactly the manner above rather than silently storing or silently dropping it.

  **Two measurements the earlier text left to the reader, and one of them has only one possible answer.**

  The canonical-form bound is measured **sans `id`**, and it could not be otherwise: `id` is a digest *over* the bounded form, so measuring with it is circular — a connector cannot know whether the envelope fits until it has computed `id`, and computing `id` may be what pushes it over. Every implementer who read "canonical form" as "the whole stored object" measured 65608 on an envelope this specification calls conformant. Stated now because it was load-bearing and silent, not because it was in doubt once asked.

  A **level** is the level of a VALUE, and `payload`'s own members are at level 1: `payload.a = "x"` puts that string at level 1, so the scalar at the bottom of a chain occupies a level like any other value. Counting containers instead — the other reading, and the one an implementer is as likely to reach — admits a document one level deeper than intended. This was defined only in a conformance vector's prose, which is normative content in the wrong place.

  Independently of these bounds, a canonicalizer MUST refuse a document nested more than 256 levels deep and MUST report that refusal to its caller rather than failing with a platform-dependent stack error. These bounds constrain the envelope, not the source; nothing here licenses any pipeline stage to interpret `payload` (M-6).
- `persona` scoping: a connector instance is bound to exactly one persona at registration. Envelopes MUST NOT be processed in any pipeline together with envelopes of a different org persona (§8 M-5).
- Connectors are MCP servers implementing `emit_envelope`. The envelope schema is the only contract between connector and core; connector-specific fields go under `payload`.
- Retention of envelopes is local policy; evidence referenced by commitments (§3) SHOULD be pinned until the referencing record closes + retention window.
- **`id` construction.** `id = sha256( "servanda/0.1:envelope_id" || 0x00 || JCS(envelope with `id` removed) )`, per the §0 domain-separation rule. The preimage is the whole envelope sans `id`, so **two nodes MUST compute the same `id` exactly when they emit the same envelope** — and `persona` and `received_at` are members of it, which means they must also share a persona and have recorded the same receipt instant. Because the bounds above fix what may be in that canonical form, this is a real guarantee and not an implementation-defined one: without the bounds, two nodes emitting the identical envelope could still disagree, which is why the bounds are normative rather than local policy.

  **There is no cross-node identifier for "the same observation", and v0.2 deliberately does not add one.** An earlier revision of this paragraph claimed the `id` was one, requiring two nodes that saw a single source event to agree given the same `source`, `kind`, timestamps, `actor`, `payload` and `refs`. That obligation could not be met: it named neither `persona`, which differs by construction between two nodes (M-5), nor the fact that `received_at` is the observing node's own clock rather than a property of the event.

  Adding a second identifier over only the event-derived members was considered for this revision and **rejected** ([#36](../../../issues/36)). Nothing in the protocol consumes it: `evidence_refs` (§3.1) are per-vault by design and want an identifier that is exactly one envelope in exactly one vault, which is what the `id` already is. A federation feature that wants cross-node deduplication would need it, and no such feature exists — specifying an identifier before anything reads it fixes a shape by guesswork and gives implementers a member to populate and nobody to answer to. It stays available for the revision that has a consumer.
