# §4 Edge (normative)

## 4.1 Edge object (`layer: wire`)

```json
{
  "v": "servanda/0.2",
  "type": "edge",
  "edge_id": "<sha256 of the domain-tagged preimage — see below>",
  "commitment_hash": "<hex>",
  "owner": "<persona_id | group_pubkey>",
  "owed_to": "<persona_id | group_pubkey>",
  "proposed_at": "RFC3339",
  "due": "RFC3339 | null",
  "closure_policy": "on-evidence | on-acceptance",
  "acceptance_window": "ISO8601 duration | null (MUST be non-null iff closure_policy is on-acceptance)",
  "blocked_by": [ "<edge_id>" ],
  "fulfillment": { "policy": "all|any|k-of-n", "k": 2, "children": ["<edge_id>"], "coordinator": "<persona_id>" } ,
  "supersedes": "<edge_id> | null"
}
```
`fulfillment` present only on collective edges (owner is a group). `due` duplicated from the commitment because the counterparty must be able to verify expiry without plaintext.

**`edge_id` preimage.**

```
edge_id = sha256( "servanda/0.1:edge_id" || 0x00
                  || commitment_hash || owner || owed_to || proposed_at )
```

`||` denotes concatenation of octet strings with no separator and no length prefix. The preimage begins with the §0 domain tag: the 20 octets of the ASCII string `servanda/0.1:edge_id`, then a single `0x00`. Each of the four values then contributes its own UTF-8 encoding — the ASCII text of the lowercase hex digest for `commitment_hash`, of the lowercase hex public keys for `owner` and `owed_to`, and of the RFC 3339 timestamp for `proposed_at` — concatenated in exactly that order. The concatenation is unambiguous because the first three values are fixed-width (64 octets each) and only the last is variable-length; implementations MUST NOT decode the hex values to their 32-octet binary form before hashing.

Worked example, taken from `vectors/transitions/valid.json` case `on-acceptance-explicit-accept`:

```
offset   0 ..  19   "servanda/0.1:edge_id"                                              20 octets
offset  20           0x00                                                                1 octet
offset  21 ..  84   "9b1ac57fc1d466240ff28c10f70b74d5a9bf8344325b3130504955e7cd53cec5"  64  commitment_hash
offset  85 .. 148   "a8a49af4e897c55abaab67d4933c14395d7a5d2ede1b4421981970468864351a"  64  owner
offset 149 .. 212   "72d2b4360c12a3be02c3dd4092410c18c18870985891e7a099d94a93e3b38c0f"  64  owed_to
offset 213 .. 232   "2026-07-25T09:00:00Z"                                              20  proposed_at
                                                                              total  233 octets

edge_id = 141ffc0642fe610224ede93212bc2526d577a2d8ec2a29024afadba0ca5ffe0a
```

`vectors/transitions/valid.json` is normative for the exact bytes: any implementation that reproduces its `edge_id` values has the encoding right.

**The `edge_id` does not cover the rest of the edge.** The preimage covers only `commitment_hash`, `owner`, `owed_to` and `proposed_at`. The remaining members of the edge object are therefore NOT covered by the identifier and NOT covered by any assertion signature — in particular `closure_policy`, which decides who may close (§4.4), is unsigned. A node MUST bind an `edge_id` to the first edge body it accepts for that identifier, and MUST reject any subsequent edge body bearing the same `edge_id` whose other members differ, with the whole body discarded rather than merged. A party MUST NOT sign a `confirmed` assertion for an `edge_id` it holds no edge body for. Where the two parties hold bodies that differ under one `edge_id`, the edge is unverifiable in the sense of M-8 and MUST NOT auto-escalate.

**`acceptance_window`.** The member MUST be present on every edge object. It MUST be a non-null ISO 8601 duration when `closure_policy` is `on-acceptance`, and MUST be `null` otherwise. **There is no default duration**, because the field is never absent: an `on-acceptance` edge with a null `acceptance_window` is malformed and MUST be rejected, and a node MUST NOT accept assertions against it. A window is what decides when silence becomes consent, so it is always visible in the object the counterparty signs against rather than inherited from this document. An `acceptance_window` SHOULD NOT extend past `due` where `due` is non-null.

