import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MOCK_INPUT as CF_MOCK_INPUT, installFreshAccountMock as installFreshCloudflareMock } from "../cloudflare-bootstrap/_mock-cloudflare-api";
import { installFreshAccountMock as installFreshDopplerMock } from "../doppler-bootstrap/_mock-doppler-api";

/**
 * El wizard llama a bootstrapCloudflareTunnel y luego bootstrapDopplerProject,
 * ambos sobre `fetch` global. Como los dos paquetes pegan a hosts distintos
 * (api.cloudflare.com vs api.doppler.com), un único mock combinado enruta
 * por host y delega a los mocks ya existentes de cada paquete.
 */
export function installCombinedFreshMock() {
  const originalFetch = globalThis.fetch;

  const cloudflareMock = installFreshCloudflareMock();
  const cloudflareFetch = globalThis.fetch;

  const dopplerMock = installFreshDopplerMock();
  const dopplerFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.doppler.com")) {
      return dopplerFetch(input, init);
    }
    return cloudflareFetch(input, init);
  }) as typeof fetch;

  return {
    cloudflareCalls: cloudflareMock.calls,
    dopplerCalls: dopplerMock.calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

/**
 * Escribe un infra/config/bootstrap.yml temporal consistente con MOCK_INPUT
 * de cloudflare-bootstrap y doppler-bootstrap, para que el wizard (que ahora
 * lee config estructural desde .yml, no desde env) tenga un config path real
 * contra el cual correr en los tests.
 */
export async function writeMockStructuralConfig(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "setup-wizard-test-"));
  const path = join(dir, "bootstrap.yml");
  const yaml = `
cloudflareTunnel:
  name: ${CF_MOCK_INPUT.tunnel.name}
  minecraftHostname: ${CF_MOCK_INPUT.tunnel.minecraftHostname}
  minecraftLocalPort: ${CF_MOCK_INPUT.tunnel.minecraftLocalPort}
  apiHostname: ${CF_MOCK_INPUT.tunnel.apiHostname}
  apiLocalPort: ${CF_MOCK_INPUT.tunnel.apiLocalPort}
doppler:
  projectName: minecraft_sm
  configName: dev
`;
  await writeFile(path, yaml);
  return path;
}

export const MOCK_ENV: NodeJS.ProcessEnv = {
  CLOUDFLARE_API_TOKEN: CF_MOCK_INPUT.secrets.cloudflareApiToken,
  CLOUDFLARE_ACCOUNT_ID: CF_MOCK_INPUT.secrets.cloudflareAccountId,
  CLOUDFLARE_ZONE_ID: CF_MOCK_INPUT.secrets.cloudflareZoneId,
  DOPPLER_API_TOKEN: "mock-doppler-token",
};

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
