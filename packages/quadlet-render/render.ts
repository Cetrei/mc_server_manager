import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * Resuelve placeholders {{VAR}} en una plantilla de Quadlet leyendo del
 * entorno inyectado (.env + Doppler, ver docs/standards/infra-config.md).
 * Falla explícito si falta una variable requerida por la plantilla —
 * nunca genera un artefacto con un placeholder sin resolver ni con un
 * default inventado.
 */

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export interface RenderQuadletInput {
  templatePath: string;
  outputDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RenderQuadletResult {
  outputPath: string;
  resolvedVars: string[];
}

function extractPlaceholders(template: string): string[] {
  const matches = [...template.matchAll(PLACEHOLDER_PATTERN)];
  return [...new Set(matches.map((m) => m[1]))];
}

function defaultOutputDir(): string {
  return join(homedir(), ".config", "containers", "systemd");
}

function outputFileName(templatePath: string): string {
  const base = templatePath.split("/").pop() ?? templatePath;
  return base.replace(/\.template$/, "");
}

export async function renderQuadlet(input: RenderQuadletInput): Promise<RenderQuadletResult> {
  const env = input.env ?? process.env;
  const template = await readFile(input.templatePath, "utf-8");

  const placeholders = extractPlaceholders(template);
  const missing = placeholders.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Faltan variable(s) requerida(s) por la plantilla: ${missing.join(", ")}. ` +
        `Ver .env.example y Doppler (docs/standards/infra-config.md).`
    );
  }

  const resolved = template.replace(PLACEHOLDER_PATTERN, (_match, varName: string) => env[varName]!);

  const outputDir = input.outputDir ?? defaultOutputDir();
  const outputPath = join(outputDir, outputFileName(input.templatePath));

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, resolved, "utf-8");

  return { outputPath, resolvedVars: placeholders };
}

if (import.meta.main) {
  const templatePath = process.argv[2] ?? join(import.meta.dir, "..", "..", "infra", "quadlets", "cloudflared.container.template");
  const outputDir = process.argv[3];

  renderQuadlet({ templatePath, outputDir })
    .then((result) => {
      console.log(`Quadlet generado: ${result.outputPath}`);
      console.log(`Variables resueltas: ${result.resolvedVars.join(", ")}`);
    })
    .catch((error) => {
      console.error(`Error en render: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
