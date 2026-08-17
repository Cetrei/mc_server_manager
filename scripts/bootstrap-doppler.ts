#!/usr/bin/env bun
import { bootstrapDopplerProject } from "../packages/doppler-bootstrap/bootstrap";

/**
 * Wrapper individual para correr/debuggear el bootstrap de Doppler de forma
 * aislada, sin pasar por apps/setup-wizard. Ver spec 09 §9.
 *
 * A diferencia de scripts/bootstrap-cloudflare.ts, este wrapper no puede
 * correrse totalmente aislado en la práctica: necesita el token del túnel
 * ya producido (CLOUDFLARE_TUNNEL_TOKEN en el entorno) para tener algo que
 * setear como secreto. Para el flujo completo, usar apps/setup-wizard.
 *
 * Uso:
 *   doppler run --project minecraft_sm -- bun run scripts/bootstrap-doppler.ts
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno "${name}" (ver .env.example y Doppler).`);
  }
  return value;
}

async function main() {
  const result = await bootstrapDopplerProject({
    apiToken: requireEnv("DOPPLER_API_TOKEN"),
    projectName: process.env.DOPPLER_PROJECT_NAME ?? "minecraft_sm",
    configName: process.env.DOPPLER_CONFIG_NAME ?? "dev",
    secrets: {
      CLOUDFLARE_TUNNEL_TOKEN: requireEnv("CLOUDFLARE_TUNNEL_TOKEN"),
    },
  });

  console.log("Proyecto Doppler listo:");
  console.log(`  projectSlug: ${result.projectSlug}`);
  console.log(`  configName: ${result.configName}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`Error en bootstrap-doppler: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
