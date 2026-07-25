#!/usr/bin/env node
/**
 * Relative-link checker for the specification.
 *
 * Verifies that every relative markdown link and every in-document heading anchor resolves.
 * External (http/https/mailto) links are listed but not fetched — CI must not depend on the
 * reachability of third-party hosts.
 *
 * No dependencies: runs on a bare Node.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

/** GitHub-style anchor slug for a heading. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\sÀ-￿-]/g, '')
    .replace(/\s+/g, '-');
}

function headingAnchors(markdown) {
  const anchors = new Set();
  const counts = new Map();
  for (const line of markdown.split('\n')) {
    const m = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (!m) continue;
    const base = slug(m[1].replace(/`/g, ''));
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

/** Strip fenced code blocks so example links inside ``` are not treated as real links. */
function stripCodeFences(md) {
  return md.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
}

const files = walk(ROOT).sort();
const anchorCache = new Map();
const getAnchors = (p) => {
  if (!anchorCache.has(p)) anchorCache.set(p, headingAnchors(readFileSync(p, 'utf8')));
  return anchorCache.get(p);
};

let checked = 0;
let external = 0;
const problems = [];

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const body = stripCodeFences(raw);
  const rel = relative(ROOT, file);

  // [text](target) — skip images, skip reference definitions.
  const linkRe = /(?<!\!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = linkRe.exec(body)) !== null) {
    const target = m[1];

    if (/^(https?:|mailto:|#!)/i.test(target)) {
      external++;
      continue;
    }

    checked++;

    // Pure in-document anchor.
    if (target.startsWith('#')) {
      const anchor = target.slice(1).toLowerCase();
      if (!getAnchors(file).has(anchor)) {
        problems.push(`${rel}: anchor "#${anchor}" not found in this document`);
      }
      continue;
    }

    const [pathPart, anchorPart] = target.split('#');

    // ../../issues/N and similar GitHub-relative URLs cannot be resolved on disk; the
    // repository root is the boundary, so anything escaping it is treated as a GitHub link.
    const abs = resolve(dirname(file), pathPart);
    if (!abs.startsWith(ROOT)) {
      external++;
      checked--;
      continue;
    }

    if (!existsSync(abs)) {
      problems.push(`${rel}: broken link "${target}" → ${relative(ROOT, abs)} does not exist`);
      continue;
    }

    if (anchorPart && abs.endsWith('.md')) {
      if (!getAnchors(abs).has(anchorPart.toLowerCase())) {
        problems.push(`${rel}: "${target}" — anchor "#${anchorPart}" not found in target`);
      }
    }
  }

  // Unconverted Svod wikilinks must never survive the port into this repository.
  const wiki = /\[\[([^\]]+)\]\]/g;
  let w;
  while ((w = wiki.exec(body)) !== null) {
    problems.push(`${rel}: unconverted wikilink [[${w[1]}]] — must be a relative markdown link`);
  }
}

console.log(
  `linkcheck: ${files.length} markdown files, ${checked} relative links checked, ${external} external links skipped.`,
);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('linkcheck: OK — all relative links and anchors resolve.');
