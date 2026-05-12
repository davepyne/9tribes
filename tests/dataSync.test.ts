// Ensures web/src/data/*.json mirrors src/content/base/*.json
// Convention: every JSON in src/content/base/ that also exists in web/src/data/
// must be byte-identical after normalization (whitespace/formatting differences OK).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SRC_DIR = resolve(__dirname, '..', 'src', 'content', 'base');
const WEB_DIR = resolve(__dirname, '..', 'web', 'src', 'data');

function getJsonFiles(dir: string): string[] {
  const { readdirSync } = require('fs');
  return readdirSync(dir)
    .filter((f: string) => f.endsWith('.json'))
    .sort();
}

function normalizeJson(content: string): string {
  return JSON.stringify(JSON.parse(content), null, 2);
}

describe('Web data sync', () => {
  const srcFiles = getJsonFiles(SRC_DIR);
  const webFiles = getJsonFiles(WEB_DIR);

  it('all mirrored JSON files in web/src/data/ exist in src/content/base/', () => {
    const missingInSource = webFiles.filter((f) => !srcFiles.includes(f));
    if (missingInSource.length) {
      fail(`Web data files not in src/content/base/: ${missingInSource.join(', ')}\nThese should either be removed from web/src/data/ or added to src/content/base/`);
    }
  });

  for (const file of webFiles) {
    it(`${file} is in sync with src/content/base/`, () => {
      const srcPath = resolve(SRC_DIR, file);
      const webPath = resolve(WEB_DIR, file);

      const srcContent = readFileSync(srcPath, 'utf-8');
      const webContent = readFileSync(webPath, 'utf-8');

      const normalizedSrc = normalizeJson(srcContent);
      const normalizedWeb = normalizeJson(webContent);

      expect(normalizedWeb).toBe(normalizedSrc);
    });
  }
});
