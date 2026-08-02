#!/usr/bin/env node
// A real, if very partial, implementation under test: it canonicalizes for actual, and
// declines everything else.
//
// It exists to demonstrate two things at once. The canonicalization family passes on
// merit — nothing here reads vectors/ — which shows the runner can report a pass. Every
// other family fails as `declined`, which shows that declining a family is a failure with
// a name and not a silence. A partial implementation that ran green would be the worst
// possible outcome for a suite that answers conformance claims.

import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

// RFC 8785 on already-parsed JSON reduces to three rules, and V8 satisfies two of them
// for free: JSON.stringify escapes exactly the characters JCS escapes (quote, reverse
// solidus, and C0 with the short forms), and serializes numbers with the ECMAScript
// Number-to-String algorithm that §3.2.2.3 requires. The third rule — members sorted by
// UTF-16 code unit — is what this function adds; Array#sort's default comparator is
// already a UTF-16 code unit ordering.
function jcs(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(',')}}`;
}

const OPS = ['canonicalize'];

function dispatch(op, input) {
  if (op === 'canonicalize') {
    const canonical = jcs(JSON.parse(input.json_text));
    return { canonical, sha256: createHash('sha256').update(canonical, 'utf8').digest('hex') };
  }
  throw new Error(`unimplemented op: ${op}`);
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const { id, op, input } = JSON.parse(line);
  let response;
  if (op === 'hello') {
    response = { id, ok: true, result: { implementation: 'jcs-only-stub', version: '0.0.1', protocol: 1, ops: OPS } };
  } else {
    try {
      response = { id, ok: true, result: dispatch(op, input) };
    } catch (err) {
      response = { id, ok: false, error: { code: 'unimplemented', message: String(err.message) } };
    }
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
