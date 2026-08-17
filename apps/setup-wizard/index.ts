#!/usr/bin/env bun
import * as prompts from "@clack/prompts";
import { loadBootstrapConfig } from "../../packages/config-loader/load";
import { bootstrapCloudflareTunnel } from "../../packages/cloudflare-bootstrap/bootstrap";
import { bootstrapDopplerProject } from "../../packages/doppler-bootstrap/bootstrap";

/**
 * Punto de entrada único del bootstrap del stack de configuración.
 * Ver docs/specs/09_bootstrap_automation.md §8.
 *
 * Orquesta, en orden de dependencia: config-loader (valida .yml + entorno)
 * -> cloudflare-bootstrap (produce el token del túnel) -> doppler-bootstrap
 * (recibe ese token como secreto a setear).
 *
 * supabase-bootstrap queda fuera de este wizard: dos decisiones de diseño
 * sin resolver, ver docs/specs/09_bootstrap_automation.md §7.
 *
 * Uso:
 *   bun run apps/setup-wizard
 */

const DEFAULT_CONFIG_PATH = new URL("../../infra/config/bootstrap.yml", import.meta.url).pathname;

async function runCloudflareStep(config: Awaited<ReturnType<typeof loadBootstrapConfig>>) {
  const spinner = prompts.spinner();
  spinner.start("Creando/verificando túnel de Cloudflare");

  const result = await bootstrapCloudflareTunnel({
    secrets: config.secrets,
    tunnel: config.structural.cloudflareTunnel,
  });

  spinner.stop(`Túnel de Cloudflare listo (tunnelId: ${result.tunnelId})`);
  return result;
}

async function runDopplerStep(config: Awaited<ReturnType<typeof loadBootstrapConfig>>, tunnelToken: string) {
  const spinner = prompts.spinner();
  spinner.start("Creando/verificando proyecto Doppler");

  const result = await bootstrapDopplerProject({
    apiToken: config.secrets.dopplerApiToken,
    projectName: config.structural.doppler.projectName,
    configName: config.structural.doppler.configName,
    secrets: {
      CLOUDFLARE_TUNNEL_TOKEN: tunnelToken,
    },
  });

  spinner.stop(`Proyecto Doppler listo (${result.projectSlug}/${result.configName})`);
  return result;
}

export async function runSetupWizard(
  configPath: string = DEFAULT_CONFIG_PATH,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  prompts.intro("mc_server_manager — bootstrap del stack de configuración");

  let config: Awaited<ReturnType<typeof loadBootstrapConfig>>;
  try {
    config = await loadBootstrapConfig(configPath, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    prompts.log.error(message);
    prompts.outro("Bootstrap detenido. Completa infra/config/bootstrap.yml / .env / Doppler y volvé a correr el wizard.");
    throw error;
  }

  const cloudflareResult = await runCloudflareStep(config);
  const dopplerResult = await runDopplerStep(config, cloudflareResult.tunnelToken);

  prompts.log.info("Nota: supabase-bootstrap no está incluido todavía (ver spec 09 §7).");
  prompts.outro("Bootstrap completo: Cloudflare Tunnel + Doppler listos.");

  void dopplerResult;
}

if (import.meta.main) {
  runSetupWizard().catch((error) => {
    console.error(`Error en el wizard: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
