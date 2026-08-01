/**
 * §6.6 edge recovery — proof of possession (v0.2, [#37](../../../issues/37)).
 *
 * v0.1 accepted a bare `Rotation` statement as the whole proof of a recovery request. Rotations
 * are PUBLISHED. A responder verified a genuine signature — by the OLD key, over a public
 * artifact — and returned every edge and every assertion chain for both keys. Anyone who merely
 * *observed* a rotation could replay it and harvest the relationship history of two identities
 * without ever holding either key.
 *
 * The signature was never forged. It attested to the wrong proposition: "this key succeeded that
 * one", when what a responder needs is "I am the one asking". v0.2 requires a challenge signed by
 * the key the request claims; the rotation, when present, only says which key succeeds which.
 */

import { signObject, verifyObject } from './crypto.js';
import type { Json } from './jcs.js';
import { ALICE, BOB, CAROL, PROTOCOL_VERSION } from './protocol.js';
import type { Persona } from './crypto.js';

export type RecoveryRejectionReason =
  /** No `sig` over a `challenge` at all — a rotation statement alone is not possession. */
  | 'no-proof-of-possession'
  /** The challenge signature does not verify under the persona the request names. */
  | 'challenge-signature-does-not-verify'
  /** The signature verifies, under a key that is not the one being recovered. */
  | 'signed-by-another-key'
  /** A rotation is present and does not name this persona as its successor. */
  | 'rotation-does-not-name-this-persona';

export interface Rotation {
  v: string;
  type: 'rotation';
  old: string;
  new: string;
  rotated_at: string;
  sig?: string;
}

export interface RecoverRequest {
  v: string;
  type: 'recover_request';
  persona: string;
  proof: {
    challenge: string;
    sig?: string;
    rotation?: Rotation;
  };
}

export interface RecoveryOutcome {
  accepted: boolean;
  reason?: RecoveryRejectionReason;
}

export function makeRotation(from: Persona, to: Persona, rotatedAt: string): Rotation {
  const unsigned: Rotation = {
    v: PROTOCOL_VERSION,
    type: 'rotation',
    old: from.personaId,
    new: to.personaId,
    rotated_at: rotatedAt,
  };
  return { ...unsigned, sig: signObject(unsigned as unknown as Record<string, Json>, from.privateKey) };
}

export function makeRequest(opts: {
  persona: Persona;
  challenge: string;
  /** Who actually signs the challenge. Defaults to `persona` — the honest case. */
  signer?: Persona;
  rotation?: Rotation;
  /** Omit the signature entirely, which is exactly what v0.1 permitted. */
  omitSig?: boolean;
}): RecoverRequest {
  const proof: RecoverRequest['proof'] = { challenge: opts.challenge };
  if (!opts.omitSig) {
    const signer = opts.signer ?? opts.persona;
    proof.sig = signObject(
      { v: PROTOCOL_VERSION, type: 'recovery_challenge', challenge: opts.challenge } as unknown as Record<string, Json>,
      signer.privateKey,
    );
  }
  if (opts.rotation) proof.rotation = opts.rotation;
  return { v: PROTOCOL_VERSION, type: 'recover_request', persona: opts.persona.personaId, proof };
}

/**
 * What a responder MUST do before returning anything.
 *
 * Order matters: possession is checked before the rotation is even read, so a request carrying a
 * beautifully valid rotation and no challenge signature is refused for the reason that is true.
 */
export function evaluateRequest(request: RecoverRequest): RecoveryOutcome {
  const { challenge, sig, rotation } = request.proof;
  if (sig === undefined) return { accepted: false, reason: 'no-proof-of-possession' };

  const preimage = { v: PROTOCOL_VERSION, type: 'recovery_challenge', challenge } as unknown as Record<string, Json>;
  const byPersona = [ALICE, BOB, CAROL].find((p) => p.personaId === request.persona);
  if (!byPersona || !verifyObject(preimage, sig, byPersona.publicKey)) {
    // Distinguish "this is not a signature over this challenge" from "it is, by someone else":
    // an operator reading a refusal log needs to tell a corrupt request from a replayed one.
    for (const other of [ALICE, BOB, CAROL]) {
      if (other.personaId !== request.persona && verifyObject(preimage, sig, other.publicKey)) {
        return { accepted: false, reason: 'signed-by-another-key' };
      }
    }
    return { accepted: false, reason: 'challenge-signature-does-not-verify' };
  }

  if (rotation && rotation.new !== request.persona) {
    return { accepted: false, reason: 'rotation-does-not-name-this-persona' };
  }
  return { accepted: true };
}

