# §1 Identity (normative)

## 1.1 Root seed

- A root identity is generated from a 256-bit seed. Implementations MUST support BIP-39 mnemonic encoding (24 words) for the recovery kit; other encodings (printable QR kit) MAY be offered.
- The root key pair is Ed25519, derived from the seed via SLIP-0010.
- The root key MUST NOT appear in any wire object, message, or attestation. It signs nothing that leaves the vault except persona-linking statements (§1.6) and rotation statements (§1.7), both of which are explicitly user-initiated.

## 1.2 Persona derivation

- Personas are hardened SLIP-0010 child keys: path `m/7391'/{persona_index}'` (7391 = registered purpose constant for this protocol; placeholder until IANA-style registry exists).
- Derivation MUST be deterministic from the seed (recovery, ADR-0014) and MUST be one-way (unlinkability: no observer without the seed can link two personas).
- `persona_index` assignment is local bookkeeping; the vault records `{persona_index → context_label}`.
- A persona is identified on the wire by its public key: `persona_id = hex(pubkey)`.

## 1.3 Org roots and attestation

An organization has its own root key pair (generated per §1.1 or HSM-held; custody is out of scope for v0).

**Attestation object** (`layer: wire`):
```json
{
  "v": "servanda/0.1",
  "type": "attestation",
  "org": "<org_root_pubkey_hex>",
  "subject": "<persona_or_group_pubkey_hex>",
  "subject_kind": "persona | group",
  "claims": { "display_name": "Maria Ivanova", "handle": "maria@acme.com" },
  "issued_at": "...", "expires_at": "...",
  "sig": "<ed25519 by org root over canonical form sans sig>"
}
```
- `claims.display_name`/`handle` are the org's assertions, not protocol truths (§9).
- Revocation object: `{type:"revocation", org, subject, revoked_at, sig}`. Verifiers MUST treat edges signed after `revoked_at` as not-org-attested; edges signed before remain valid (offboarding semantics, docs/identity).

## 1.4 Group keys

- Group keys are attested with `subject_kind: "group"` plus `claims.members: [persona_id...]` (SHOULD) — membership disclosure is org-scope information; wire attestations sent cross-org MAY omit `members`.
- **Group key custody in v0 is coordinator-held.** A group key is a single Ed25519 key pair held by a named coordinator; the wire format requires a valid Ed25519 signature by that key and nothing more. A k-of-n threshold scheme is **deferred to v1** and is named here as deferred rather than left open: v0 has no threshold signature format, no share-distribution act, and no way for a counterparty to learn that a group signature was produced by k of n rather than by one holder. An implementation MAY hold the group key under a threshold scheme internally, but MUST NOT claim protocol-level threshold custody in v0, and a counterparty MUST NOT infer any custody property from a group signature beyond "the group key signed this".

## 1.5 Domain anchor

- An org root MAY be anchored to a DNS domain by publishing `https://{domain}/.well-known/servanda.json`:
```json
{ "v": "servanda/0.1", "org_root": "<pubkey_hex>", "hubs": ["https://hub.example/servanda"] }
```
  and/or a DNS TXT record `_servanda.{domain}` = `v=servanda0.1; k=<pubkey_hex>`.
- Verifiers MUST check the anchor at signature-verification time and SHOULD cache with the resource's TTL.

## 1.6 Binding proof ladder & persona linking

Verification levels, in ascending order of evidence — `0` < `1` < `ext` < `2` < `3`. `ext` ranks above `1` and below `2`: a binding proof is the persona's own signature on a channel it controls, which is self-assertion, whereas an attestation is a third party staking its own key. Where evidence is present for several levels, the achieved level is the highest-ranked of them. Clients MUST display the achieved level and MUST NOT display a human name above that level's evidence (§8 M-12).

| Level | Evidence |
|---|---|
| 0 unconfirmed | none |
| 1 continuity | ≥1 prior confirmed edge with this key |
| 2 attested | valid, unrevoked org attestation |
| 3 domain-verified | level 2 + org root domain-anchored |
| ext external-proof | signed statement published on a controlled external channel (repo/gist/domain): `{type:"binding_proof", persona, channel_url, sig}` |

A `binding_proof` binds a persona key to a channel, never to a human name. Levels `0`, `1` and `ext` therefore carry no display name, and a client at those levels MUST render the persona by its key (or an abbreviation of it) rather than by any name it obtained elsewhere. `display_name` and `handle` are org claims (§1.3) and MUST be rendered only at levels `2` and `3`, and only from a valid, unrevoked attestation. A client MUST NOT combine a name obtained at one level with a level badge earned by different evidence.

**Persona-linking statement** (explicitly user-initiated only): `{v:"servanda/0.1", type:"link", personas:[A,B], sig_A, sig_B}` — both persona keys sign; proves common ownership without exposing the root. Both signatures cover the §0 multi-signature preimage — `sha256(JCS({v, type, personas}))` — and `sig_A` MUST verify against `personas[0]` and `sig_B` against `personas[1]`. A link whose two signature members are byte-identical MUST be rejected.

## 1.7 Rotation & recovery

- **Rotation statement:** `{"v":"servanda/0.1", "type":"rotation", "old":"<pubkey>", "new":"<pubkey>", "rotated_at":"RFC3339", "sig":"..."}` where `sig` is by `old` over the §0 signing preimage. Implementations MUST emit this form. The signature by `old` is what transfers continuity: verifiers MUST treat `new` as the successor for all open edges of `old`. A rotation statement that carries no signature by `old` MUST be rejected; in particular a statement signed only by `new` MUST be rejected, since it is precisely the takeover this object exists to prevent. Where two distinct rotation statements from the same `old` both verify, a verifier MUST NOT choose between them: continuity stops at the fork and the identity MUST be reported as unresolved.
  - The earlier `sig_old`/`sig_new?` encoding is withdrawn: under the §0 rule every signer of a multi-signature object covers identical bytes, so `sig_new` would have proved nothing `sig_old` does not, and neither would have committed to the other's presence. The residual gap is that no rotation proves the new key's holder consented; a verifier SHOULD therefore require the new key to sign its own first assertion before treating it as active.
- **Seedless recovery paths** (ADR-0014): (a) org re-attestation of a fresh persona for the same human — org-scope continuity, level 2; (b) rotation statement published over an existing external binding proof channel — the channel is the anchor. A persona with no seed, no org, and no external proof is unrecoverable by design.
- **Key hierarchy for vault content** (normative restatement of security §5): random content key; wrapped independently per device key and by a passphrase-derived key (Argon2id, params in §9). A device key MUST NOT be the sole custodian of the content key.
