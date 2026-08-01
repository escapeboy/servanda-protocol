/**
 * JSON Schema validation of every committed vector file.
 * Run in CI so a hand-edited or malformed vector cannot land.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AjvModule from 'ajv/dist/2020.js';

import { VECTORS_ROOT } from './generate.js';

// ajv ships CommonJS; under NodeNext the constructor arrives under .default at runtime
// while the types expose the namespace. Normalize both shapes.
const Ajv2020 = ((AjvModule as unknown as { default?: unknown }).default ??
  AjvModule) as unknown as new (opts?: Record<string, unknown>) => {
  addSchema(s: unknown): void;
  compile(s: unknown): ((d: unknown) => boolean) & {
    errors?: { instancePath: string; message?: string }[] | null;
  };
};

const SCHEMA_DIR = join(VECTORS_ROOT, 'schema');

const MAPPING: { vector: string; schema: string }[] = [
  { vector: 'canonicalization/jcs.json', schema: 'canonicalization.schema.json' },
  { vector: 'hashing/commitment-hash.json', schema: 'hashing.schema.json' },
  { vector: 'signatures/signatures.json', schema: 'signatures.schema.json' },
  { vector: 'derivation/persona-keys.json', schema: 'derivation.schema.json' },
  { vector: 'transitions/valid.json', schema: 'transitions.schema.json' },
  { vector: 'transitions/invalid.json', schema: 'transitions.schema.json' },
  { vector: 'addressing/inbox-records.json', schema: 'addressing-inbox.schema.json' },
  { vector: 'addressing/oob-bootstrap.json', schema: 'addressing-oob.schema.json' },
  { vector: 'node-surface/actions.json', schema: 'node-surface-actions.schema.json' },
  { vector: 'node-surface/act-tool.json', schema: 'node-surface-act.schema.json' },
  { vector: 'node-surface/brief-slots.json', schema: 'node-surface-brief.schema.json' },
  {
    vector: 'node-surface/verification-levels.json',
    schema: 'verification-levels.schema.json',
  },
];

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(readJson(join(SCHEMA_DIR, 'common.schema.json')));

let failures = 0;

// transitions.schema.json covers two vector files; compile each schema at most once,
// otherwise ajv rejects the duplicate $id.
const compiled = new Map<string, ReturnType<typeof ajv.compile>>();
const compileOnce = (schema: string) => {
  let v = compiled.get(schema);
  if (!v) {
    v = ajv.compile(readJson(join(SCHEMA_DIR, schema)));
    compiled.set(schema, v);
  }
  return v;
};

for (const { vector, schema } of MAPPING) {
  const validate = compileOnce(schema);
  const data = readJson(join(VECTORS_ROOT, vector));

  if (validate(data)) {
    const count = Array.isArray((data as any).cases)
      ? (data as any).cases.length
      : ((data as any).personas?.length ?? 0);
    console.log(`  ok    vectors/${vector}  (${count} entries, schema: ${schema})`);
  } else {
    failures++;
    console.error(`  FAIL  vectors/${vector}`);
    for (const err of validate.errors ?? []) {
      console.error(`        ${err.instancePath || '/'} ${err.message}`);
    }
  }
}

if (failures > 0) {
  console.error(`\nSCHEMA VALIDATION FAILED — ${failures} file(s) invalid.`);
  process.exit(1);
}
console.log(`\nSCHEMA VALIDATION PASSED — ${MAPPING.length} files valid.`);
