import { readFile } from "node:fs/promises";
import { load as parseYaml } from "js-yaml";
import {
  StructuralConfigSchema,
  SecretsConfigSchema,
  type BootstrapConfig,
} from "./schema";

function formatZodError(context: string, error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  const details = error.issues
    .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
    .join("; ");
  return `Config inválida en ${context}: ${details}`;
}

async function loadStructuralConfig(yamlPath: string) {
  const raw = await readFile(yamlPath, "utf-8");
  const parsed = parseYaml(raw);
  const result = StructuralConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(formatZodError(yamlPath, result.error));
  }

  return result.data;
}

function loadSecretsConfig(env: NodeJS.ProcessEnv) {
  const candidate = {
    cloudflareApiToken: env.CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareZoneId: env.CLOUDFLARE_ZONE_ID,
    dopplerApiToken: env.DOPPLER_API_TOKEN,
  };

  const result = SecretsConfigSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(
      formatZodError("entorno (.env / Doppler)", result.error) +
        " — ver .env.example y Doppler (docs/standards/infra-config.md)."
    );
  }

  return result.data;
}

/**
 * Carga y valida los dos niveles de config no-Supabase (tech_stack.md §3):
 * estructural (.yml) y secretos (entorno). Falla explícito ante cualquier
 * campo faltante o mal tipado en cualquiera de los dos niveles, sin generar
 * defaults inventados (docs/standards/infra-config.md).
 */
export async function loadBootstrapConfig(
  yamlPath: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<BootstrapConfig> {
  const structural = await loadStructuralConfig(yamlPath);
  const secrets = loadSecretsConfig(env);

  return { structural, secrets };
}
