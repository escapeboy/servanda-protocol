# Appendix A — Servanda edges and W3C Verifiable Credentials (non-normative)

**Status: informative. Nothing in this appendix is normative.** It defines no wire format, adds no
MUST, and is not part of the conformance suite. Interoperability with the W3C Verifiable
Credentials data model is **out of scope for v0**; this note exists so the question is recorded
with an answer rather than re-opened as though it were undecided.

## The shape of the correspondence

A Servanda edge and a Verifiable Credential are both signed statements by a named key about a
named subject, and the pieces line up loosely:

| Servanda (§4) | VC data model | Note |
|---|---|---|
| edge `owner` | `issuer` | for the `proposed` assertion |
| edge `owed_to` | `credentialSubject.id` | the counterparty |
| `commitment_hash` | a claim in `credentialSubject` | Servanda carries the digest, never the plaintext (M-7) |
| `proposed_at` | `issuanceDate` | |
| `due` | `expirationDate` | not the same meaning — `due` is when a promise falls due, not when a statement stops being true |
| assertion `sig` | `proof` | different suite and different preimage |

An edge is therefore *expressible* as a VC, and a v1 or later profile could define that mapping.

## Why it is not adopted in v0

- **A VC is unilateral; an edge is bilateral.** A credential is one issuer's statement about a
  subject. An edge does not exist until the counterparty's `confirmed` signature is in the chain
  (M-2). The confirm-first guarantee is the load-bearing property of this protocol, and the VC data
  model has no place to put it that a verifier is obliged to check.
- **An edge is a state machine, not a statement.** §4.3's transition table, not a single signed
  document, is what makes an edge mean anything. A VC representation would have to carry the whole
  assertion chain as an opaque claim, at which point the VC is an envelope rather than the model.
- **A VC's default is disclosure; an edge's default is not.** §5's visibility rules and M-7 mean
  the plaintext never crosses the wire. Most VC tooling assumes the claim is the payload.

## If the mapping is wanted later

The natural form is a profile document, not a change to §4: define a VC representation of a
*closed* edge — the one case that is genuinely a completed, unilateral-to-present statement — and
leave the open lifecycle to the native format. That would need its own conformance vectors and its
own issue; it is not tracked as a v0.1 item.
