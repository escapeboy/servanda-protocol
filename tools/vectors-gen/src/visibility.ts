/**
 * §5.3 / M-4 — the visibility matrix.
 *
 * §8 named "visibility matrix tests" as v0 suite scope for a long time and **the family had never
 * existed**, which is how eight MUSTs came to be presented as covered. This is that family.
 *
 * The rule is worth stating in the negative, because that is the shape it has to hold in. A node
 * serves an edge to a requester only when it can name the grant that permits it, and the default
 * is refusal. Anything built the other way round — refuse when a rule forbids it — is one missing
 * rule away from serving somebody else's relationships to a stranger.
 *
 * Every input is a document: the edge, the publish records, an attestation, a revocation, and the
 * instant the decision is taken. That is what makes M-4 vectorable at all where M-5 and M-11 are
 * not — this decision has an observable output (a §6.4 recon response either carries the edge or
 * does not), and it is a pure function of things that can be written down.
 */

import { signObject } from './crypto.js';
import type { Json } from './jcs.js';
import { ALICE, BOB, CAROL, HUB_OPERATOR, ORG_ROOT, PROTOCOL_VERSION, makeEdge, type Edge } from './protocol.js';
import type { Persona } from './crypto.js';

export interface Publish {
  v: string;
  type: 'publish';
  edge_id: string;
  scope: string;
  published_at: string;
  by: string;
  sig: string;
}

export interface Attestation {
  v: string;
  type: 'attestation';
  org: string;
  subject: string;
  subject_kind: 'persona' | 'group';
  claims: Record<string, Json>;
  issued_at: string;
  expires_at: string;
  sig: string;
}

export interface Revocation {
  v: string;
  type: 'revocation';
  org: string;
  subject: string;
  revoked_at: string;
  sig: string;
}

/** What a node holds when it is asked for an edge, and who is asking. */
export interface VisibilityInput {
  now: string;
  holder: string;
  requester: string;
  edge: Edge;
  publishes: Publish[];
  attestations: Attestation[];
  revocations: Revocation[];
}

export type VisibilityRefusal = 'not-a-party-and-not-published-to-a-scope-you-belong-to';

export type VisibilityGrant =
  | { serve: false; reason: VisibilityRefusal }
  | { serve: true; via: 'party' }
  | { serve: true; via: 'scope'; scope: string };

const isParty = (edge: Edge, persona: string) => edge.owner === persona || edge.owed_to === persona;

/**
 * The reference decision. A positive test throughout: the function returns `serve: false` unless
 * it reaches a `return` that names the rule granting access.
 */
export function decideVisibility(input: VisibilityInput): VisibilityGrant {
  const { edge, requester, publishes, attestations, revocations } = input;
  const now = Date.parse(input.now);

  if (isParty(edge, requester)) return { serve: true, via: 'party' };

  for (const publish of publishes) {
    if (publish.edge_id !== edge.edge_id) continue;
    // §5.2: "Only a party to the edge may publish it." A publish record signed by somebody who is
    // not a party is not a grant, however well-formed — otherwise anyone who could get a record
    // into a node's store could publish anyone's edge into a scope they happen to belong to.
    if (!isParty(edge, publish.by)) continue;

    // The requester IS the scope: a personal scope, or an org asking for its own published edges.
    if (publish.scope === requester) return { serve: true, via: 'scope', scope: publish.scope };

    // M-4c, structurally: the attestation's `org` must equal THIS publish's scope, by exact key.
    // No org key ever stands in for a team key, because nothing here maps between them.
    const attestation = attestations.find((a) => a.subject === requester && a.org === publish.scope);
    if (!attestation) continue;
    if (Date.parse(attestation.expires_at) < now) continue;

    // §1.3: "Edges signed before `revoked_at` remain valid (offboarding semantics)" — but that is
    // about the validity of what a departed member SIGNED, not about what they may still be
    // SHOWN. A revoked member is not a member, so serving stops.
    const revocation = revocations.find((r) => r.subject === requester && r.org === publish.scope);
    if (revocation && Date.parse(revocation.revoked_at) <= now) continue;

    return { serve: true, via: 'scope', scope: publish.scope };
  }

  return { serve: false, reason: 'not-a-party-and-not-published-to-a-scope-you-belong-to' };
}

const sign = (obj: Record<string, Json>, by: Persona) =>
  signObject(obj, by.privateKey);

