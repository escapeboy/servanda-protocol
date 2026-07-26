/**
 * Self-check: the gate that makes the committed vectors trustworthy.
 *
 *   1. Regenerate every vector in memory and diff against the committed tree (drift = fail).
 *   2. Re-verify the crypto in the committed vectors independently of the generator:
 *      canonicalization, commitment hashes, signatures, derivation.
 *   3. Replay every transition vector through the reference verifier and require that each
 *      INVALID case is actually rejected, with the recorded reason.
 *   4. Replay the §6.7 addressing vectors: the hub-signed inbox record must be rejected
 *      (M-17), and the out-of-band bootstrap payload must survive encode → decode with its
 *      signature intact while a tampered copy of it must not.
 *
 * Steps 3 and 4 are the ones that matter most: they are what prove the negative vectors are real.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildAll, VECTORS_ROOT } from './generate.js';
import { canonicalize, type Json } from './jcs.js';
import { digestHex, derivePersona, mnemonicToSeed, toHex, verifyObject, fromHex } from './crypto.js';
import { verifyChain } from './transitions.js';
import {
  decodeOob,
  encodeOob,
  payloadFromOobUrl,
  sameObject,
  verifyInboxRecord,
  type InboxRecord,
} from './addressing.js';
import type { Assertion, Edge } from './protocol.js';

let failures = 0;
let checks = 0;

function check(ok: boolean, label: string, detail?: string): void {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

function readVector(rel: string): any {
  const p = join(VECTORS_ROOT, rel);
  if (!existsSync(p)) throw new Error(`missing committed vector: vectors/${rel}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
console.log('1. Drift check — committed vectors vs regeneration');
// ---------------------------------------------------------------------------
for (const f of buildAll()) {
  const target = join(VECTORS_ROOT, f.path);
  if (!existsSync(target)) {
    check(false, `vectors/${f.path}`, 'file is not committed — run `npm run generate`');
    continue;
  }
  const committed = readFileSync(target, 'utf8');
  check(
    committed === f.content,
    `vectors/${f.path}`,
    committed === f.content ? undefined : 'differs from regeneration — run `npm run generate`',
  );
}

// ---------------------------------------------------------------------------
console.log('2. Canonicalization vectors');
// ---------------------------------------------------------------------------
{
  const v = readVector('canonicalization/jcs.json');
  for (const c of v.cases) {
    const parsed = JSON.parse(c.input) as Json;
    check(canonicalize(parsed) === c.canonical, `jcs/${c.name}: canonical form`);
    check(digestHex(parsed) === c.sha256, `jcs/${c.name}: sha256`);
    // Canonicalizing an already-canonical document must be a no-op (idempotence).
    check(
      canonicalize(JSON.parse(c.canonical) as Json) === c.canonical,
      `jcs/${c.name}: idempotent`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log('3. commitment_hash vectors');
// ---------------------------------------------------------------------------
{
  const v = readVector('hashing/commitment-hash.json');
  const fields: string[] = v.hashed_fields;
  for (const c of v.cases) {
    const preimage: Record<string, Json> = {};
    for (const k of fields) preimage[k] = c.commitment[k];

    check(
      canonicalize(preimage as Json) === c.hash_preimage_canonical,
      `hash/${c.name}: preimage canonical form`,
    );
    check(digestHex(preimage as Json) === c.commitment_hash, `hash/${c.name}: hash value`);

    const equalsBase = c.commitment_hash === v.base_commitment_hash;
    check(
      equalsBase === c.same_hash_as_base,
      `hash/${c.name}: same_hash_as_base=${c.same_hash_as_base}`,
      equalsBase === c.same_hash_as_base ? undefined : `actual equality: ${equalsBase}`,
    );
  }
  // The headline property: evidence must not reach the hash.
  const ev = v.cases.find((c: any) => c.name === 'differs-only-in-evidence-refs');
  check(!!ev, 'hash: evidence_refs pair present');
  check(
    !!ev && ev.commitment_hash === v.base_commitment_hash,
    'hash: differing evidence_refs yields an IDENTICAL commitment_hash',
  );
}

// ---------------------------------------------------------------------------
console.log('4. Signature vectors');
// ---------------------------------------------------------------------------
{
  const v = readVector('signatures/signatures.json');
  for (const c of v.cases) {
    check(
      canonicalize(c.unsigned_object) === c.canonical,
      `sig/${c.name}: canonical form`,
    );
    check(digestHex(c.unsigned_object) === c.sha256_preimage, `sig/${c.name}: preimage digest`);
    check(
      verifyObject(c.signed_object, c.signature, fromHex(c.signer.persona_id)),
      `sig/${c.name}: signature verifies against signer key`,
    );
    // Negative control: a one-nibble mutation must not verify.
    const bad = (c.signature[0] === '0' ? '1' : '0') + c.signature.slice(1);
    check(
      !verifyObject(c.signed_object, bad, fromHex(c.signer.persona_id)),
      `sig/${c.name}: corrupted signature is rejected`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log('5. Derivation vectors');
// ---------------------------------------------------------------------------
{
  const v = readVector('derivation/persona-keys.json');
  const seed = mnemonicToSeed(v.mnemonic, v.passphrase ?? '');
  check(toHex(seed) === v.seed, 'derivation: BIP-39 seed');
  for (const p of v.personas) {
    const d = derivePersona(seed, p.persona_index);
    check(d.path === p.path, `derivation/${p.persona_index}: path`);
    check(toHex(d.privateKey) === p.private_key, `derivation/${p.persona_index}: private key`);
    check(toHex(d.chainCode) === p.chain_code, `derivation/${p.persona_index}: chain code`);
    check(toHex(d.publicKey) === p.public_key, `derivation/${p.persona_index}: public key`);
    check(d.personaId === p.persona_id, `derivation/${p.persona_index}: persona_id`);
  }
  // Unlinkability smoke test: distinct indexes must not collide.
  const ids = new Set(v.personas.map((p: any) => p.persona_id));
  check(ids.size === v.personas.length, 'derivation: persona ids are distinct');
}

// ---------------------------------------------------------------------------
console.log('6. Transition vectors replayed through the reference verifier');
// ---------------------------------------------------------------------------
for (const [rel, kind] of [
  ['transitions/valid.json', 'valid'],
  ['transitions/invalid.json', 'invalid'],
] as const) {
  const v = readVector(rel);
  for (const c of v.cases) {
    const result = verifyChain(c.edge as Edge, c.assertions as Assertion[]);

    check(
      result.finalState === c.expected_final_state,
      `${kind}/${c.name}: final state`,
      result.finalState === c.expected_final_state
        ? undefined
        : `expected ${c.expected_final_state}, got ${result.finalState}`,
    );

    c.expected_outcomes.forEach((want: any, i: number) => {
      const got = result.outcomes[i];
      check(
        got.accepted === want.accepted,
        `${kind}/${c.name}: assertion[${i}] accepted=${want.accepted}`,
      );
      const gotReason = got.accepted ? null : (got.reason ?? null);
      check(
        gotReason === want.rejection_reason,
        `${kind}/${c.name}: assertion[${i}] reason`,
        gotReason === want.rejection_reason
          ? undefined
          : `expected ${want.rejection_reason}, got ${gotReason}`,
      );
    });

    if (kind === 'invalid') {
      // G3: every invalid case must be demonstrably REJECTED, not merely different.
      check(
        result.rejectedCount > 0,
        `invalid/${c.name}: at least one assertion is rejected`,
      );
      check(
        c.expected_outcomes.some((o: any) => !o.accepted),
        `invalid/${c.name}: rejection is recorded in the vector`,
      );
    }
  }
  console.log(`   ${v.cases.length} ${kind} cases replayed`);
}

// ---------------------------------------------------------------------------
console.log('7. Inbox records replayed through the reference verifier (§6.7, M-17)');
// ---------------------------------------------------------------------------
{
  const v = readVector('addressing/inbox-records.json');
  const knownKeys = v.known_keys.map((k: any) => ({ label: k.label, personaId: k.persona_id }));

  for (const c of v.cases) {
    const { sig: _sig, ...unsigned } = c.record;
    check(canonicalize(unsigned as Json) === c.canonical, `inbox/${c.name}: canonical form`);

    const outcome = verifyInboxRecord(c.record as InboxRecord, knownKeys);
    check(
      outcome.accepted === c.expected.accepted,
      `inbox/${c.name}: accepted=${c.expected.accepted}`,
      outcome.accepted === c.expected.accepted ? undefined : `got accepted=${outcome.accepted}`,
    );
    const gotReason = outcome.accepted ? null : (outcome.reason ?? null);
    check(
      gotReason === c.expected.rejection_reason,
      `inbox/${c.name}: rejection reason`,
      gotReason === c.expected.rejection_reason
        ? undefined
        : `expected ${c.expected.rejection_reason}, got ${gotReason}`,
    );
    check(
      (outcome.signerLabel ?? null) === c.expected.actual_signer,
      `inbox/${c.name}: actual signer identified`,
    );

    // A verifier holding no known keys must still reach the same accept/reject decision;
    // known_keys sharpens the reason, it never rescues a bad record.
    const blind = verifyInboxRecord(c.record as InboxRecord, []);
    check(
      blind.accepted === c.expected.accepted,
      `inbox/${c.name}: same decision with no known keys`,
    );
  }

  // M-17 stated as an executable property, not a description.
  const hubSigned = v.cases.find((c: any) => c.name === 'invalid-signed-by-hub');
  check(!!hubSigned, 'inbox: hub-signed negative case present');
  check(
    !!hubSigned && verifyInboxRecord(hubSigned.record as InboxRecord, knownKeys).accepted === false,
    'inbox: M-17 — a record signed by a hub key instead of the persona key is REJECTED',
  );
  check(
    !!hubSigned && hubSigned.record.persona !== hubSigned.signed_by.persona_id,
    'inbox: the hub-signed case really does name a different persona than its signer',
  );
  check(
    typeof v.hub_queue_ttl?.recommended_minimum === 'string' &&
      v.hub_queue_ttl.recommended_minimum_seconds === 2592000,
    'inbox: hub queue TTL boundary constant is recorded (fixture only, no clock test)',
  );
  console.log(`   ${v.cases.length} inbox records replayed`);
}

// ---------------------------------------------------------------------------
console.log('8. Out-of-band bootstrap payload round-trip (§6.7)');
// ---------------------------------------------------------------------------
{
  const v = readVector('addressing/oob-bootstrap.json');
  const original = v.cases.find((c: any) => c.name === 'propose-roundtrip');
  check(!!original, 'oob: round-trip case present');

  for (const c of v.cases) {
    check(canonicalize(c.message as Json) === c.canonical, `oob/${c.name}: canonical form`);

    // encode → URL → decode, recomputed rather than trusted.
    check(encodeOob(c.message as Json) === c.payload_b64url, `oob/${c.name}: base64url payload`);
    const fragment = payloadFromOobUrl(c.url);
    check(fragment === c.payload_b64url, `oob/${c.name}: URL fragment carries the payload`);
    const decoded = decodeOob(fragment!);
    check(sameObject(decoded, c.message as Json), `oob/${c.name}: decode(encode(m)) == m`);

    // The payload is self-contained: verification uses only what the URL carried.
    const verified = verifyObject(
      decoded as Record<string, Json>,
      (decoded as any).sig,
      fromHex(c.sender.persona_id),
    );
    check(
      verified === c.signature_verifies,
      `oob/${c.name}: signature_verifies=${c.signature_verifies}`,
      verified === c.signature_verifies ? undefined : `got ${verified}`,
    );

    check(
      sameObject((decoded as any).payload.edge, (original.message as any).payload.edge) ===
        c.edge_equals_original,
      `oob/${c.name}: edge_equals_original=${c.edge_equals_original}`,
    );
    check(
      sameObject(decoded, original.message as Json) === c.decoded_equals_original,
      `oob/${c.name}: decoded_equals_original=${c.decoded_equals_original}`,
    );
  }

  // The negative control has to be a real one: same signature, different edge.
  const tampered = v.cases.find((c: any) => c.name === 'tampered-payload-does-not-verify');
  check(!!tampered, 'oob: tampered negative case present');
  check(
    !!tampered && tampered.message.sig === original.message.sig,
    'oob: the tampered payload reuses the original signature (otherwise it proves nothing)',
  );
  check(
    !!tampered &&
      !verifyObject(
        tampered.message as Record<string, Json>,
        tampered.message.sig,
        fromHex(tampered.sender.persona_id),
      ),
    'oob: a tampered bootstrap payload is REJECTED by signature verification',
  );
  console.log(`   ${v.cases.length} bootstrap payloads replayed`);
}

// ---------------------------------------------------------------------------
console.log();
if (failures > 0) {
  console.error(`SELFCHECK FAILED — ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`SELFCHECK PASSED — ${checks} checks, 0 failures.`);
