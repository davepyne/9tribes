import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const rootDir = process.cwd();
const builtinModuleSet = new Set(require('node:module').builtinModules);

function createTestHarness() {
  const tests = [];
  const suiteStack = [];

  const registerTest = (name, fn, skipped = false) => {
    tests.push({
      name: [...suiteStack, name].join(' > '),
      fn,
      skipped,
    });
  };

  const describe = (name, fn) => {
    suiteStack.push(name);
    try {
      fn();
    } finally {
      suiteStack.pop();
    }
  };

  const it = (name, fn) => registerTest(name, fn, false);
  it.skip = (name, fn) => registerTest(name, fn, true);

  const toMatcherError = (message) => new Error(message);

  const arrayContaining = (items) => ({
    __matcher: 'arrayContaining',
    items,
  });

  const matchesExpected = (actual, expected) => {
    if (expected?.__matcher === 'arrayContaining') {
      if (!Array.isArray(actual)) {
        return false;
      }
      return expected.items.every((item) => actual.some((entry) => util.isDeepStrictEqual(entry, item)));
    }
    return util.isDeepStrictEqual(actual, expected);
  };

  const buildExpect = (actual, negate = false) => {
    const assertResult = (condition, message) => {
      const pass = negate ? !condition : condition;
      if (!pass) {
        throw toMatcherError(message);
      }
    };

    return {
      get not() {
        return buildExpect(actual, !negate);
      },
      toBe(expected) {
        assertResult(Object.is(actual, expected), `Expected ${util.inspect(actual)} ${negate ? 'not ' : ''}to be ${util.inspect(expected)}`);
      },
      toEqual(expected) {
        assertResult(matchesExpected(actual, expected), `Expected ${util.inspect(actual, { depth: 6 })} ${negate ? 'not ' : ''}to equal ${util.inspect(expected, { depth: 6 })}`);
      },
      toBeTruthy() {
        assertResult(Boolean(actual), `Expected ${util.inspect(actual)} ${negate ? 'not ' : ''}to be truthy`);
      },
      toBeUndefined() {
        assertResult(actual === undefined, `Expected ${util.inspect(actual)} ${negate ? 'not ' : ''}to be undefined`);
      },
      toBeDefined() {
        assertResult(actual !== undefined, `Expected value ${negate ? 'not ' : ''}to be defined`);
      },
      toContain(expected) {
        const condition = typeof actual === 'string'
          ? actual.includes(expected)
          : Array.isArray(actual)
            ? actual.includes(expected)
            : false;
        assertResult(condition, `Expected ${util.inspect(actual)} ${negate ? 'not ' : ''}to contain ${util.inspect(expected)}`);
      },
      toMatch(expected) {
        const regex = expected instanceof RegExp ? expected : new RegExp(expected);
        assertResult(typeof actual === 'string' && regex.test(actual), `Expected ${util.inspect(actual)} ${negate ? 'not ' : ''}to match ${regex}`);
      },
      toBeGreaterThan(expected) {
        assertResult(typeof actual === 'number' && actual > expected, `Expected ${actual} ${negate ? 'not ' : ''}to be greater than ${expected}`);
      },
      toBeGreaterThanOrEqual(expected) {
        assertResult(typeof actual === 'number' && actual >= expected, `Expected ${actual} ${negate ? 'not ' : ''}to be greater than or equal to ${expected}`);
      },
      toBeLessThan(expected) {
        assertResult(typeof actual === 'number' && actual < expected, `Expected ${actual} ${negate ? 'not ' : ''}to be less than ${expected}`);
      },
      toBeCloseTo(expected, precision = 2) {
        const tolerance = 10 ** (-precision) / 2;
        assertResult(typeof actual === 'number' && Math.abs(actual - expected) < tolerance, `Expected ${actual} ${negate ? 'not ' : ''}to be close to ${expected} with precision ${precision}`);
      },
      toHaveBeenCalled() {
        const calls = actual?.mock?.calls;
        assertResult(Array.isArray(calls) && calls.length > 0, `Expected spy ${negate ? 'not ' : ''}to have been called`);
      },
    };
  };

  const vi = {
    spyOn(target, key) {
      const original = target[key];
      if (typeof original !== 'function') {
        throw new Error(`Cannot spy on ${String(key)}`);
      }
      const calls = [];
      const spy = function (...args) {
        calls.push(args);
        return original.apply(this, args);
      };
      spy.mock = { calls };
      spy.mockRestore = () => {
        target[key] = original;
      };
      target[key] = spy;
      return spy;
    },
  };

  const vitestModule = {
    describe,
    expect: Object.assign((actual) => buildExpect(actual), { arrayContaining }),
    it,
    test: it,
    vi,
  };

  return {
    tests,
    vitestModule,
  };
}

