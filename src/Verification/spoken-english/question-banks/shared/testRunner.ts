/**
 * A deliberately tiny test runner.
 *
 * The repo has no test framework and no test culture, and this suite needs
 * roughly thirty assertions over on-disk CSV fixtures — not watch mode, not
 * mocking, not parallelism. Adding vitest would mean reconciling a second module
 * system against `module: nodenext` for that, so instead this runs under the
 * `ts-node --project tsconfig.dev.json` convention every other script in the repo
 * already uses.
 *
 * The one real risk of a hand-rolled runner is that it silently runs nothing and
 * reports success, which is exactly the class of bug this whole layer exists to
 * prevent. So `run()` treats "zero tests" and "zero assertions" as failures.
 */

interface RegisteredTest {
  name: string;
  fn: () => void;
}

const tests: RegisteredTest[] = [];
let assertionCount = 0;

export function test(name: string, fn: () => void): void {
  tests.push({ name, fn });
}

export class AssertionError extends Error {}

export function assert(condition: boolean, message: string): void {
  assertionCount += 1;
  if (!condition) throw new AssertionError(message);
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  assertionCount += 1;
  if (actual !== expected) {
    throw new AssertionError(`${label}\n      expected: ${String(expected)}\n      actual:   ${String(actual)}`);
  }
}

/** Set equality, order-independent, with a readable diff on failure. */
export function assertSameSet(actual: string[], expected: string[], label: string): void {
  assertionCount += 1;
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  const missing = e.filter(x => !a.includes(x));
  const extra = a.filter(x => !e.includes(x));
  if (missing.length > 0 || extra.length > 0) {
    throw new AssertionError(
      `${label}\n      expected: [${e.join(', ')}]\n      actual:   [${a.join(', ')}]` +
        (missing.length ? `\n      missing:  [${missing.join(', ')}]` : '') +
        (extra.length ? `\n      unexpected: [${extra.join(', ')}]` : ''),
    );
  }
}

/** Runs every registered test. Returns the process exit code. */
export function run(suiteName: string): number {
  console.log(`\n${suiteName}\n${'─'.repeat(suiteName.length)}\n`);

  let passed = 0;
  const failures: Array<{ name: string; error: unknown }> = [];

  for (const t of tests) {
    try {
      t.fn();
      passed += 1;
      console.log(`  ok    ${t.name}`);
    } catch (err) {
      failures.push({ name: t.name, error: err });
      console.log(`  FAIL  ${t.name}`);
    }
  }

  console.log();

  if (failures.length > 0) {
    console.log(`${failures.length} failure(s):\n`);
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      if (f.error instanceof AssertionError) {
        console.log(`      ${f.error.message}`);
      } else {
        console.log(`      threw: ${f.error instanceof Error ? f.error.stack : String(f.error)}`);
      }
      console.log();
    }
  }

  console.log(`${passed}/${tests.length} tests passed (${assertionCount} assertions).`);

  // A suite that ran nothing must never look like a suite that passed.
  if (tests.length === 0) {
    console.log('\nNo tests were registered. Treating that as a failure.');
    return 1;
  }
  if (assertionCount === 0) {
    console.log('\nTests ran but asserted nothing. Treating that as a failure.');
    return 1;
  }

  return failures.length > 0 ? 1 : 0;
}
