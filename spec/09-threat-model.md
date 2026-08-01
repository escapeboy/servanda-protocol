# §9 Threat model appendix (normative summary; full rationale in ../docs/security.md)

## 9.1 Assets & adversaries

Assets: vault plaintext, keys/seed, edge integrity, attention (interruption channel), the network's trust semantics. Adversaries: injection via signals; malicious counterparty/spammer; compromised hub; compromised device; malicious org root; rude third-party client; legal discovery.

## 9.2 Pipeline containment (injection)

- Extraction: no tools, schema-bound output, single-persona context. Output enters no executor as free text. Executors receive typed objects + enumerated capabilities (no network by default).
- Residual risk stated honestly: LLM extraction is never injection-proof; containment guarantees the fooled model can produce at most an unconfirmed proposal — **nothing a human didn't sign**.

## 9.3 Crypto parameters (v0)

- Sign: Ed25519. Hash: SHA-256. Canonicalization: RFC 8785 JCS.
- KDF for passphrase keys: **Argon2id with the parameter set (m = 64 MiB, t = 3, p = 1)**. The three move together — they describe one analysed point, not three independent floors. An implementation MAY raise `m` or `t`; it MUST NOT lower any of the three. Every wrapped key MUST record the parameters it was created with, so raising them does not strand an existing vault: a wrap is opened with its own parameters, never with the current defaults. The salt MUST be at least 128 bits, fresh per wrap, from a CSPRNG, and stored beside the wrap.
- Content encryption: XChaCha20-Poly1305; random 256-bit content key; per-device + passphrase wrapping (M-16).
- Transport encryption to personas: **HPKE (RFC 9180) Base mode**, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20-Poly1305 (§6.3). The recipient's X25519 key is its own key at `m/7391'/{n}'/1'` and is published in its §6.7 inbox record — the Ed25519 signing key is never converted for key agreement, so one key pair is never used for two algorithms.
- Derivation: SLIP-0010 hardened paths from BIP-39 seed.

## 9.4 Trust-gradient safety (informative pointer)

Autonomy ceilings per risk class and asymmetric collapse are implementation requirements for executors shipped with the reference implementation; they are not wire-protocol matters but are REQUIRED for reference-impl conformance branding.

## 9.5 Attack table (abridged)

| Attack | Containment |
|---|---|
| Prompt injection in signal | 9.2; worst case junk proposal (M-2) |
| Fabricated promise attribution | M-1/M-2: cannot exist without owner signature |
| Hub reads/forges | 6.3 encryption; signatures verified end-to-end |
| Sybil proposal flood | proposals are socially nothing + 6.5 budgets |
| Malicious org root fabricates members | responsibility localized: edges say "org claims", domain anchor scopes blame (email model) |
| Gradient poisoning | class ceilings + asymmetric collapse (9.4) |
| Homoglyph impersonation | M-12 + petnames (client-local naming) |
| Discovery/subpoena of history | M-7 + M-15: provable *that*, unrecoverable *what* after retention |
| Device theft | wrapped keys; passphrase required for content key; persona rotation (1.7) |
| Machine loss | ADR-0014: seed/HD recovery, org/external-proof rotation, edge recovery (6.6) |

## 9.6 Out of scope for v0

Threshold group signing; formal verification of the transition table; anonymous credentials for cross-org level-3 without domain disclosure; post-quantum suites (layered migration path reserved via `v` field).
