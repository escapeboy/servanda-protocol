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
 *   5. Replay the §7 node-surface vectors: an act the transition table does not authorize
 *      must not be advertised (M-20), an `act` call it does not authorize must be refused,
 *      and no display name may escape below verification level 2 (M-12).
 *
 * Steps 3 to 5 are the ones that matter most: they are what prove the negative vectors are real.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildAll, VECTORS_ROOT } from './generate.js';
import { canonicalize, type Json } from './jcs.js';
import {
  digestHex,
  derivePersona,
  mnemonicToSeed,
  sha256Hex,
  toHex,
  verifyObject,
  fromHex,
} from './crypto.js';
import { verifyChain } from './transitions.js';
import { DOMAIN_TAG, domainSeparated, edgeId } from './protocol.js';
import {
  ACT_TOOL,
  ACT_VOCABULARY,
  LEVEL_ORDER,
  actionsFor,
  evaluateAct,
  grade,
  type Act,
} from './node-surface.js';
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
  const tag: string = v.domain_tag.tag;
  check(tag === DOMAIN_TAG.commitment_hash, 'hash: domain tag string is the one §0 fixes');
  check(v.domain_tag.separator === '0x00', 'hash: domain tag separator is a single 0x00 octet');

  for (const c of v.cases) {
    const preimage: Record<string, Json> = {};
    for (const k of fields) preimage[k] = c.commitment[k];

    check(
      canonicalize(preimage as Json) === c.hash_preimage_canonical,
      `hash/${c.name}: preimage canonical form`,
    );

    // Rebuilt from the tag and the canonical form, not copied from the generator.
    const tagged = domainSeparated(tag, new TextEncoder().encode(c.hash_preimage_canonical));
    check(toHex(tagged) === c.hash_preimage_hex, `hash/${c.name}: domain-tagged preimage octets`);
    check(sha256Hex(tagged) === c.commitment_hash, `hash/${c.name}: hash value`);

    // The tag has to be load-bearing: the untagged digest MUST NOT be the recorded one.
    check(
      digestHex(preimage as Json) !== c.commitment_hash,
      `hash/${c.name}: untagged digest differs (domain separation is real)`,
    );

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
    // §4.1 as resolved: the edge_id is recomputed from the four values, domain-tagged.
    const e = c.edge as Edge;
    check(
      edgeId(e.commitment_hash, e.owner, e.owed_to, e.proposed_at) === e.edge_id,
      `${kind}/${c.name}: edge_id recomputes from its domain-tagged preimage`,
    );
    check(
      sha256Hex(
        new TextEncoder().encode(
          e.commitment_hash + e.owner + e.owed_to + e.proposed_at,
        ),
      ) !== e.edge_id,
      `${kind}/${c.name}: the untagged concatenation does NOT produce this edge_id`,
    );

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
console.log('9. Node-surface vectors replayed (§7; M-20, M-14)');
// ---------------------------------------------------------------------------
{
  const v = readVector('node-surface/actions.json');
  for (const c of v.cases) {
    // The effective state is re-derived, never trusted from the file.
    const chain = verifyChain(c.edge as Edge, c.assertions as Assertion[]);
    check(
      chain.finalState === c.effective_state,
      `actions/${c.name}: effective state re-derives from the chain`,
      chain.finalState === c.effective_state
        ? undefined
        : `expected ${c.effective_state}, got ${chain.finalState}`,
    );

    const got = actionsFor(
      c.edge as Edge,
      chain.finalState,
      c.viewer.persona_id,
      c.window_elapsed,
    );
    check(
      JSON.stringify(got) === JSON.stringify(c.expected_actions),
      `actions/${c.name}: advertised actions`,
      `expected ${JSON.stringify(c.expected_actions)}, got ${JSON.stringify(got)}`,
    );

    // M-20 stated as a property: nothing in must_not_advertise may appear, and every act
    // that IS advertised must carry the binding §7 fixes for it.
    for (const forbidden of c.must_not_advertise) {
      check(
        !got.some((a) => a.act === forbidden),
        `actions/${c.name}: "${forbidden}" is NOT advertised (M-20)`,
      );
    }
    for (const a of got) {
      check(
        a.tool === ACT_TOOL[a.act as Act],
        `actions/${c.name}: "${a.act}" binds to the tool §7 names`,
      );
      check(
        a.tool !== null || Object.keys(a.args).length === 0,
        `actions/${c.name}: unbound act "${a.act}" carries no args`,
      );
    }
    check(
      got.length + c.must_not_advertise.length === ACT_VOCABULARY.length,
      `actions/${c.name}: advertised + must_not_advertise covers the whole vocabulary`,
    );
  }

  // The two cases that differ only by the window flag must differ in their arrays — otherwise
  // the time-sensitive half of M-20 is not being tested at all.
  const before = v.cases.find((c: any) => c.name === 'pending-acceptance-owner-window-not-elapsed');
  const after = v.cases.find((c: any) => c.name === 'pending-acceptance-owner-window-elapsed');
  check(!!before && !!after, 'actions: the window-elapsed pair is present');
  check(
    !!before && !before.expected_actions.some((a: any) => a.act === 'done'),
    'actions: `done` is NOT advertised before the acceptance window elapses',
  );
  check(
    !!after && after.expected_actions.some((a: any) => a.act === 'done'),
    'actions: `done` IS advertised once the window has elapsed',
  );
  console.log(`   ${v.cases.length} action cases replayed`);
}

{
  // §7 brief slots — M-21's node half. The check is a REFERENCE JUDGE, not a re-read of the
  // file's own verdict: each slot is judged from the rule, and the judgement compared to what the
  // case claims. Reading `expected.valid` and agreeing with it would prove only that JSON parses.
  const v = readVector('node-surface/brief-slots.json');
  const ALLOWED = new Set(v.slot_members as string[]);
  const VOCAB = new Set(v.act_vocabulary as string[]);
  // The table is a LIST of {act, tool}, not a map — read it as it is emitted rather than as it
  // would be convenient, or the judge silently decides every act is unbound.
  const BINDINGS = new Map(
    (v.act_tool_bindings as { act: string; tool: string | null }[]).map((b) => [b.act, b.tool]),
  );

  const judge = (slot: Record<string, any>): string | null => {
    for (const key of Object.keys(slot)) if (!ALLOWED.has(key)) return 'copy-bearing-member';
    const pa = slot.primary_action;
    if (pa === null || pa === undefined) return null;
    for (const key of Object.keys(pa)) {
      if (!['act', 'tool', 'args'].includes(key)) return 'copy-bearing-member';
    }
    if (!VOCAB.has(pa.act)) return 'act-not-in-vocabulary';
    if (pa.tool !== BINDINGS.get(pa.act)) return 'tool-not-bound-to-act';
    if (pa.tool === null && Object.keys(pa.args ?? {}).length > 0) return 'args-must-be-empty';
    return null;
  };

  for (const c of v.cases) {
    const reason = judge(c.slot as Record<string, any>);
    check(
      (reason === null) === c.expected.valid,
      `brief/${c.name}: validity re-derives from the rule`,
      (reason === null) === c.expected.valid ? undefined : `judged ${reason}, case says valid=${c.expected.valid}`,
    );
    check(
      reason === c.expected.rejection_reason,
      `brief/${c.name}: the reason re-derives too`,
      reason === c.expected.rejection_reason ? undefined : `judged ${reason}, expected ${c.expected.rejection_reason}`,
    );
  }
  check(
    v.cases.some((c: any) => c.expected.rejection_reason === 'copy-bearing-member'),
    'brief: a case pins the copy-bearing member #20 reported',
  );
  console.log(`   ${v.cases.length} brief-slot cases replayed`);
}

{
  const v = readVector('node-surface/act-tool.json');
  for (const c of v.cases) {
    const chain = verifyChain(c.edge as Edge, c.assertions as Assertion[]);
    check(
      chain.finalState === c.effective_state,
      `act/${c.name}: effective state re-derives from the chain`,
    );

    const outcome = evaluateAct(
      c.edge as Edge,
      chain.finalState,
      c.call.caller.persona_id,
      c.call.input.act as Act,
      c.call.input.evidence_hash,
      c.window_elapsed,
    );
    check(outcome.accepted === c.expected.accepted, `act/${c.name}: accepted=${c.expected.accepted}`);
    const reason = outcome.accepted ? null : (outcome.reason ?? null);
    check(
      reason === c.expected.rejection_reason,
      `act/${c.name}: rejection reason`,
      reason === c.expected.rejection_reason
        ? undefined
        : `expected ${c.expected.rejection_reason}, got ${reason}`,
    );
    check(
      (outcome.asserts ?? null) === c.expected.asserts,
      `act/${c.name}: the assertion the node would sign`,
    );
  }

  // The two rejections that would each silently break a real guarantee.
  const releaseByOwner = v.cases.find((c: any) => c.name === 'release-by-owner-rejected');
  check(
    !!releaseByOwner && releaseByOwner.expected.accepted === false,
    'act: an owner CANNOT release their own debt (§4.3 "owed_to alone")',
  );
  const unbound = v.cases.filter((c: any) => c.expected.rejection_reason === 'act-not-bound-to-a-tool');
  check(
    unbound.length >= 3,
    'act: every act §7 declares unbound is refused by the `act` tool (M-20)',
  );
  console.log(`   ${v.cases.length} act-tool cases replayed`);
}

{
  const v = readVector('node-surface/verification-levels.json');
  check(
    JSON.stringify(v.level_order) === JSON.stringify(LEVEL_ORDER),
    'levels: the total order is 0 < 1 < ext < 2 < 3',
  );
  for (let i = 1; i < v.level_order.length; i++) {
    check(
      v.level_rank[v.level_order[i - 1]] < v.level_rank[v.level_order[i]],
      `levels: rank(${v.level_order[i - 1]}) < rank(${v.level_order[i]})`,
    );
  }

  for (const c of v.cases) {
    const got = grade(c.evidence);
    check(got.level === c.expected.level, `levels/${c.name}: achieved level`,
      got.level === c.expected.level ? undefined : `expected ${c.expected.level}, got ${got.level}`);
    check(
      got.display_name === c.expected.display_name,
      `levels/${c.name}: display_name`,
      got.display_name === c.expected.display_name
        ? undefined
        : `expected ${JSON.stringify(c.expected.display_name)}, got ${JSON.stringify(got.display_name)}`,
    );
    // M-12 as an executable property, over every case rather than the ones that mean to test it.
    check(
      got.display_name === null || got.level === '2' || got.level === '3',
      `levels/${c.name}: no name escapes below level 2 (M-12)`,
    );
  }

  // The case the ordering decides, and the case a name would leak from.
  const both = v.cases.find((c: any) => c.name === 'level-2-outranks-ext');
  check(!!both && both.expected.level === '2', 'levels: an attestation outranks a binding proof');
  const leak = v.cases.find((c: any) => c.name === 'negative-name-not-shown-at-ext');
  check(
    !!leak && leak.evidence.attestedDisplayName !== null && leak.expected.display_name === null,
    'levels: a name available in the data is NOT emitted at `ext`',
  );
  console.log(`   ${v.cases.length} verification-level cases replayed`);
}

// ---------------------------------------------------------------------------
console.log('10. §2 envelope vectors (M-19, the id preimage)');
// ---------------------------------------------------------------------------
{
  const v = readVector('envelope/envelope-id.json');
  check(v.domain_tag.tag === DOMAIN_TAG.envelope_id, 'envelope: domain tag is the one §0 fixes');
  check(v.domain_tag.separator === '0x00', 'envelope: separator is a single 0x00 octet');

  for (const c of v.cases) {
    // Recomputed from the envelope, never copied from the file.
    check(canonicalize(c.envelope_sans_id as Json) === c.canonical, `envelope/${c.name}: canonical form`);
    const tagged = domainSeparated(v.domain_tag.tag, new TextEncoder().encode(c.canonical));
    check(toHex(tagged) === c.id_preimage_hex, `envelope/${c.name}: domain-tagged preimage octets`);
    check(sha256Hex(tagged) === c.id, `envelope/${c.name}: id value`);

    // The tag has to be load-bearing here too.
    check(
      digestHex(c.envelope_sans_id as Json) !== c.id,
      `envelope/${c.name}: untagged digest differs (domain separation is real)`,
    );

    const equalsBase = c.id === v.base_id;
    check(equalsBase === c.same_id_as_base, `envelope/${c.name}: same_id_as_base=${c.same_id_as_base}`);

    // `clipped` is true or absent. `false` would change the id of every unclipped envelope.
    check(
      !('clipped' in c.envelope_sans_id) || c.envelope_sans_id.clipped === true,
      `envelope/${c.name}: clipped is true or absent, never false`,
    );
  }

  // The headline property of "sans id": stripping a present `id` reproduces the base.
  const { id: _drop, ...stripped } = v.id_removal.envelope_with_id;
  const recomputed = sha256Hex(
    domainSeparated(v.domain_tag.tag, new TextEncoder().encode(canonicalize(stripped as Json))),
  );
  check(recomputed === v.base_id, 'envelope: removing `id` reproduces the base id');
  check(recomputed === v.id_removal.id_after_removal, 'envelope: recorded id_after_removal is right');
  check(
    v.id_removal.envelope_with_id.id !== v.base_id,
    'envelope: the discarded `id` was NOT already the answer (the case proves something)',
  );

  // `persona` and `received_at` reach the digest. §2's determinism sentence names neither, so
  // these two cases are what make the gap checkable rather than a matter of reading.
  for (const name of ['differs-in-persona', 'differs-in-received-at']) {
    const c = v.cases.find((x: any) => x.name === name);
    check(!!c && c.id !== v.base_id, `envelope: ${name} yields a DIFFERENT id`);
  }
  console.log(`   ${v.cases.length} envelope-id cases replayed`);
}

{
  const v = readVector('envelope/bounds.json');
  const B = v.bounds;
  const enc = new TextEncoder();
  const octets = (s: string) => enc.encode(s).length;

  // Every bound in the table must be exercised by at least one case on each side of it, or the
  // family reports coverage it does not have.
  const exercised = new Map<string, Set<boolean>>();
  for (const c of v.cases) {
    if (!exercised.has(c.bound)) exercised.set(c.bound, new Set());
    exercised.get(c.bound)!.add(c.within_bounds);
  }
  for (const bound of Object.keys(B)) {
    if (bound === 'canonicalizer_refusal_depth') continue; // a canonicalizer property, stated not cased
    const sides = exercised.get(bound);
    check(!!sides && sides.has(true) && sides.has(false), `bounds: ${bound} has a case on both sides`);
  }

  for (const c of v.cases) {
    const e = c.envelope_sans_id;
    let measured: number;
    switch (c.bound) {
      case 'refs_entries':
        measured = e.refs.length;
        break;
      case 'ref_value_octets':
        measured = Math.max(...e.refs.map((r: any) => octets(r.value)));
        break;
      case 'actor_label_octets':
        measured = octets(e.actor.label);
        break;
      case 'payload_string_octets':
        measured = Math.max(
          ...Object.values(e.payload).filter((x): x is string => typeof x === 'string').map(octets),
        );
        break;
      case 'payload_depth_below_payload': {
        const depth = (x: unknown): number =>
          x !== null && typeof x === 'object'
            ? 1 + Math.max(0, ...Object.values(x as Record<string, unknown>).map(depth))
            : 0;
        measured = Math.max(0, ...Object.values(e.payload).map(depth));
        break;
      }
      case 'canonical_form_octets':
        measured = octets(canonicalize(e as Json));
        break;
      default:
        throw new Error(`unhandled bound ${c.bound}`);
    }
    // Measured independently of what the generator wrote down.
    check(measured === c.measured, `bounds/${c.name}: measured ${c.bound}`, `recomputed ${measured}`);
    check(
      (measured <= B[c.bound]) === c.within_bounds,
      `bounds/${c.name}: within_bounds=${c.within_bounds}`,
    );
  }

  // The clipping example must actually land on a scalar boundary and must actually be a prefix.
  const ex = v.clipping.scalar_boundary_example;
  check(octets(ex.source) === ex.source_octets, 'bounds: clipping example source length');
  check(octets(ex.clipped) === ex.clipped_to_octets, 'bounds: clipping example clipped length');
  check(ex.source.startsWith(ex.clipped), 'bounds: the clipped value is a prefix of the source');
  check(
    [...ex.clipped].every((ch) => ex.source.includes(ch)),
    'bounds: the clipped value contains no code point absent from the source',
  );
  check(ex.clipped_to_octets <= B.payload_string_octets, 'bounds: clipping lands inside the bound');
  console.log(`   ${v.cases.length} bound cases replayed`);
}

// ---------------------------------------------------------------------------
console.log();
if (failures > 0) {
  console.error(`SELFCHECK FAILED — ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`SELFCHECK PASSED — ${checks} checks, 0 failures.`);
