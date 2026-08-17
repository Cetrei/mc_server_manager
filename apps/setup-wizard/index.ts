#!/usr/bin/env bun
import * as prompts from "@clack/prompts";
import { bootstrapCloudflareTunnel } from "../../packages/cloudflare-bootstrap/bootstrap";
import { bootstrapDopplerProject } from "../../packages/doppler-bootstrap/bootstrap";

/**
 * Punto de entrada único del bootstrap del stack de configuración.
 * Ver docs/specs/09_bootstrap_automation.md §8.
 *
 * Orquesta, en orden de dependencia: cloudflare-bootstrap (produce el token
 * del túnel) -> doppler-bootstrap (recibe ese token como secreto a setear).
 *
 * supabase-bootstrap queda fuera de este wizard hasta que se resuelva el
 * issue #32 (shape de API keys y manejo de ACTIVE_HEALTHY sin confirmar).
 *
 * Uso:
 *   bun run apps/setup-wizard
 */

interface RequiredVar {
  name: string;
  description: string;
}

const REQUIRED_VARS: RequiredVar[] = [
  { name: "CLOUDFLARE_API_TOKEN", description: "Dashboard Cloudflare > My Profile > API Tokens" },
  { name: "CLOUDFLARE_ACCOUNT_ID", description: "Dashboard Cloudflare > barra lateral derecha, cualquier dominio" },
  { name: "CLOUDFLARE_ZONE_ID", description: "Dashboard Cloudflare > dominio cetrei.dev > Overview" },
  { name: "MC_TUNNEL_DOMAIN", description: ".env, ej. servermc.cetrei.dev" },
  { name: "DOPPLER_API_TOKEN", description: "Dashboard Doppler > Team Settings > API Tokens" },
];

interface MissingVarsReport {
  missing: RequiredVar[];
}

function detectMissingVars(env: NodeJS.ProcessEnv): MissingVarsReport {
  const missing = REQUIRED_VARS.filter((requiredVar) => !env[requiredVar.name]);
  return { missing };
}

async function runCloudflareStep(env: NodeJS.ProcessEnv) {
  const spinner = prompts.spinner();
  spinner.start("Creando/verificando túnel de Cloudflare");

  const result = await bootstrapCloudflareTunnel({
    apiToken: env.CLOUDFLARE_API_TOKEN!,
    accountId: env.CLOUDFLARE_ACCOUNT_ID!,
    zoneId: env.CLOUDFLARE_ZONE_ID!,
    tunnelName: env.CLOUDFLARE_TUNNEL_NAME ?? "mc-server-manager",
    publicHostname: env.MC_TUNNEL_DOMAIN!,
    localPort: Number(env.MC_TUNNEL_LOCAL_PORT ?? "25565"),
  });

  spinner.stop(`Túnel de Cloudflare listo (tunnelId: ${result.tunnelId})`);
  return result;
}

async function runDopplerStep(env: NodeJS.ProcessEnv, tunnelToken: string) {
  const spinner = prompts.spinner();
  spinner.start("Creando/verificando proyecto Doppler");

  const result = await bootstrapDopplerProject({
    apiToken: env.DOPPLER_API_TOKEN!,
    projectName: env.DOPPLER_PROJECT_NAME ?? "minecraft_sm",
    configName: env.DOPPLER_CONFIG_NAME ?? "dev",
    secrets: {
      CLOUDFLARE_TUNNEL_TOKEN: tunnelToken,
    },
  });

  spinner.stop(`Proyecto Doppler listo (${result.projectSlug}/${result.configName})`);
  return result;
}

export async function runSetupWizard(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  prompts.intro("mc_server_manager — bootstrap del stack de configuración");

  const { missing } = detectMissingVars(env);
  if (missing.length > 0) {
    prompts.log.error("Faltan variables requeridas en el entorno:");
    for (const missingVar of missing) {
      prompts.log.error(`  ${missingVar.name} — ${missingVar.description}`);
    }
    prompts.outro("Bootstrap detenido. Completa .env / Doppler y volvé a correr el wizard.");
    throw new Error(`Faltan ${missing.length} variable(s) requerida(s): ${missing.map((v) => v.name).join(", ")}`);
  }

  const cloudflareResult = await runCloudflareStep(env);
  const dopplerResult = await runDopplerStep(env, cloudflareResult.tunnelToken);

  prompts.log.info("Nota: supabase-bootstrap no está incluido todavía (issue #32 pendiente).");
  prompts.outro("Bootstrap completo: Cloudflare Tunnel + Doppler listos.");

  void dopplerResult;
}

if (import.meta.main) {
  runSetupWizard().catch((error) => {
    console.error(`Error en el wizard: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
