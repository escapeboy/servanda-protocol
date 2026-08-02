# §6 Reconciliation & federation (normative)

## 6.1 Transport abstraction

Wire messages are transport-agnostic signed JSON. v0 defines two transports:
- **git**: a shared repository; messages are files under `servanda/{edge_id}/{seq}-{type}.json`; sync = fetch/push. Suits team scopes (self-hosted, offline-tolerant).
- **hub**: HTTPS relay. `POST /servanda/v0/deliver` with an encrypted envelope; `GET /servanda/v0/inbox?persona=...` (authenticated by persona signature challenge). Hubs are discovered via the domain anchor (§1.5).

  **The challenge signature MUST name the hub it is for, inside the signed preimage**, and a hub MUST refuse an authentication naming any hub but itself. The signed object is `{v, type: "inbox_auth", persona, audience, challenge, issued_at, sig}`, where `audience` is the hub's own base URL as the persona's §6.7 record names it.

  Without `audience` the signature is a bearer token valid at **every** hub at once, and §6.7's ordered hub list — which exists so a persona can be reachable when one hub is down — becomes the attack surface. One compromised hub in that list drains the persona's queue at all the others: it fetches an honest hub's outstanding challenge (a challenge is mintable by anyone, since it is issued before authentication by construction), serves it to the persona as its own, collects the signature, and replays it. The honest hub sees its own nonce and a valid signature by the persona it names, and hands over the queue. Everything §6.3 protects survives — the attacker holds ciphertext it cannot open — but "hubs MUST deliver only to the persona" does not, and the recipient, sizes and timings of the whole retained queue are exactly the metadata §6.3 does not encrypt.

  A challenge is public by construction and is not a secret; `audience` is what makes the SIGNATURE non-transferable, which is the property that was missing.

## 6.2 Message types

`propose` (edge + proposed assertion) · `assert` (any subsequent assertion) · `publish`/`unpublish` · `attestation`/`revocation`/`rotation` · `recon_request`/`recon_response` (6.4) · `recover_request`/`recover_response` (6.6)

All messages: `{ v, type, payload, sender:"<persona_id>", recipient:"<persona_id>", sent_at, sig }`.

**`recipient` is inside the signed preimage, and that is the whole point of it.** Without it a signature says *this persona wrote this* and says nothing about *whom they wrote it to*, so any recipient can re-seal a validly-signed message to a third party and it verifies there unchanged. §6.3's courier is anonymous by design — it authenticates nobody — so the signature is the only place the binding can live.

A recipient MUST discard a message whose `recipient` is not itself, before doing anything else with it. The check is cheap and it is not the only defence: `propose` is separately bound by `edge.owed_to`, and `assert` by party membership. But those are per-message-type rules that each new type must remember to re-derive, and this one holds for every type there will ever be.

`recipient` does not widen what a hub learns. §6.3 seals the entire message, `recipient` included, and the hub already routes by a recipient it can see on the outer envelope.

## 6.3 Blind courier requirement

Hub-bound payloads MUST be encrypted to the recipient's X25519 key using **HPKE (RFC 9180) in Base mode**, ciphersuite **DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20-Poly1305** (`kem_id = 0x0020`, `kdf_id = 0x0001`, `aead_id = 0x0003`). A conforming hub sees: recipient persona_id, ciphertext, timestamps — nothing else. Hubs MUST NOT be able to read or fabricate edges (fabrication is prevented by signature verification at recipients regardless of hub honesty).

`info` MUST be `"servanda/0.1 blind-courier v2" || 0x00 || recipient_persona_id` — **the label keeps its `0.1` spelling in v0.2 for the reason the §0 domain tags do**: it is a KDF context string separating this use of HPKE from every other, not a version marker. Rewriting it would change every ciphertext and buy no separation that is not already there, per §0's domain-separation rule. Binding the `persona_id` and not merely the X25519 key is deliberate: the key is published in a §6.7 inbox record and a persona may publish a new one, so binding the key alone would tie a payload to whichever key an identity currently advertises rather than to the identity. `aad` MUST be the JCS canonical form of the envelope members a courier can read — `{v, type, recipient, sent_at}` — so those stay readable and become unforgeable.

The encapsulated key travels; **no nonce does.** HPKE derives it from the key schedule, so a sender cannot choose, reuse or leak one. One sealed payload per encapsulation: a context MUST NOT be reused across messages.

