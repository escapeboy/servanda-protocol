// Computes the per-level verdict and renders it.
//
// The report is per LEVEL and not per file because §8 defines conformance in levels: a
// claim of "Node-conformant" has to mean the Node cases passed, and has to say which
// cases those were. A pass count over 165 files answers no claim anybody would make.

export function computeLevels(levelsDoc, results, { filtered = false } = {}) {
  const byFamily = new Map();
  for (const r of results) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family).push(r);
  }

  const levelById = new Map(levelsDoc.levels.map((l) => [l.id, l]));
  const requiredFamilies = (level, seen = new Set()) => {
    if (seen.has(level.id)) return [];
    seen.add(level.id);
    const inherited = (level.inherits ?? []).flatMap((id) => requiredFamilies(levelById.get(id), seen));
    return [...inherited, ...level.required];
  };

  return levelsDoc.levels.map((level) => {
    const families = [...new Set(requiredFamilies(level))];
    const cases = families.flatMap((f) => byFamily.get(f) ?? []);
    const failed = cases.filter((c) => !c.pass);
    const advisory = (level.advisory ?? []).flatMap((f) => byFamily.get(f) ?? []);

    let verdict;
    if (filtered) {
      // --only exists for debugging one family. Grading a level from a subset of its
      // families would let anyone mint a green verdict by naming the families they pass,
      // which is worse than no runner at all.
      verdict = 'not-assessable';
    } else if (level.max_verdict === 'not-assessable' || families.length === 0) {
      // Refusing to grade is a result. A level with no vectors behind it must not be able
      // to reach `pass` by the accident of having nothing to fail.
      verdict = 'not-assessable';
    } else if (failed.length > 0) {
      verdict = 'fail';
    } else {
      verdict = level.max_verdict;
    }

    return {
      id: level.id,
      title: level.title,
      quote: level.quote,
      verdict,
      families,
      total: cases.length,
      passed: cases.length - failed.length,
      failed: failed.map((c) => c.id),
      advisory: {
        families: level.advisory ?? [],
        total: advisory.length,
        failed: advisory.filter((c) => !c.pass).map((c) => c.id),
      },
      unreachable: filtered
        ? ['the run was filtered with --only, so no level was graded. Remove --only to get a verdict.']
        : level.unreachable ?? [],
    };
  });
}

const MARK = { pass: 'PASS', fail: 'FAIL', partial: 'PARTIAL', 'not-assessable': 'NOT ASSESSABLE' };

export function render(report, { verbose = false } = {}) {
  const out = [];
  const p = (s = '') => out.push(s);

  p(`Servanda conformance runner`);
  p(`  vectors      ${report.vectors_dir}`);
  p(`  suite        ${report.suite_version}  (${report.protocol_version})`);
  p(`  implementation ${report.implementation} ${report.version}`);
  p(`  command      ${report.command}`);
  p('');
  p(`Cases: ${report.total} run, ${report.passed} passed, ${report.total - report.passed} failed`);
  p('');

  p('LEVEL VERDICTS');
  for (const l of report.levels) {
    const counts = l.total === 0 ? '—' : `${l.passed}/${l.total} cases`;
    p(`  ${l.title.padEnd(18)} ${MARK[l.verdict].padEnd(15)} ${counts}`);
    p(`      §8: ${l.quote}`);
    if (l.verdict === 'not-assessable') {
      for (const u of l.unreachable) p(`      cannot assess: ${u}`);
    } else {
      p(`      required families: ${l.families.join(', ')}`);
      if (l.failed.length) {
        p(`      failed (${l.failed.length}):`);
        for (const id of l.failed) p(`        - ${id}`);
      }
      if (l.advisory.total) {
        const a = l.advisory.failed.length
          ? `${l.advisory.failed.length} of ${l.advisory.total} failed: ${l.advisory.failed.join(', ')}`
          : `${l.advisory.total} passed`;
        p(`      advisory (not required at this level): ${l.advisory.families.join(', ')} — ${a}`);
      }
    }
    if (l.verdict === 'partial') {
      p(`      PARTIAL is the highest verdict this runner can give this level. It is not a`);
      p(`      Client conformance claim; the rules it cannot reach are listed below.`);
    }
    p('');
  }

  const failures = report.results.filter((r) => !r.pass);
  if (failures.length) {
    p('FAILURES');
    for (const f of failures) {
      p(`  ${f.id}`);
      p(`    ${f.file}  op=${f.op}`);
      for (const d of f.details) p(`    ${d}`);
      p('');
    }
  }

  if (verbose || failures.length) {
    const unverified = report.results.filter((r) => r.unverified && r.unverified.length);
    if (unverified.length) {
      p('UNVERIFIED PINS');
      p('  Members a vector pins that the runner does not check, and why. Listed so that a');
      p('  pass is not read as covering them.');
      const grouped = new Map();
      for (const r of unverified) {
        const key = `${r.family}: ${r.unverified.join(', ')}`;
        grouped.set(key, (grouped.get(key) ?? 0) + 1);
      }
      for (const [key, n] of grouped) p(`  - ${key}  (${n} case${n === 1 ? '' : 's'})`);
      p('');
    }
  }

  p('WHAT THIS RUN DOES NOT CLAIM');
  for (const l of report.levels) {
    if (!l.unreachable.length) continue;
    p(`  ${l.title}`);
    for (const u of l.unreachable) p(`    - ${u}`);
  }
  p('');

  if (report.claims.length) {
    p('CLAIMS');
    for (const c of report.claims) {
      p(`  ${c.granted ? 'GRANTED ' : 'REFUSED '} ${c.title} — ${MARK[c.verdict]}`);
    }
    p('');
  }

  if (report.stderr) {
    p('IMPLEMENTATION STDERR (tail)');
    for (const line of report.stderr.split('\n')) p(`  | ${line}`);
    p('');
  }

  return out.join('\n');
}