**`due` consistency.** An edge's `due` is duplicated from the commitment (§3.2) so that the counterparty can verify expiry without plaintext. The counterparty holds only `commitment_hash` and therefore cannot detect a mismatch between the edge's `due` and the `due` inside the hashed commitment. A party that holds both the commitment plaintext and the edge MUST verify that they agree and MUST treat a mismatch as making the edge unverifiable in the sense of M-8. Nodes MUST NOT rely on the counterparty to detect this.

## 4.2 State assertions (signed transitions)

Every transition is a signed assertion:
```json
{ "v":"servanda/0.2", "type":"assertion", "edge_id":"...", "state":"<target>",
  "asserted_at":"RFC3339", "by":"<pubkey>", "evidence_hash":"<hex>|null", "sig":"..." }
```
The edge's current state = the latest valid assertion per the transition table. Nodes MUST retain the full assertion chain (append-only).

## 4.3 Transition table

| From | To | Who may sign | Notes |
|---|---|---|---|
| — | proposed | owner | one signature; socially nothing (Sybil rule) |
| proposed | confirmed | owed_to | edge now exists; both signatures present across chain |
| confirmed | open | — (implicit; no signer) | confirmed ≡ open; the name is reserved for future escrow states |
| open | closed | owner, `evidence_hash` REQUIRED | under `on-evidence` this closes the edge; under `on-acceptance` it opens the acceptance window (4.4) |
| pending-acceptance | closed | **owed_to alone** | explicit acceptance |
| pending-acceptance | closed | owner, only once the window has elapsed | tacit acceptance; before the window elapses the assertion is invalid |
| pending-acceptance | disputed | either party, `evidence_hash` REQUIRED | cancels the acceptance window |
| open | released | **owed_to alone** | unilateral forgiveness |
| open | superseded | owner + owed_to (both assert) | successor edge referenced via `supersedes` on the new edge |
| open | expired | either party after `due` | only if `due` non-null; MUST NOT auto-escalate if edge unverifiable |
| open | disputed | either party, `evidence_hash` REQUIRED | resolution semantics: §4.4 |
| disputed | superseded/closed | both parties | agreement |
| disputed | expired | either party, only once `dispute_window` has elapsed | **not a verdict** — §4.4 |

Any assertion violating this table is **invalid** and MUST be discarded by conforming nodes (this is how constitutional rules bind rude clients).

**`open` is never assertable.** The `confirmed → open` transition is implicit: a node performs it on accepting a `confirmed` assertion, and no assertion carries `open` in its `state` member. Because no row of this table authorizes any signer to produce one, an assertion whose `state` is `open` violates the table and MUST be discarded under M-14. A node SHOULD report the reason as `implicit-transition-not-assertable` rather than as a malformed object, so that a rude client learns which rule it broke. `confirmed` and `open` are one effective state for every other row of this table: wherever `open` appears as a source state, an edge whose latest valid assertion is `confirmed` satisfies it.

**`pending-acceptance` is a state a node computes**; it is never a value carried in an assertion's `state` member. An `on-acceptance` edge enters it when the owner's evidence assertion is accepted, and the node MUST record the `asserted_at` of that assertion as the instant from which `acceptance_window` runs. A `closed` assertion by the owner from `pending-acceptance` MUST be discarded unless `asserted_at` is greater than or equal to that instant plus `acceptance_window`. Once a `disputed` assertion is accepted the acceptance window is cancelled; the edge MUST NOT re-enter `pending-acceptance`, and the only exits are those the `disputed` rows provide. A node MUST NOT infer act 1 from act 3 or vice versa by inspecting the assertion alone: which act a `closed` assertion by the owner performs is determined by the state the chain was in when it arrived.

**`asserted_at` MUST be non-decreasing per signer within a chain.** A node MUST discard an assertion whose `asserted_at` is earlier than the `asserted_at` of the most recent accepted assertion by that same signer.

The reason is that both windows in this specification — `acceptance_window` here and `dispute_window` in §4.4 — are measured between two `asserted_at` values, and until v0.2 both of those values could be written by the party the window constrains. An owner could mint `closed` dated years in the past and `closed` dated now, one second apart, and a node would compute the window as elapsed on an edge the counterparty had only ever confirmed. The contrast that identifies the flaw is `expired` from a due date: `due` sits on the edge object that both parties signed, cannot be moved unilaterally, and so the check on it means something.

