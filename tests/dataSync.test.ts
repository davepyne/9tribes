// Guard: web/src/data/ must not contain JSON content files.
// Game content lives in src/content/base/. The frontend should import those
// files directly (e.g. `import data from '../../../src/content/base/foo.json'`)
// rather than maintain a parallel copy under web/src/data/, which has
// historically drifted and caused subtle frontend/backend mismatches.
//
// web/src/data/*.ts modules (display-only overrides like domainMeta.ts)
// remain allowed.

import { readdirSync } from 'fs';
import { resolve } from 'path';

const WEB_DATA_DIR = resolve(__dirname, '..', 'web', 'src', 'data');

describe('Web data duplication guard', () => {
  it('web/src/data/ contains no .json files', () => {
    const jsonFiles = readdirSync(WEB_DATA_DIR).filter((f) => f.endsWith('.json'));
    if (jsonFiles.length > 0) {
      fail(
        `Found JSON files under web/src/data/: ${jsonFiles.join(', ')}\n` +
          `Game content must live in src/content/base/ and be imported directly by the frontend.\n` +
          `See CLAUDE.md and the data-duplication refactor (commits d3dd895..c54f053).`,
      );
    }
  });
});