export interface RecoveryCase {
  name: string;
  description: string;
  request: RecoverRequest;
  expected: RecoveryOutcome;
}

const CHALLENGE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const ROTATED_AT = '2026-07-25T09:00:00Z';

export function buildRecoveryCases(): RecoveryCase[] {
  const rotation = makeRotation(ALICE, BOB, ROTATED_AT);

  const cases: Omit<RecoveryCase, 'expected'>[] = [
    {
      name: 'challenge-signed-by-the-persona',
      description: 'The honest case: the requester holds the key it names and proves it.',
      request: makeRequest({ persona: ALICE, challenge: CHALLENGE }),
    },
    {
      name: 'rotation-plus-challenge-by-the-new-key',
      description:
        'Recovery under a rotated key. The rotation says which key succeeds which; the challenge ' +
        'says who is asking. Both, not either.',
      request: makeRequest({ persona: BOB, challenge: CHALLENGE, rotation }),
    },
    {
      name: 'bare-rotation-is-not-a-proof',
      description:
        'THE v0.1 HOLE. A published rotation, replayed by an observer who holds neither key. The ' +
        'rotation signature is genuine and verifies; it attests that one key succeeded another, ' +
        'not that the sender is either of them. A responder that answered this returned the ' +
        'edges and chains of both identities to a passer-by.',
      request: makeRequest({ persona: BOB, challenge: CHALLENGE, rotation, omitSig: true }),
    },
    {
      name: 'challenge-signed-by-the-old-key',
      description:
        'The subtler replay: an attacker who captured the OLD key’s material signs as the ' +
        'predecessor. Succession is not possession of the successor.',
      request: makeRequest({ persona: BOB, challenge: CHALLENGE, signer: ALICE, rotation }),
    },
    {
      name: 'challenge-signed-by-a-stranger',
      description: 'A third party’s signature over the right challenge. Verifies, under the wrong key.',
      request: makeRequest({ persona: ALICE, challenge: CHALLENGE, signer: CAROL }),
    },
    {
      name: 'rotation-names-a-different-successor',
      description:
        'Possession is proven, and the rotation offered as context names somebody else. A ' +
        'responder MUST NOT follow it: the chain it describes does not end at the requester.',
      request: makeRequest({ persona: CAROL, challenge: CHALLENGE, rotation }),
    },
  ];

  return cases.map((c) => ({ ...c, expected: evaluateRequest(c.request) }));
}

export function buildRecovery() {
  const cases = buildRecoveryCases();
  if (!cases.some((c) => c.expected.accepted)) throw new Error('recovery vectors: no positive case');
  if (!cases.some((c) => !c.expected.accepted)) throw new Error('recovery vectors: no negative case');

  const bare = cases.find((c) => c.name === 'bare-rotation-is-not-a-proof');
  if (bare?.expected.reason !== 'no-proof-of-possession') {
    throw new Error('recovery vectors: the v0.1 hole is not being refused for the right reason');
  }

  return {
    description:
      'A §6.6 `recover_request` MUST prove possession of the key it names: `proof.sig` over ' +
      '`proof.challenge`, verified against `persona`. A `rotation` MAY accompany it to show ' +
      'succession, and is never a substitute — rotations are published, so a bare one proves only ' +
      'that the sender can read. Replay each request through your responder and compare the ' +
      'verdict and the reason.',
    challenge_preimage: {
      note:
        'The signed object is `{v, type: "recovery_challenge", challenge}` with `sig` removed, per ' +
        'the §0 signing-preimage rule. Signing preimages are NOT domain-separated.',
      type: 'recovery_challenge',
    },
    cases,
  };
}
