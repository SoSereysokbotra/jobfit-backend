// Generate docs/JobFits_ER_Diagram.md FROM prisma/schema.prisma.
//
//   npx ts-node scripts/generate-er-diagram.ts
//
// WHY THIS IS A GENERATOR AND NOT A DOCUMENT.
//
// MENTOR_REVIEW_2026-08-18 §17 found the hand-written ER diagram describing a database
// that does not exist. Measured at b3d6b96, it was worse than the finding said: it
// documented **20 tables with no counterpart in the schema** and omitted **26 tables that
// do exist** — 15 of 41 real tables described, and more than half the diagram fictional.
//
// That is not a document that fell a little behind. It is what happens to any artefact
// that restates a source of truth by hand: the schema changes on a Tuesday and nothing
// makes the copy follow. Two downstream repos read this file as the data model, and
// `jobfit-extension/docs/CONTRACTS.md` specified endpoints against `salary_data` and
// `learning_paths` — tables that were never created — so both routes shipped and had to
// silently degrade.
//
// Rewriting it by hand would have fixed today and guaranteed the same drift by Friday.
// The schema is the source of truth; this reads it.
//
// SCOPE OF THE PARSER. Deliberately small: it understands models, fields, enums, @@map
// and @relation, which is all this schema uses. It is not a general Prisma parser and
// should not become one — if the schema grows syntax this cannot read, the right move is
// to fail loudly (see `assertParsed`) rather than to emit a diagram that is quietly
// incomplete, because "quietly incomplete" is the exact failure being fixed.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = join(process.cwd(), 'prisma', 'schema.prisma');
const OUT = join(process.cwd(), 'docs', 'JobFits_ER_Diagram.md');

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  isId: boolean;
  isUnique: boolean;
  /** Present on the OWNING side of a relation: the FK columns it joins on. */
  relationFrom: string[] | null;
}

interface Model {
  name: string;
  table: string;
  fields: Field[];
}

/** Strip comments and blank lines, keeping the structure intact. */
function clean(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('///') || trimmed.startsWith('//')) return '';
      // An inline `// note` after a field, but not inside a string literal.
      const idx = line.indexOf(' //');
      return idx >= 0 && (line.match(/"/g)?.length ?? 0) % 2 === 0
        ? line.slice(0, idx)
        : line;
    })
    .join('\n');
}

function parseModels(source: string): Model[] {
  const models: Model[] = [];
  const blocks = source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);

  for (const [, name, body] of blocks) {
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? name;
    const fields: Field[] = [];

    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('@@') || line.startsWith('}')) continue;

      // `name Type[]? @attrs...`
      const m = /^(\w+)\s+(\w+|Unsupported\([^)]*\))(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!m) continue;

      const [, fieldName, rawType, list, optional, attrs] = m;
      const relation = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(attrs);

      fields.push({
        name: fieldName,
        type: rawType.startsWith('Unsupported') ? 'vector' : rawType,
        optional: !!optional,
        list: !!list,
        isId: attrs.includes('@id'),
        isUnique: /@unique/.test(attrs),
        relationFrom: relation
          ? relation[1].split(',').map((s) => s.trim()).filter(Boolean)
          : null,
      });
    }

    models.push({ name, table, fields });
  }
  return models;
}

function parseEnums(source: string): { name: string; values: string[] }[] {
  return [...source.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
    name,
    values: body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('@') && !l.startsWith('}')),
  }));
}

/**
 * Fail loudly if the parse looks wrong.
 *
 * A generator that emits an empty or half-read diagram would recreate the problem it
 * exists to solve, and would do it while looking freshly generated.
 */
function assertParsed(models: Model[], schema: string): void {
  const declared = (schema.match(/^model\s+\w+/gm) ?? []).length;
  if (models.length !== declared) {
    throw new Error(
      `Parsed ${models.length} models but the schema declares ${declared}. ` +
        `The parser has fallen behind the schema syntax — fix it rather than shipping ` +
        `a diagram that is quietly incomplete.`,
    );
  }
  const empty = models.filter((m) => m.fields.length === 0);
  if (empty.length) {
    throw new Error(`Parsed no fields for: ${empty.map((m) => m.name).join(', ')}`);
  }
}