**Base mode, not Auth.** Binding a sender's static key into the KEM would defeat the property this section exists for — the courier must not learn who sent what. Authentication is the Ed25519 signature inside the ciphertext, and the recipient binding it needs is the `recipient` member of the signed message (§6.2).

*Why an RFC and not a profile of our own.* The previous text specified ECDH followed by an AEAD and left the KDF, the context binding and the nonce derivation unstated — which made the construction implementation-defined, so two conforming nodes could not open each other's payloads. Every one of those decisions is one RFC 9180 has already made and had reviewed, and it ships test vectors, so an implementation can be checked against an answer written by somebody else. That is the part a hand-assembled profile can never have.

## 6.4 Reconciliation

Periodic pairwise sync between nodes sharing edges:
- `recon_request`: `{ edges: [ {edge_id, latest_assertion_hash} ] }` for all shared open edges.
- `recon_response`: missing assertions for divergent chains.
- Divergence in *state* is resolved by the transition table — assertions invalid per §4.3 are discarded; the valid chain wins. Divergence in *content* cannot occur post-confirmation (content is the hash; changes require supersession).

**`latest_assertion_hash` is a digest over the SET of assertions held, and MUST NOT depend on their order.** Take each assertion's `sig`, sort the resulting strings, and hash the canonical form of that list. This was previously undefined here, and the reading an implementation naturally reaches for — the hash of the *last* assertion held — does not converge: two honest nodes that each signed their own act and then received the other's hold identical sets in opposite orders, report different hashes forever, and re-exchange a chain each already has on every round. The field answers "do we hold the same assertions?", which is a question about a set; the last element of a sequence answers a different question.

Order is not thereby unimportant — it is what the transition table consumes, and two nodes holding the same set can still compute different states. That is a separate guarantee, kept by normalising each batch before applying it (below) and by §4.3 naming `contested-closure` for the case where two legal acts genuinely conflict.

**"the valid chain wins" assumes exactly one exists.** Where two do — two parties took different unilateral exits from `open` concurrently, each valid — neither may be discarded, and §4.4's `contested-closure` is the state both nodes MUST compute. Without it this bullet has no answer and reconciliation does not terminate; with it, both ends converge on the same chain and the same state, which is what this section promises.
- Escalation on drift (owner forgot) is a local decision of the owner's node upon seeing its own overdue open edge — reconciliation only guarantees both sides see the same chain.

## 6.5 Anti-spam / proposal budget

- A `proposed` edge is socially nothing (Sybil rule). Nodes SHOULD rate-limit inbound proposals per unknown sender and MUST NOT surface proposals from level-0 senders above a client-configurable cap. Expectation→proposal conversion MUST be user-initiated per counterparty (no bulk auto-invites).

## 6.6 Edge recovery (ADR-0014)

- `recover_request`: `{ persona: "<restored persona_id>", proof: { challenge, sig, rotation? } }` sent to known counterparties/hubs.
- **The proof MUST demonstrate possession of the key it claims.** `challenge` is a fresh nonce and `sig` is a signature over it by the key named in `persona`. Where the requester is recovering under a rotated key, `rotation` carries the §1.8 rotation statement so the responder can follow `old → new`, but the `sig` MUST still be by the **new** key: the rotation says which key succeeds which, and the challenge says who is asking.

  **v0.1 accepted a bare rotation statement as the whole proof, and that was a bulk-disclosure hole.** Rotations are published. A responder verified a genuine signature — by the OLD key, over a public artifact — and returned every edge and every assertion chain for both keys. Any party who merely *observed* a rotation could replay it and harvest the relationship history of both identities without ever holding either key. The signature was never the problem; it attested to the wrong proposition.
- `recover_response`: all edges + assertion chains where the requester is a party. Responders MUST verify the challenge signature before answering, MUST reject a request whose `proof` carries no `sig` over a `challenge`, and MUST NOT include plaintext (hashes only; plaintext recovery is a human act between counterparties).
- A responder SHOULD refuse a `challenge` it has already answered, so a captured request is not itself replayable.

## 6.7 Addressing & offline delivery (added 2026-07-25)

