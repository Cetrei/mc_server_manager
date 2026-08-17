import type { BootstrapDopplerProjectInput } from "../../packages/doppler-bootstrap/bootstrap";

export const MOCK_INPUT: BootstrapDopplerProjectInput = {
  apiToken: "mock-doppler-token",
  projectName: "minecraft_sm",
  configName: "dev",
  secrets: {
    CLOUDFLARE_TUNNEL_TOKEN: "mock-tunnel-token",
  },
};

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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Mockea `fetch` global simulando una cuenta Doppler sin el proyecto todavía
 * creado: ejercita la rama de creación desde cero.
 */
export function installFreshAccountMock(): MockHandle {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = parseBody(init);
    calls.push({ url, method, body });

    if (url.includes("/projects/project?project=")) {
      return jsonResponse({ messages: ["Project not found"] }, 404);
    }
    if (url.endsWith("/projects") && method === "POST") {
      return jsonResponse({ project: { slug: MOCK_INPUT.projectName, name: MOCK_INPUT.projectName } });
    }
    if (url.endsWith("/configs/config/secrets") && method === "POST") {
      return jsonResponse({ secrets: MOCK_INPUT.secrets });
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
 * Mockea `fetch` global simulando una cuenta Doppler donde el proyecto ya
 * existe: ejercita la rama de idempotencia (reutiliza en vez de crear).
 */
export function installExistingAccountMock(): MockHandle {
  const calls: MockCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = parseBody(init);
    calls.push({ url, method, body });

    if (url.includes("/projects/project?project=")) {
      return jsonResponse({ project: { slug: MOCK_INPUT.projectName, name: MOCK_INPUT.projectName } });
    }
    if (url.endsWith("/projects") && method === "POST") {
      throw new Error("no debería crear un proyecto nuevo: ya existe uno con ese nombre");
    }
    if (url.endsWith("/configs/config/secrets") && method === "POST") {
      return jsonResponse({ secrets: MOCK_INPUT.secrets });
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