export function makePublish(edgeId: string, scope: string, by: Persona, publishedAt: string): Publish {
  const unsigned = {
    v: PROTOCOL_VERSION,
    type: 'publish' as const,
    edge_id: edgeId,
    scope,
    published_at: publishedAt,
    by: by.personaId,
  };
  return { ...unsigned, sig: sign(unsigned as unknown as Record<string, Json>, by) };
}

export function makeAttestation(opts: {
  org: Persona;
  subject: string;
  issuedAt: string;
  expiresAt: string;
}): Attestation {
  const unsigned = {
    v: PROTOCOL_VERSION,
    type: 'attestation' as const,
    org: opts.org.personaId,
    subject: opts.subject,
    subject_kind: 'persona' as const,
    claims: {},
    issued_at: opts.issuedAt,
    expires_at: opts.expiresAt,
  };
  return { ...unsigned, sig: sign(unsigned as unknown as Record<string, Json>, opts.org) };
}

export function makeRevocation(org: Persona, subject: string, revokedAt: string): Revocation {
  const unsigned = {
    v: PROTOCOL_VERSION,
    type: 'revocation' as const,
    org: org.personaId,
    subject,
    revoked_at: revokedAt,
  };
  return { ...unsigned, sig: sign(unsigned as unknown as Record<string, Json>, org) };
}

export interface VisibilityCase {
  name: string;
  description: string;
  rule: 'M-4a' | 'M-4b' | 'M-4c' | '§5.2';
  input: VisibilityInput;
  expected: VisibilityGrant;
}

const NOW = '2026-08-01T12:00:00Z';
const PUBLISHED_AT = '2026-07-26T09:00:00Z';
const ISSUED_AT = '2026-07-01T00:00:00Z';
const EXPIRES_LATER = '2027-01-01T00:00:00Z';
const EXPIRED_ALREADY = '2026-07-15T00:00:00Z';
/** ORG_ROOT is the org scope; HUB_OPERATOR's key stands in for a distinct TEAM scope key. */
const TEAM_SCOPE = HUB_OPERATOR;

