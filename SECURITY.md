# Security Policy

## Status of this protocol

**The Servanda protocol has not been reviewed by an external cryptographer.** It is DRAFT v0.1-pre.

An external protocol security audit is planned before v1 and is a release gate (open questions,
"External protocol security audit"). Until that audit completes, treat every cryptographic
construction in `spec/09-threat-model.md` as unreviewed:

- Ed25519 → X25519 conversion via the birational map for transport encryption (§6.3, §9.3) — see
  issue #7.
- The ad-hoc X25519 + XChaCha20-Poly1305 profile, pending HPKE migration (§6.3) — see issue #6.
- Argon2id parameters (§9.3) — see issue #7.
- The commitment hash preimage and its five-field domain (§3.2) — see issue #8.

Do not deploy an implementation of this draft where a compromise would matter.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately via GitHub's [private vulnerability
reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability), which creates a private advisory visible
only to maintainers.

If that is unavailable to you, open a public issue containing **only** a request for a private
channel — no details of the finding.

### What to include

- Which section(s) of the spec the problem is in, or which vector demonstrates it.
- The adversary you assume (§9.1 lists the ones already in scope) and their capabilities.
- What the adversary achieves — forged edge, readable plaintext, bypassed confirmation, undetected
  divergence, deanonymized personas.
- A concrete sequence, or a test vector, if you have one. A vector that a conforming verifier
  accepts but should reject is the strongest possible report.

### What we consider in scope

Spec-level flaws: anything that lets an adversary create a promise nobody signed, read what §5 says
they cannot read, make two conforming nodes disagree about a chain's validity, link personas that
§1.2 says are unlinkable, or defeat a stated MUST in §8.

Findings in `tools/` (the vector generator) are in scope but low severity — it is a build tool, not
a deployed component.

### Out of scope

- Vulnerabilities in a third-party implementation of this protocol — report to that implementation.
- Weaknesses already documented as open in §9.6 or in issues #6, #7, #8. Confirming a known gap is
  useful as a comment on that issue, not as a private report.
- The absence of the external audit itself.

### Response

Acknowledgement within 5 business days. Because no implementation is deployed, there is no patch
window to coordinate: the fix for a spec flaw is a normative change under
[GOVERNANCE.md](GOVERNANCE.md), and it will be discussed publicly once the reporter agrees to
disclose.

Reporters are credited by name or handle unless they ask not to be.
