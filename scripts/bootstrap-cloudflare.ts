#!/usr/bin/env bun
import { loadBootstrapConfig } from "../packages/config-loader/load";
import { bootstrapCloudflareTunnel } from "../packages/cloudflare-bootstrap/bootstrap";

/**
 * Wrapper individual para correr/debuggear el bootstrap de Cloudflare de forma
 * aislada, sin pasar por apps/setup-wizard. Ver spec 09 §9.
 *
 * Uso:
 *   doppler run --project minecraft_sm -- bun run scripts/bootstrap-cloudflare.ts
 */

const DEFAULT_CONFIG_PATH = new URL("../infra/config/bootstrap.yml", import.meta.url).pathname;

async function main() {
  const config = await loadBootstrapConfig(DEFAULT_CONFIG_PATH);

  const result = await bootstrapCloudflareTunnel({
    secrets: config.secrets,
    tunnel: config.structural.cloudflareTunnel,
  });

  console.log("Cloudflare Tunnel listo:");
  console.log(`  tunnelId: ${result.tunnelId}`);
  console.log(`  minecraftDnsRecordId: ${result.minecraftDnsRecordId}`);
  console.log(`  apiDnsRecordId: ${result.apiDnsRecordId}`);
  console.log("  tunnelToken: (omitido del log, ver Doppler tras el próximo paso de doppler-bootstrap)");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Error en bootstrap-cloudflare: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
