import type { BootstrapCloudflareTunnelInput } from "../../packages/cloudflare-bootstrap/bootstrap";

export const MOCK_INPUT: BootstrapCloudflareTunnelInput = {
  apiToken: "mock-cf-token",
  accountId: "mock-account-id",
  zoneId: "mock-zone-id",
  tunnelName: "mc-server-manager",
  publicHostname: "servermc.cetrei.dev",
  localPort: 25565,
};

const MOCK_TUNNEL_ID = "mock-tunnel-id";
const MOCK_TUNNEL_TOKEN = "mock-tunnel-token";
const MOCK_DNS_RECORD_ID = "mock-dns-record-id";

export interface MockCall {
  url: string;
  method: string;
  body: unknown;
}

interface MockHandle {
  calls: MockCall[];
  restore: () => void;
}

function parseBody(init: RequestInit | undefined): unknown {
  if (!init?.body) return undefined;
  return JSON.parse(init.body as string);
}

function cfResponse(result: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, errors: [], result }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mockea `fetch` global simulando una cuenta Cloudflare sin túnel ni DNS
 * record todavía creados: ejercita la rama de creación desde cero.
 */
export function installFreshAccountMock(): MockHandle {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = parseBody(init);
    calls.push({ url, method, body });

    if (url.includes("/cfd_tunnel?name=") && method === "GET") {
      return cfResponse([]);
    }
    if (url.endsWith("/cfd_tunnel") && method === "POST") {
      return cfResponse({ id: MOCK_TUNNEL_ID, name: MOCK_INPUT.tunnelName });
    }
    if (url.endsWith("/token") && method === "GET") {
      return cfResponse(MOCK_TUNNEL_TOKEN);
    }
    if (url.endsWith("/configurations") && method === "PUT") {
      return cfResponse({});
    }
    if (url.includes("/dns_records?type=CNAME") && method === "GET") {
      return cfResponse([]);
    }
    if (url.endsWith("/dns_records") && method === "POST") {
      return cfResponse({ id: MOCK_DNS_RECORD_ID });
    }

    throw new Error(`installFreshAccountMock: URL no mockeada: ${method} ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

/**
 * Mockea `fetch` global simulando una cuenta Cloudflare donde el túnel y el
 * DNS record ya existen: ejercita la rama de idempotencia (reutiliza en vez
 * de crear). Lanza si se intenta crear de nuevo.
 */
export function installExistingAccountMock(): MockHandle {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = parseBody(init);
    calls.push({ url, method, body });

    if (url.includes("/cfd_tunnel?name=") && method === "GET") {
      return cfResponse([{ id: MOCK_TUNNEL_ID, name: MOCK_INPUT.tunnelName }]);
    }
    if (url.endsWith("/cfd_tunnel") && method === "POST") {
      throw new Error("no debería crear un túnel nuevo: ya existe uno con ese nombre");
    }
    if (url.endsWith("/token") && method === "GET") {
      return cfResponse(MOCK_TUNNEL_TOKEN);
    }
    if (url.endsWith("/configurations") && method === "PUT") {
      return cfResponse({});
    }
    if (url.includes("/dns_records?type=CNAME") && method === "GET") {
      return cfResponse([{ id: MOCK_DNS_RECORD_ID }]);
    }
    if (url.endsWith("/dns_records") && method === "POST") {
      throw new Error("no debería crear un DNS record nuevo: ya existe uno para ese hostname");
    }

    throw new Error(`installExistingAccountMock: URL no mockeada: ${method} ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