function mermaid(models: Model[]): string {
  const byName = new Map(models.map((m) => [m.name, m]));
  const lines: string[] = ['erDiagram'];

  for (const model of models) {
    lines.push(`  ${model.table} {`);
    for (const f of model.fields) {
      // Relation object fields are edges, not columns.
      if (byName.has(f.type) && !f.relationFrom) continue;
      if (byName.has(f.type) && f.relationFrom) continue;

      const key = f.isId ? ' PK' : f.isUnique ? ' UK' : '';
      const type = `${f.type}${f.list ? '_list' : ''}${f.optional ? '_null' : ''}`;
      lines.push(`    ${type} ${f.name}${key}`);
    }
    lines.push('  }');
    lines.push('');
  }

  const edges = new Set<string>();
  for (const model of models) {
    for (const f of model.fields) {
      if (!f.relationFrom) continue;
      const target = byName.get(f.type);
      if (!target) continue;

      // The FK column tells us whether the link is optional and whether it is 1:1.
      const fk = model.fields.find((x) => x.name === f.relationFrom![0]);
      const optional = fk?.optional ?? f.optional;
      const oneToOne = fk?.isUnique ?? false;

      const left = optional ? '|o' : '||';
      const right = oneToOne ? '||' : 'o{';
      edges.add(`  ${target.table} ${left}--${right} ${model.table} : "${f.name}"`);
    }
  }

  return [...lines, ...[...edges].sort()].join('\n');
}

function main(): void {
  const raw = readFileSync(SCHEMA, 'utf8');
  const source = clean(raw);
  const models = parseModels(source);
  const enums = parseEnums(source);
  assertParsed(models, source);

  const tables = models.map((m) => m.table).sort();

  const doc = `# JobFits — Entity Relationship Diagram

> ## 🤖 GENERATED FILE — DO NOT EDIT BY HAND
>
> Produced from \`prisma/schema.prisma\` by \`scripts/generate-er-diagram.ts\`.
> Regenerate with:
>
> \`\`\`bash
> npx ts-node scripts/generate-er-diagram.ts
> \`\`\`
>
> **Why it is generated.** The hand-written version of this file documented **20 tables
> that did not exist** and omitted **26 that did** — it described 15 of the 41 real
> tables, and two other repos were reading it as the data model.
> \`jobfit-extension/docs/CONTRACTS.md\` specified endpoints against \`salary_data\` and
> \`learning_paths\`, tables that were never created, so those routes shipped and had to
> silently degrade. See \`MENTOR_REVIEW_2026-08-18\` §17.
>
> A copy of a source of truth, maintained by hand, drifts. This one cannot.

**Tables:** ${tables.length} · **Enums:** ${enums.length}
**Generated:** ${new Date().toISOString().slice(0, 10)} from \`prisma/schema.prisma\`

---

## Diagram

Column types are Prisma types with two suffixes: \`_null\` means nullable, \`_list\` means
an array column. \`PK\` is the primary key, \`UK\` a unique column.

\`\`\`mermaid
${mermaid(models)}
\`\`\`

---

## Tables

${tables.map((t) => `- \`${t}\``).join('\n')}

---

## Enums

${enums.map((e) => `**\`${e.name}\`** — ${e.values.map((v) => `\`${v}\``).join(' · ')}`).join('\n\n')}

---

## Not in the database

These appeared in the previous hand-written diagram and have **never existed** in
\`schema.prisma\`. They are recorded here so a reader who remembers them knows they were
aspirational, not deleted:

\`faqs\` · \`help_center\` · \`interview_questions\` · \`interview_tips\` ·
\`job_form_responses\` · \`job_forms\` · \`job_listings\` · \`knowledge_base\` ·
\`learning_paths\` · \`learning_progress\` · \`media\` · \`notification_preferences\` ·
\`payments\` · \`projects\` · \`referrals\` · \`salary_data\` · \`subscriptions\` ·
\`user_settings\`

Two more were near-misses rather than fiction — the diagram used the singular where the
schema uses the plural: \`education\` (real: \`educations\`) and \`application_timeline\`
(real: \`application_timelines\`).

**\`match_scores\` and \`job_seeker_profiles\` are a different case:** they *did* exist and
were dropped on 2026-08-20 (§15), both empty and unreferenced.

Anything on this list that is genuinely planned belongs in a roadmap document, where a
reader cannot mistake it for something they can query today.
`;

  writeFileSync(OUT, doc, 'utf8');
  console.log(`Wrote ${OUT}`);
  console.log(`  ${tables.length} tables, ${enums.length} enums`);
}

main();
