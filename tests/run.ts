#!/usr/bin/env bun
// Uso y convención completa: tests/README.md

import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TESTS_ROOT = dirname(fileURLToPath(import.meta.url));

interface TestResult {
  group: string;
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

async function listGroups(): Promise<string[]> {
  const entries = await readdir(TESTS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

async function listTestsInGroup(group: string): Promise<string[]> {
  const groupDir = join(TESTS_ROOT, group);
  const entries = await readdir(groupDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".test.ts"))
    .map((e) => e.name.replace(/\.test\.ts$/, ""))
    .sort();
}

async function runTest(group: string, name: string): Promise<TestResult> {
  const path = join(TESTS_ROOT, group, `${name}.test.ts`);
  const start = performance.now();
  try {
    const mod = await import(path);
    if (typeof mod.default !== "function") {
      throw new Error(
        `${group}/${name}.test.ts no exporta una función default (export default async function run() {...})`
      );
    }
    await mod.default();
    return { group, name, ok: true, durationMs: performance.now() - start };
  } catch (err) {
    return {
      group,
      name,
      ok: false,
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.stack ?? err.message : String(err),
    };
  }
}

async function main() {
  const [groupArg, nameArg] = process.argv.slice(2);

  const groups = groupArg ? [groupArg] : await listGroups();
  const results: TestResult[] = [];

  for (const group of groups) {
    let names: string[];
    try {
      names = nameArg ? [nameArg] : await listTestsInGroup(group);
    } catch {
      console.error(`✗ Grupo desconocido o sin tests: "${group}" (¿existe tests/${group}/?)`);
      process.exit(2);
    }

    if (names.length === 0) {
      console.warn(`(sin tests en el grupo "${group}")`);
      continue;
    }

    console.log(`\n== ${group} ==`);
    for (const name of names) {
      process.stdout.write(`  ${name} ... `);
      const result = await runTest(group, name);
      results.push(result);
      if (result.ok) {
        console.log(`OK (${result.durationMs.toFixed(0)}ms)`);
      } else {
        console.log(`FALLO (${result.durationMs.toFixed(0)}ms)`);
        console.log(
          result.error
            ?.split("\n")
            .map((l) => `    ${l}`)
            .join("\n")
        );
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests pasaron.`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
