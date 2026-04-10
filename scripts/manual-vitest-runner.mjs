import { pathToFileURL } from 'node:url';
import { __getRegisteredTests, __resetRegisteredTests } from 'vitest';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('No test files provided');
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  __resetRegisteredTests();
  await import(pathToFileURL(file).href);
  const tests = __getRegisteredTests();
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`);
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    }
  }
}

if (failed > 0) {
  process.exit(1);
}
