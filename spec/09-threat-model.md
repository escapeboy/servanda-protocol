# §9 Threat model appendix (normative summary; full rationale in ../docs/security.md)

## 9.1 Assets & adversaries

Assets: vault plaintext, keys/seed, edge integrity, attention (interruption channel), the network's trust semantics. Adversaries: injection via signals; malicious counterparty/spammer; compromised hub; compromised device; malicious org root; rude third-party client; legal discovery.

## 9.2 Pipeline containment (injection)

- Extraction: no tools, schema-bound output, single-persona context. Output enters no executor as free text. Executors receive typed objects + enumerated capabilities (no network by default).
- Residual risk stated honestly: LLM extraction is never injection-proof; containment guarantees the fooled model can produce at most an unconfirmed proposal — **nothing a human didn't sign**.

## 9.3 Crypto parameters (v0)

- Sign: Ed25519. Hash: SHA-256. Canonicalization: RFC 8785 JCS.
- KDF for passphrase keys: **Argon2id**, at one of two named parameter sets. The three values move together within a set — each set describes one analysed point, not three independent floors.

  | Profile | m | t | p | When |
  |---|---|---|---|---|
  | **desktop** (default) | 1 GiB | 2 | 4 | Any machine that can spare a gigabyte for a few seconds. |
  | **constrained device** (floor) | 64 MiB | 3 | 1 | A phone, a container with a hard memory limit, or any deployment where the desktop profile cannot run. |

  An implementation MUST NOT create a wrap weaker than the constrained-device profile, measured as **total work (m·t·p) AND memory (m) separately**. Both conditions are required and neither implies the other: the desktop profile has a *lower* `t` than the floor, so a per-parameter comparison rejects the point this specification recommends, and a work-only comparison would let a profile buy its way to the floor with iterations while giving up the memory. **Memory is the parameter that matters most**, because it is the only one that cuts an attacker's *parallelism* — a 24 GB GPU holds roughly 350 concurrent Argon2id instances at 64 MiB and roughly 22 at 1 GiB, while raising `t` costs the attacker and the owner in the same proportion. What this passphrase guards is not content but the **identities**: a persona's private key is sealed under the same content key every record is.

  An implementation MAY raise `m` or `t` above the desktop profile. Every wrapped key MUST record the parameters it was created with, and a wrap MUST be opened with its own recorded parameters, never with the current defaults — so raising them does not strand an existing vault. **An implementation that permits a raise MUST also provide a way to re-wrap an existing vault at the new profile.** Without one, "MAY raise" is a permission over new vaults only, and the value a vault is created at is the value for the rest of its life; the parameters are then not a policy but an accident of the day the vault was made.

  The salt MUST be at least 128 bits, fresh per wrap, from a CSPRNG, and stored beside the wrap.

  **Passphrase generation.** Where an implementation generates a vault passphrase rather than accepting one, it MUST draw at least 128 bits of entropy from a CSPRNG. This is a rule about generation and not about acceptance: refusing a passphrase its owner chose is a product decision this specification takes no position on, but producing a weak one is a defect. The reason it belongs here at all is that the parameters above fix what one guess costs an attacker and nothing else — how many guesses they need is decided entirely by the passphrase, and across every parameter set in this range it is the entropy, not the KDF, that decides the outcome. A 1 GiB profile over a memorable phrase is a slow search of a small space.

  **What an opener MUST bound.** These parameters are read from a keyset, and a keyset arrives over §6.6 recovery and over import as well as from a local disk. An implementation MUST bound the total Argon2id work a single open may cost — over the whole call, not per wrap, since the number of candidate wraps multiplies the cost of each. Bounding `m` alone is insufficient: `m` announces itself by failing to allocate, while `t` and `p` and the candidate count do not, and their product is what is spent.
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

## 9.6 Out of scope for v0 and for v1

Threshold group signing; formal verification of the transition table; anonymous credentials for cross-org level-3 without domain disclosure; post-quantum suites (layered migration path reserved via `v` field).

**These are deferred past v1 deliberately, and the deferral is recorded here so that "out of scope" cannot quietly become "forgotten".** v1 is defined by [`docs/v1-criteria.md`](../docs/v1-criteria.md) and by §8 conformance; none of the four is a v1 gate. Each is deferred for its own reason rather than for a shared one:

- **Threshold group signing** — §1.4 already defers it with its reason, and a group key with a named coordinator covers the cases v1 has to serve.
- **Formal verification of the transition table** — the strongest argument FOR it is recent: two implementations, written separately, read §4.3's `confirmed ≡ open` equivalence as a general "open family" and both grew three transitions the table does not have. A model would have caught exactly that class. It is still not a v1 gate, because the same defect is now caught by vectors, which every implementation must pass — a mechanism this project already has, rather than one it would have to acquire.
- **Anonymous credentials for cross-org level-3** — needs a construction that is still moving in the literature, and §1.6's ladder degrades honestly without it.
- **Post-quantum suites** — waits on standardisation outside this project. The `v` field is what reserves the migration, and reserving it was the v0 obligation.