**Delivery model: asynchronous, store-and-forward, reconciliation-guaranteed.** No protocol operation is real-time; an offline counterparty is the normal case, not an edge case.

- **Inbox designation:** a persona routable over the hub transport publishes a self-signed inbox record `{ v, type:"inbox", persona, hubs:["https://hub.example/servanda"], dh_key, issued_at, sig }`. `dh_key` is the persona's X25519 public key (§1.2), and a sender MUST NOT seal to a key from a record whose signature does not verify against the persona it names, or whose lifetime has elapsed. M-17 already forbids a hub rewriting this record; carrying the encryption key here is why that matters twice over — a hub able to publish a key it holds could read everything addressed to that persona, which is the same attack as moving their mail, one layer along. A persona reachable only over git needs no `dh_key`, because §6.1 makes git confidentiality repository access and nothing is sealed. Only the persona key may change its own hubs (a hub cannot "move" its users). Org personas MAY inherit hubs from the org domain anchor (§1.5); the inbox record overrides.
- **Hub priority is the declared order.** `hubs` is an ordered list, most-preferred first. A sender MUST attempt delivery to `hubs[0]` before any later entry and MUST walk the list in order on failure; it MUST NOT reorder the list by its own measurements (latency, past success, operator preference). The order is the persona's own statement about where it wants its mail, and a sender that reorders it silently overrides that choice.
- **Inbox record lifetime.** An inbox record is valid for 30 days from `issued_at` and MUST be treated as expired thereafter; a sender MUST NOT route to a hub named only by an expired record. The persona SHOULD republish the record at half-life — 15 days after `issued_at` — so a refreshed record is in circulation well before the previous one expires. This is the same 30-day boundary hubs queue undelivered ciphertext for, deliberately: a message cannot outlive the addressing that produced it. Losing either is harmless, because §6.4 reconciliation, not delivery, is the guarantee.
- **Address form (informative):** clients SHOULD render routable personas as `<petname or handle> @ <hub domain>` with the seal level; the wire identity remains the persona key.
- **Store-and-forward:** sender delivers ciphertext to the recipient's declared hubs in the order declared; hubs queue with a TTL of 30 days and MUST deliver only to the persona (signature-challenge auth, §6.1). Senders SHOULD retry across declared hubs, in order.
- **Delivery is optimization; reconciliation is the guarantee.** Loss of any queued message is healed by the next §6.4 recon exchange between the parties; nothing shared can be permanently lost while either party holds it.
- **Out-of-band bootstrap (first contact / no node):** when the sender knows no inbox for the counterparty, a `propose` MAY travel as a self-contained signed payload in a URL/QR over any existing channel (email, chat). The recipient's node — or a hosted courtesy renderer for recipients without one — verifies the signature and presents the proposal; confirmation happens from their node (possibly created at that moment). This is the mechanical attachment point of the expectation→invitation flow (ADR-0013). A courtesy renderer MUST NOT be able to sign anything (it renders; the human confirms from a node holding keys).
- **Keyless courtesy renderer — what it may do with what it verifies.** A renderer holds no keys (M-18), so the only thing it can offer is the rendering itself, and everything it retains is a copy of someone's promise held by a party to neither side of it. A courtesy renderer MUST NOT cache payload content, MUST NOT log payload content, and MUST NOT persist a decoded payload beyond the request that rendered it. It MAY log that a render occurred and MAY count renders; it MUST NOT record the intent, the parties, the `commitment_hash`, or the `edge_id`.
- **An OOB proposal link MUST carry a signed payload.** A renderer MUST refuse to present any payload whose signature it has not verified against the `sender` named in the payload, and MUST NOT present an unverified payload with a caveat instead of refusing. Base64url and JSON say nothing about authenticity; a renderer that skips this check is a phishing surface, not a renderer.
- **Origin is not evidence.** The renderer runs on someone's domain, under TLS, and looks trustworthy for reasons that have nothing to do with the payload. It MUST show the recipient that the trusted-looking origin is not itself evidence: what is established is that the named sender key signed this payload, and nothing about who holds that key, whether it is the person the recipient has in mind, or whether the renderer's operator vouches for any of it. A renderer MUST NOT present its own identity, branding, or TLS status as bearing on the proposal's authenticity.
- **Git transport:** the shared repository is itself the store-and-forward medium; offline tolerance is inherent (push/pull on connect).
