# Security Policy

## Status of this protocol

**The Servanda protocol has not been reviewed by an external cryptographer.** v0.1 is frozen as of
2026-08-01, and freezing is a statement about stability, not about assurance — the two freeze gates
closed without a review being performed: the Ed25519 → X25519 birational map was *removed* rather
than cleared (§6.3 is RFC 9180 HPKE over a persona's own X25519 key), and the Argon2id parameter
set was *accepted by the editors*. §00 records which is which, and neither is a clearance.

**An external audit is no longer carried as a v1 release gate**, and that is a decision rather
than an omission — [`docs/v1-criteria.md`](docs/v1-criteria.md) records the reasoning. It changes
nothing about the sentence above: **no cryptographer outside this project has examined any of
this**, and removing a gate that was never going to be met does not make the constructions any
more reviewed. If anything it makes this page more load-bearing, because it is now the only place
that says so.

Treat every construction in `spec/09-threat-model.md` as unreviewed. Two of the four items this
section used to list have since been removed from the specification rather than cleared, and the
distinction matters when you are deciding what to trust:

- **Removed, not reviewed.** The Ed25519 → X25519 birational map is gone: §6.3 is HPKE (RFC 9180)
  over a persona's own X25519 key, so no key pair serves two algorithms. The ad-hoc
  X25519 + XChaCha20-Poly1305 profile is gone with it. Standard primitives used in standard ways,
  with the RFC's own vectors as an oracle — a better outcome than a review, but not one.
- **Still resting on the editors' judgement.** The §9.3 Argon2id profiles, and the §3.2 commitment
  hash preimage with its five-field domain.

An adversarial pass in August 2026 found nine breaks in the reference implementation, six of which
were fixed. **It was run by agents the editor spawned, which makes it the editor reviewing the
editor** — same priors, no independent selection, no accountability. It is not a review and is
recorded here so that it is never mistaken for one.

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