**What this rule buys, and what it does not.** It closes the observed attack, which needs two assertions by one signer with the later one backdated. It does NOT stop a party backdating its *first* assertion in a chain, because there is nothing earlier by that signer to compare against and this protocol has no trusted clock. **A window between two self-asserted instants is therefore evidence about a cooperating counterparty and MUST NOT be relied on against a hostile one.** A node MAY additionally refuse an assertion dated in its own future; that is local policy, not conformance, because two honest nodes disagree about *now* and the protocol has no way to say which is right.

## 4.4 Closure

- `on-evidence`: a `closed` assertion by the owner with non-null `evidence_hash` (hash of the verification adapter's evidence bundle) closes the edge.
- `on-acceptance` (MUST be the default for cross-person edges): owner's evidence assertion opens the acceptance window; owed_to MAY sign `closed` (explicit accept) or `disputed` within the window; window expiry = tacit acceptance — the owner's node MAY then record a final `closed`. The assertion object carries no field in which to cite the expiry, and none is needed: the source state the chain was in already carries the meaning (§4.3).
- Reflexive commitments have no edges; closure is a vault-local act.

**Dispute resolution in v0: none — and expiry is not resolution.** This specification defines no arbitration and no third-party resolver. A `disputed` edge is *resolved* in exactly two ways: both parties assert `closed`, or both parties assert `superseded` and a successor edge is proposed (§4.5). A node MUST NOT move an edge out of `disputed` on any other basis — not on a unilateral assertion about the merits, not on an operator or hub decision — because the alternative is a protocol-level authority deciding who was right, which v0 deliberately does not have.

A third exit ends the edge without resolving it. Once `dispute_window` has elapsed from the `asserted_at` of the accepted `disputed` assertion, either party MAY assert `expired`. **This decides nothing about the merits.** It does not find for the disputant, it does not find for the owner, and a node MUST NOT present it as a resolution, a fault, or a completion — the edge is over and the question is still open. The `disputed` assertion, its `evidence_hash` and the whole chain remain exactly as they were: expiry appends, it never erases.

Without this exit, both resolutions require BOTH parties, so disputing is a unilateral act that freezes an edge permanently. A counterparty who disputes and then goes silent leaves an owner who may have genuinely fulfilled the commitment holding an edge that can never close, never expire and never be superseded. Ending a dead edge is a different act from ruling on it, and the protocol should not be usable to manufacture a permanent stalemate.

`dispute_window` is a protocol constant of **P30D**, not an edge member: it is nobody's to choose. A per-edge value would let one party pick the window that suits them, and the party who benefits from a long freeze is precisely the party who disputes.

## 4.5 Supersession (ADR-0010)

New edge (new `commitment_hash` if content changed; new `edge_id` always) with `supersedes` set. Valid only when both parties of the OLD edge have signed `superseded` assertions for it. The successor is named by the NEW edge's `supersedes` member only; the §4.2 assertion object carries no successor reference, so the parties' `superseded` assertions bind them to the fact of supersession and NOT to the identity of the successor. A verifier MUST NOT report the successor link as agreed by both parties. A node presenting a superseded edge MUST distinguish "both parties agreed this edge is superseded" from "this successor claims to supersede it", and MUST NOT present a successor whose `supersedes` pointer it has not itself verified against an edge body it holds.

Delegation: the new edge's owner differs → additionally requires the new owner's `proposed` signature (three keys total across the two edges). History is never deleted.

## 4.6 Fan-out

N edges sharing one `commitment_hash`. Each independently proposed/confirmed. One evidence bundle MAY close all sibling edges (each closure still requires per-edge assertions per 4.4). Edges are mutually invisible unless the owner publishes them into a common scope (§5).

## 4.7 Collective edges

Owner = group key. Validity rule (constitution §8): a collective edge MUST have either `fulfillment.children` whose union covers fulfillment, or `fulfillment.coordinator`. Otherwise nodes MUST mark it unverifiable (no auto-escalation). Parent state derives from children per `policy`; the derivation is computed locally by each party's node from child assertion chains shared in the relevant team scope — the counterparty sees only parent assertions.
