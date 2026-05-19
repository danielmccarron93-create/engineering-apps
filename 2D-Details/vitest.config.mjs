/*
 * Vitest configuration — StructDraw architecture-v2 test suite.
 *
 * Dev-time ONLY. The StructDraw app has no build step (CLAUDE.md workflow
 * rule 3): index.html loads classic <script> files straight from disk. Vitest
 * and JSDOM are test tooling — they never touch the shipped app, and
 * bin/release.sh does not mirror this file, package.json or node_modules/.
 *
 * The v2 source files under js/v2/ are classic scripts (no import/export);
 * tests/v2/setup.mjs loads them into the JSDOM window so the test files can
 * exercise window.v2.* exactly as a browser would.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/v2/**/*.test.js'],
    setupFiles: ['tests/v2/setup.mjs'],
  },
});
