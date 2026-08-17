import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadBootstrapConfig } from "../../packages/config-loader/load";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const VALID_YAML = `
cloudflareTunnel:
  name: mc-server-manager
  minecraftHostname: servermc.cetrei.dev
  minecraftLocalPort: 25565
  apiHostname: panel-api.cetrei.dev
  apiLocalPort: 8080
doppler:
  projectName: minecraft_sm
  configName: dev
`;

const VALID_SECRETS_ENV: NodeJS.ProcessEnv = {
  CLOUDFLARE_API_TOKEN: "mock-cf-token",
  CLOUDFLARE_ACCOUNT_ID: "mock-account-id",
  CLOUDFLARE_ZONE_ID: "mock-zone-id",
  DOPPLER_API_TOKEN: "mock-doppler-token",
};

export default async function run() {
  const workDir = await mkdtemp(join(tmpdir(), "config-loader-test-"));
  const yamlPath = join(workDir, "bootstrap.yml");

  try {
    await writeFile(yamlPath, VALID_YAML);

    const config = await loadBootstrapConfig(yamlPath, VALID_SECRETS_ENV);
    assert(config.structural.cloudflareTunnel.minecraftLocalPort === 25565, "minecraftLocalPort no se parseó como number");
    assert(config.structural.cloudflareTunnel.apiHostname === "panel-api.cetrei.dev", "apiHostname no coincide");
    assert(config.structural.doppler.projectName === "minecraft_sm", "projectName no coincide");
    assert(config.secrets.cloudflareApiToken === "mock-cf-token", "cloudflareApiToken no coincide");

    let thrownMissingSecret: Error | null = null;
    try {
      await loadBootstrapConfig(yamlPath, { ...VALID_SECRETS_ENV, CLOUDFLARE_API_TOKEN: undefined });
    } catch (error) {
      thrownMissingSecret = error instanceof Error ? error : new Error(String(error));
    }
    assert(thrownMissingSecret !== null, "debió fallar ante un secreto faltante en el entorno");
    assert(
      thrownMissingSecret!.message.includes("cloudflareApiToken"),
      "el mensaje de error no menciona el campo faltante"
    );

    const malformedYamlPath = join(workDir, "malformed.yml");
    await writeFile(
      malformedYamlPath,
      "cloudflareTunnel:\n  name: mc-server-manager\n  minecraftLocalPort: not-a-number\n"
    );
    let thrownMalformedYaml: Error | null = null;
    try {
      await loadBootstrapConfig(malformedYamlPath, VALID_SECRETS_ENV);
    } catch (error) {
      thrownMalformedYaml = error instanceof Error ? error : new Error(String(error));
    }
    assert(thrownMalformedYaml !== null, "debió fallar ante un yml mal tipado (minecraftLocalPort no numérico)");

    const zeroPortYamlPath = join(workDir, "zero-port.yml");
    await writeFile(
      zeroPortYamlPath,
      VALID_YAML.replace("apiLocalPort: 8080", "apiLocalPort: 0")
    );
    let thrownZeroPort: Error | null = null;
    try {
      await loadBootstrapConfig(zeroPortYamlPath, VALID_SECRETS_ENV);
    } catch (error) {
      thrownZeroPort = error instanceof Error ? error : new Error(String(error));
    }
    assert(
      thrownZeroPort !== null,
      "debió fallar ante apiLocalPort: 0 (placeholder de puerto pendiente de confirmar, no un valor válido)"
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
