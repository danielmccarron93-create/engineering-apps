/*
 * StructDraw v2 — Phase 0e: real fixture file -> v2 model assertion.
 *
 * Iterates every `.sd2.json` / `.sdproj` in tests/fixtures/v1/ — each was
 * SAVED FROM THE RUNNING APP (`File -> Save Project` writes .sd2.json;
 * `File -> Export Project` writes .sdproj) so the migrator is exercised against
 * real user-authored shapes, not synthetic ones. For each fixture, the test
 * asserts:
 *
 *   1. Schema detection picks the right v1 path ('v1-single' or 'v1-project').
 *   2. The migrator never throws on the file (totality).
 *   3. The migration is DETERMINISTIC (two runs produce structurally identical
 *      models). The v1-bridge depends on this — see Phase 0d's bridge tests.
 *   4. Element count fidelity: one v2 Element per v1 objects3D item plus one
 *      per entities2D item, across the active sheet.
 *   5. Every element has a valid category and a valid geometry kind. The
 *      catalogue layer is loaded by setup.mjs, so material lookups resolve and
 *      `model.materials` is populated for every element with a materialId.
 *   6. The migrated model serialises and deserialises cleanly through
 *      `v2.io.modelToJSON` / `v2.io.modelFromJSON` (round-trip parity).
 *   7. If a matching expected file exists in tests/fixtures/v2-expected/, the
 *      migrated model (after `modelToJSON`) deep-equals that recorded payload.
 *      A missing expected file is OK — the structural checks above still run.
 *      Refresh the expected file with `TEST_REWRITE_EXPECTED=1 npm test` when
 *      a deliberate migration change demands it.
 *
 * window.v2 is populated by tests/v2/setup.mjs; describe/it/expect are globals.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const V1_DIR = resolve(HERE, '../../fixtures/v1');
const V2_EXPECTED_DIR = resolve(HERE, '../../fixtures/v2-expected');

/** Every fixture file in tests/fixtures/v1/ (deterministic name order). */
function listFixtureFiles() {
  if (!existsSync(V1_DIR)) return [];
  return readdirSync(V1_DIR)
    .filter((n) => n.endsWith('.sd2.json') || n.endsWith('.sdproj'))
    .sort();
}

/** Strip the .sd2.json / .sdproj suffix to use as a base name. */
function baseName(filename) {
  return filename.replace(/\.(sd2\.json|sdproj)$/i, '');
}

/** Read + JSON.parse a fixture file. */
function readFixture(filename) {
  return JSON.parse(readFileSync(resolve(V1_DIR, filename), 'utf8'));
}

/** Count v1 items reachable by the migrator for a parsed payload. */
function v1ItemCount(parsed, schema) {
  if (schema === 'v1-single') {
    let n = Array.isArray(parsed.objects3D) ? parsed.objects3D.length : 0;
    const ents = parsed.entities2D || {};
    Object.keys(ents).forEach((k) => {
      if (Array.isArray(ents[k])) n += ents[k].length;
    });
    return n;
  }
  if (schema === 'v1-project') {
    const sheets = (parsed.project && Array.isArray(parsed.project.sheets))
      ? parsed.project.sheets : [];
    let idx = (parsed.project && typeof parsed.project.activeSheetIdx === 'number')
      ? parsed.project.activeSheetIdx : 0;
    if (idx < 0 || idx >= sheets.length) idx = 0;
    const s = sheets[idx] || {};
    let n = Array.isArray(s.objects3D) ? s.objects3D.length : 0;
    const ents = s.entities2D || {};
    Object.keys(ents).forEach((k) => {
      if (Array.isArray(ents[k])) n += ents[k].length;
    });
    return n;
  }
  return 0;
}

const FIXTURES = listFixtureFiles();

