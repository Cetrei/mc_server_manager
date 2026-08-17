#!/usr/bin/env bun
import { bootstrapCloudflareTunnel } from "../packages/cloudflare-bootstrap/bootstrap";

/**
 * Wrapper individual para correr/debuggear el bootstrap de Cloudflare de forma
 * aislada, sin pasar por apps/setup-wizard. Ver spec 09 §9.
 *
 * Uso:
 *   doppler run --project minecraft_sm -- bun run scripts/bootstrap-cloudflare.ts
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno "${name}" (ver .env.example y Doppler).`);
  }
  return value;
}

async function main() {
  const result = await bootstrapCloudflareTunnel({
    apiToken: requireEnv("CLOUDFLARE_API_TOKEN"),
    accountId: requireEnv("CLOUDFLARE_ACCOUNT_ID"),
    zoneId: requireEnv("CLOUDFLARE_ZONE_ID"),
    tunnelName: process.env.CLOUDFLARE_TUNNEL_NAME ?? "mc-server-manager",
    publicHostname: requireEnv("MC_TUNNEL_DOMAIN"),
    localPort: Number(process.env.MC_TUNNEL_LOCAL_PORT ?? "25565"),
  });

  console.log("Cloudflare Tunnel listo:");
  console.log(`  tunnelId: ${result.tunnelId}`);
  console.log(`  dnsRecordId: ${result.dnsRecordId}`);
  console.log("  tunnelToken: (omitido del log, ver Doppler tras el próximo paso de doppler-bootstrap)");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Error en bootstrap-cloudflare: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
