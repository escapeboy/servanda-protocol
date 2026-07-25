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
- Group key custody (single coordinator key vs k-of-n threshold) is **implementation-defined in v0**; the wire format only requires a valid Ed25519 signature by the group key. (Open question tracked; threshold scheme candidate for v0.2.)

## 1.5 Domain anchor

- An org root MAY be anchored to a DNS domain by publishing `https://{domain}/.well-known/servanda.json`:
```json
{ "v": "servanda/0.1", "org_root": "<pubkey_hex>", "hubs": ["https://hub.example/servanda"] }
```
  and/or a DNS TXT record `_servanda.{domain}` = `v=servanda0.1; k=<pubkey_hex>`.
- Verifiers MUST check the anchor at signature-verification time and SHOULD cache with the resource's TTL.

## 1.6 Binding proof ladder & persona linking

Verification levels, ascending (clients MUST display the achieved level and MUST NOT display a human name above the level's evidence — §8 M-12):

| Level | Evidence |
|---|---|
| 0 unconfirmed | none |
| 1 continuity | ≥1 prior confirmed edge with this key |
| 2 attested | valid, unrevoked org attestation |
| 3 domain-verified | level 2 + org root domain-anchored |
| ext external-proof | signed statement published on a controlled external channel (repo/gist/domain): `{type:"binding_proof", persona, channel_url, sig}` |

**Persona-linking statement** (explicitly user-initiated only): `{type:"link", personas:[A,B], sig_A, sig_B}` — both persona keys sign; proves common ownership without exposing the root.

## 1.7 Rotation & recovery

- **Rotation statement:** `{type:"rotation", old:"<pubkey>", new:"<pubkey>", rotated_at, sig_old, sig_new?}`. With `sig_old`, continuity transfers automatically. Verifiers MUST treat `new` as the successor for all open edges of `old`.
- **Seedless recovery paths** (ADR-0014): (a) org re-attestation of a fresh persona for the same human — org-scope continuity, level 2; (b) rotation statement published over an existing external binding proof channel — the channel is the anchor. A persona with no seed, no org, and no external proof is unrecoverable by design.
- **Key hierarchy for vault content** (normative restatement of security §5): random content key; wrapped independently per device key and by a passphrase-derived key (Argon2id, params in §9). A device key MUST NOT be the sole custodian of the content key.
