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

export const MOCK_ENV: NodeJS.ProcessEnv = {
  CLOUDFLARE_API_TOKEN: CF_MOCK_INPUT.apiToken,
  CLOUDFLARE_ACCOUNT_ID: CF_MOCK_INPUT.accountId,
  CLOUDFLARE_ZONE_ID: CF_MOCK_INPUT.zoneId,
  CLOUDFLARE_TUNNEL_NAME: CF_MOCK_INPUT.tunnelName,
  MC_TUNNEL_DOMAIN: CF_MOCK_INPUT.publicHostname,
  MC_TUNNEL_LOCAL_PORT: String(CF_MOCK_INPUT.localPort),
  DOPPLER_API_TOKEN: "mock-doppler-token",
  DOPPLER_PROJECT_NAME: "minecraft_sm",
  DOPPLER_CONFIG_NAME: "dev",
};

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