function createTranspilingLoader(harness) {
  const moduleCache = new Map();

  const resolveProjectPath = (parentFile, specifier) => {
    if (specifier.startsWith('node:') || builtinModuleSet.has(specifier)) {
      return { kind: 'builtin', id: specifier };
    }
    if (specifier === 'vitest') {
      return { kind: 'vitest', id: specifier };
    }
    if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) {
      return { kind: 'external', id: specifier };
    }

    const basePath = path.isAbsolute(specifier)
      ? specifier
      : path.resolve(path.dirname(parentFile), specifier);
    const candidates = [];
    const ext = path.extname(basePath);
    if (ext) {
      candidates.push(basePath);
      if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
        candidates.push(basePath.slice(0, -ext.length) + '.ts');
        candidates.push(basePath.slice(0, -ext.length) + '.tsx');
        candidates.push(basePath.slice(0, -ext.length) + '.mts');
        candidates.push(basePath.slice(0, -ext.length) + '.cts');
      }
    } else {
      candidates.push(basePath);
      candidates.push(`${basePath}.ts`);
      candidates.push(`${basePath}.tsx`);
      candidates.push(`${basePath}.mts`);
      candidates.push(`${basePath}.cts`);
      candidates.push(`${basePath}.js`);
      candidates.push(`${basePath}.mjs`);
      candidates.push(`${basePath}.cjs`);
      candidates.push(`${basePath}.json`);
      candidates.push(path.join(basePath, 'index.ts'));
      candidates.push(path.join(basePath, 'index.js'));
      candidates.push(path.join(basePath, 'index.json'));
    }

    const match = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!match) {
      throw new Error(`Cannot resolve ${specifier} from ${parentFile}`);
    }
    return { kind: 'file', id: match };
  };

  const executeFile = (filePath) => {
    const normalized = path.resolve(filePath);
    if (moduleCache.has(normalized)) {
      return moduleCache.get(normalized).exports;
    }

    if (normalized.endsWith('.json')) {
      const jsonModule = { exports: JSON.parse(fs.readFileSync(normalized, 'utf8')) };
      moduleCache.set(normalized, jsonModule);
      return jsonModule.exports;
    }

    const source = fs.readFileSync(normalized, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowSyntheticDefaultImports: true,
      },
      fileName: normalized,
      reportDiagnostics: false,
    });

    const module = { exports: {} };
    moduleCache.set(normalized, module);

    const localRequire = (specifier) => {
      const resolved = resolveProjectPath(normalized, specifier);
      if (resolved.kind === 'builtin' || resolved.kind === 'external') {
        return require(resolved.id);
      }
      if (resolved.kind === 'vitest') {
        return harness.vitestModule;
      }
      return executeFile(resolved.id);
    };

    localRequire.resolve = (specifier) => {
      const resolved = resolveProjectPath(normalized, specifier);
      return resolved.id;
    };

    const wrapper = `(function (exports, require, module, __filename, __dirname) { ${transpiled.outputText}\n})`;
    const compiled = vm.runInThisContext(wrapper, { filename: normalized });
    compiled(module.exports, localRequire, module, normalized, path.dirname(normalized));
    return module.exports;
  };

  return {
    executeFile,
  };
}

async function runSuite(testFile) {
  const harness = createTestHarness();
  const loader = createTranspilingLoader(harness);
  loader.executeFile(path.resolve(rootDir, testFile));

  let passed = 0;
  let skipped = 0;
  let failed = 0;

  for (const test of harness.tests) {
    if (test.skipped) {
      skipped += 1;
      console.log(`SKIP ${test.name}`);
      continue;
    }
    try {
      await test.fn();
      passed += 1;
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`);
      console.error(error?.stack ?? String(error));
    }
  }

  console.log(`RESULT ${testFile} passed=${passed} skipped=${skipped} failed=${failed}`);
  return failed === 0;
}

const suites = process.argv.slice(2);
if (suites.length === 0) {
  console.error('No test files provided.');
  process.exit(1);
}

let allPassed = true;
for (const suite of suites) {
  const passed = await runSuite(suite);
  if (!passed) {
    allPassed = false;
  }
}

process.exit(allPassed ? 0 : 1);