describe('Phase 0e — real v1 fixture files migrate cleanly to v2', () => {
  it('at least one fixture is present in tests/fixtures/v1/', () => {
    // Sanity: this test exists to surface "the fixtures folder is empty" loud
    // and clear. Drop a .sd2.json or .sdproj saved from the running app into
    // tests/fixtures/v1/ and the rest of the per-fixture cases run.
    expect(FIXTURES.length).toBeGreaterThan(0);
  });

  FIXTURES.forEach((filename) => {
    describe('fixture: ' + filename, () => {
      let parsed, schema, model;

      beforeAll(() => {
        parsed = readFixture(filename);
        schema = window.v2.io.load.detectSchemaVersion(parsed);
        model  = window.v2.io.load.fromParsed(parsed);
      });

      it('is detected as a v1 schema (single or project)', () => {
        expect(['v1-single', 'v1-project']).toContain(schema);
      });

      it('migrates to a v2 StructuralModel at schemaVersion 2', () => {
        expect(model.schemaVersion).toBe(2);
        expect(model.elements).toBeInstanceOf(Map);
        expect(model.views).toBeInstanceOf(Map);
        expect(model.sheets).toBeInstanceOf(Map);
        expect(model.materials).toBeInstanceOf(Map);
      });

      it('element count matches the v1 source (count fidelity)', () => {
        expect(model.elements.size).toBe(v1ItemCount(parsed, schema));
      });

      it('every element has a valid category and geometry kind', () => {
        const cats = window.v2.model.CATEGORIES;
        const kinds = window.v2.model.GEOMETRY_KINDS;
        model.elements.forEach((el) => {
          expect(cats).toContain(el.category);
          expect(kinds).toContain(el.geometry.kind);
        });
      });

      it('every element with a materialId resolves to a material in the model', () => {
        model.elements.forEach((el) => {
          if (typeof el.materialId === 'string' && el.materialId.length) {
            expect(model.materials.has(el.materialId)).toBe(true);
          }
        });
      });

      it('migration is deterministic (two runs produce identical models)', () => {
        const a = window.v2.io.load.fromParsed(parsed);
        const b = window.v2.io.load.fromParsed(parsed);
        expect(a).toEqual(b);
      });

      it('round-trips through modelToJSON -> modelFromJSON without loss', () => {
        const json = window.v2.io.modelToJSON(model);
        const reb  = window.v2.io.modelFromJSON(json);
        expect(reb.elements.size).toBe(model.elements.size);
        expect(reb.materials.size).toBe(model.materials.size);
        expect(reb.views.size).toBe(model.views.size);
        expect(reb.sheets.size).toBe(model.sheets.size);
        // Per-element identity survives the round-trip.
        model.elements.forEach((el, id) => {
          const rebEl = reb.elements.get(id);
          expect(rebEl).toBeTruthy();
          expect(rebEl.category).toBe(el.category);
          expect(rebEl.family).toBe(el.family);
          expect(rebEl.type).toBe(el.type);
          expect(rebEl.geometry.kind).toBe(el.geometry.kind);
        });
      });

      it('matches the recorded expected v2 model (or records one if missing)', () => {
        const expectedPath = resolve(V2_EXPECTED_DIR, baseName(filename) + '.json');
        const actualJSON = window.v2.io.modelToJSON(model);

        if (process.env.TEST_REWRITE_EXPECTED === '1') {
          if (!existsSync(V2_EXPECTED_DIR)) mkdirSync(V2_EXPECTED_DIR, { recursive: true });
          writeFileSync(expectedPath, JSON.stringify(actualJSON, null, 2) + '\n', 'utf8');
        }

        if (!existsSync(expectedPath)) {
          // Auto-record on first run — no human writes these by hand. A
          // committed expected file is what subsequent runs check against.
          if (!existsSync(V2_EXPECTED_DIR)) mkdirSync(V2_EXPECTED_DIR, { recursive: true });
          writeFileSync(expectedPath, JSON.stringify(actualJSON, null, 2) + '\n', 'utf8');
          // The first run records — no assertion, just a notice.
          console.log('[fixture] recorded expected v2 model -> ' + expectedPath);
          return;
        }

        const expectedJSON = JSON.parse(readFileSync(expectedPath, 'utf8'));
        // The structural comparison the Phase 0e exit criterion calls for.
        expect(actualJSON).toEqual(expectedJSON);
      });
    });
  });
});