export function buildVisibilityCases(edge: Edge): Omit<VisibilityCase, 'expected'>[] {
  /**
   * A second edge the holder genuinely has. The "wrong edge" case needs one, and it needs to be
   * REAL: a publish record naming an edge the node does not hold is not a situation a node can be
   * in — the vault refuses to store one — so a case built that way would test a state that never
   * occurs and would be unreachable in any implementation that checks the same thing.
   */
  const otherEdge = makeEdge({
    commitment_hash: edge.commitment_hash,
    owner: edge.owner,
    owed_to: edge.owed_to,
    proposed_at: '2026-07-26T09:00:00Z',
  });
  const base = {
    now: NOW,
    holder: ALICE.personaId,
    edge,
    publishes: [] as Publish[],
    attestations: [] as Attestation[],
    revocations: [] as Revocation[],
  };
  const publishedToOrg = makePublish(edge.edge_id, ORG_ROOT.personaId, ALICE, PUBLISHED_AT);
  const attestedIntoOrg = makeAttestation({
    org: ORG_ROOT,
    subject: CAROL.personaId,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_LATER,
  });

  return [
    {
      name: 'a-party-is-served-without-any-publish',
      description:
        '§5.3: visibility follows PARTICIPATION. The counterparty to an edge needs no publish ' +
        'record, no scope and no attestation — being one of the two people the promise is ' +
        'between is the whole grant.',
      rule: 'M-4a',
      input: { ...base, requester: BOB.personaId },
    },
    {
      name: 'the-owner-asking-its-own-holder-is-served',
      description:
        'The mirror of the case above, which exists because "party" is a two-sided test and a ' +
        'verifier that checked only `owed_to` would pass every other case in this family.',
      rule: 'M-4a',
      input: { ...base, requester: ALICE.personaId },
    },
    {
      name: 'a-stranger-is-refused-when-nothing-is-published',
      description:
        'M-4a in its bare form: neither a party nor a member of any scope the edge is published ' +
        'in, because it is published nowhere.',
      rule: 'M-4a',
      input: { ...base, requester: CAROL.personaId },
    },
    {
      name: 'a-scope-member-is-refused-an-UNPUBLISHED-edge',
      description:
        'M-4b, and the case the rule exists for: "Scope membership grants NO visibility by ' +
        'itself into unpublished edges of members." CAROL holds a valid, unexpired, unrevoked ' +
        'attestation into the org, and ALICE holds an edge, and CAROL still sees nothing — ' +
        'because ALICE never published it. An implementation that resolved membership first and ' +
        'looked for a publish second would serve this, and would pass every positive case here.',
      rule: 'M-4b',
      input: { ...base, requester: CAROL.personaId, attestations: [attestedIntoOrg] },
    },
    {
      name: 'a-scope-member-is-served-a-published-edge',
      description:
        'The positive that makes the refusal above meaningful. Same attestation, same requester, ' +
        'same edge — one publish record is the entire difference.',
      rule: 'M-4a',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [publishedToOrg],
        attestations: [attestedIntoOrg],
      },
    },
    {
      name: 'the-scope-key-itself-is-served',
      description:
        'A scope is identified by its controlling key (§5.1), so the holder of that key is a ' +
        'member of it by identity and needs no attestation naming itself.',
      rule: 'M-4a',
      input: { ...base, requester: ORG_ROOT.personaId, publishes: [publishedToOrg] },
    },
    {
      name: 'team-membership-does-not-open-an-org-published-edge',
      description:
        'M-4c: "No inheritance: org-scope membership does not imply team-scope visibility or ' +
        'vice versa." The edge is published into the ORG scope and CAROL is attested into a TEAM ' +
        'scope. Both are real memberships and neither reaches the other. Matching scopes by ' +
        'exact key is what makes this structural rather than a rule someone has to remember.',
      rule: 'M-4c',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [publishedToOrg],
        attestations: [
          makeAttestation({
            org: TEAM_SCOPE,
            subject: CAROL.personaId,
            issuedAt: ISSUED_AT,
            expiresAt: EXPIRES_LATER,
          }),
        ],
      },
    },
    {
      name: 'an-expired-attestation-is-not-membership',
      description:
        'The attestation named the right scope and has run out. Serving on it would make ' +
        '`expires_at` decoration.',
      rule: 'M-4a',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [publishedToOrg],
        attestations: [
          makeAttestation({
            org: ORG_ROOT,
            subject: CAROL.personaId,
            issuedAt: ISSUED_AT,
            expiresAt: EXPIRED_ALREADY,
          }),
        ],
      },
    },
    {
      name: 'a-revoked-member-is-not-served',
      description:
        '§1.3 says edges SIGNED before `revoked_at` remain valid — offboarding does not unwind ' +
        'what a departed member committed to. That is a rule about the validity of their ' +
        'signatures, not about what they may still be shown, and reading it the second way would ' +
        'leave every scope permanently readable by everyone who was ever in it.',
      rule: 'M-4a',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [publishedToOrg],
        attestations: [attestedIntoOrg],
        revocations: [makeRevocation(ORG_ROOT, CAROL.personaId, '2026-07-20T00:00:00Z')],
      },
    },
    {
      name: 'a-revocation-dated-in-the-future-does-not-apply-yet',
      description:
        'Announced offboarding. The comparison is against `now`, so a scheduled revocation is ' +
        'not an immediate one — and a verifier that treated the mere PRESENCE of a revocation as ' +
        'disqualifying would pass the case above for the wrong reason.',
      rule: 'M-4a',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [publishedToOrg],
        attestations: [attestedIntoOrg],
        revocations: [makeRevocation(ORG_ROOT, CAROL.personaId, '2026-09-01T00:00:00Z')],
      },
    },
    {
      name: 'a-publish-signed-by-a-non-party-is-not-a-grant',
      description:
        '§5.2: "Only a party to the edge may publish it." CAROL publishes ALICE and BOB\'s edge ' +
        'into a scope CAROL belongs to, and the record is perfectly well-formed and correctly ' +
        'signed — by the wrong person. Without this check, publishing is an act anyone can ' +
        'perform on anyone else\'s relationship.',
      rule: '§5.2',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [makePublish(edge.edge_id, ORG_ROOT.personaId, CAROL, PUBLISHED_AT)],
        attestations: [attestedIntoOrg],
      },
    },
    {
      name: 'a-publish-for-a-different-edge-is-not-a-grant',
      description:
        'ALICE holds two edges with the same counterparty and has published the OTHER one. The ' +
        'record is entirely valid and CAROL is entirely a member; it just is not about this edge. ' +
        'A node that matched on the scope and forgot to match on the edge would hand over every ' +
        'edge it holds to anyone entitled to one of them — which is the failure mode a real ' +
        'deployment reaches first, since publishing one edge into a team is the normal case.',
      rule: 'M-4a',
      input: {
        ...base,
        requester: CAROL.personaId,
        publishes: [makePublish(otherEdge.edge_id, ORG_ROOT.personaId, ALICE, PUBLISHED_AT)],
        attestations: [attestedIntoOrg],
      },
    },
  ];
}
