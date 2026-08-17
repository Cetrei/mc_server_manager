import type { StructuralConfig, SecretsConfig } from "../config-loader/schema";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export interface BootstrapCloudflareTunnelInput {
  secrets: Pick<SecretsConfig, "cloudflareApiToken" | "cloudflareAccountId" | "cloudflareZoneId">;
  tunnel: StructuralConfig["cloudflareTunnel"];
}

export interface BootstrapCloudflareTunnelResult {
  tunnelId: string;
  tunnelToken: string;
  minecraftDnsRecordId: string;
  apiDnsRecordId: string;
}

interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

interface CloudflareTunnel {
  id: string;
  name: string;
}

async function cfRequest<T>(
  path: string,
  apiToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${CF_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json()) as CloudflareApiResponse<T>;

  if (!response.ok || !body.success) {
    const detail = body.errors?.map((apiError) => apiError.message).join("; ") ?? response.statusText;
    throw new Error(`Cloudflare API error en ${path}: ${detail}`);
  }

  return body.result;
}

async function findExistingTunnel(input: BootstrapCloudflareTunnelInput): Promise<CloudflareTunnel | null> {
  const tunnels = await cfRequest<CloudflareTunnel[]>(
    `/accounts/${input.secrets.cloudflareAccountId}/cfd_tunnel?name=${encodeURIComponent(input.tunnel.name)}&is_deleted=false`,
    input.secrets.cloudflareApiToken
  );
  return tunnels.find((tunnel) => tunnel.name === input.tunnel.name) ?? null;
}

async function createTunnel(input: BootstrapCloudflareTunnelInput): Promise<CloudflareTunnel> {
  return cfRequest<CloudflareTunnel>(
    `/accounts/${input.secrets.cloudflareAccountId}/cfd_tunnel`,
    input.secrets.cloudflareApiToken,
    {
      method: "POST",
      body: JSON.stringify({ name: input.tunnel.name, config_src: "cloudflare" }),
    }
  );
}

async function getTunnelToken(input: BootstrapCloudflareTunnelInput, tunnelId: string): Promise<string> {
  return cfRequest<string>(
    `/accounts/${input.secrets.cloudflareAccountId}/cfd_tunnel/${tunnelId}/token`,
    input.secrets.cloudflareApiToken
  );
}

/**
 * Un solo túnel, dos reglas de ingress (decisión registrada en AGENT.md):
 * minecraft (TCP crudo, jugadores) y api (HTTP, edge-worker -> local-agent,
 * spec 04). Cloudflare enruta cada regla a un destino local distinto sin
 * que el tráfico se mezcle entre sí -- no requiere túneles separados.
 */
async function configureIngress(input: BootstrapCloudflareTunnelInput, tunnelId: string): Promise<void> {
  await cfRequest(
    `/accounts/${input.secrets.cloudflareAccountId}/cfd_tunnel/${tunnelId}/configurations`,
    input.secrets.cloudflareApiToken,
    {
      method: "PUT",
      body: JSON.stringify({
        config: {
          ingress: [
            {
              hostname: input.tunnel.minecraftHostname,
              service: `tcp://localhost:${input.tunnel.minecraftLocalPort}`,
            },
            {
              hostname: input.tunnel.apiHostname,
              service: `http://localhost:${input.tunnel.apiLocalPort}`,
            },
            { service: "http_status:404" },
          ],
        },
      }),
    }
  );
}

interface DnsRecord {
  id: string;
}

async function findExistingDnsRecord(input: BootstrapCloudflareTunnelInput, hostname: string): Promise<DnsRecord | null> {
  const records = await cfRequest<DnsRecord[]>(
    `/zones/${input.secrets.cloudflareZoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
    input.secrets.cloudflareApiToken
  );
  return records[0] ?? null;
}

async function createDnsRecord(
  input: BootstrapCloudflareTunnelInput,
  tunnelId: string,
  hostname: string
): Promise<DnsRecord> {
  return cfRequest<DnsRecord>(`/zones/${input.secrets.cloudflareZoneId}/dns_records`, input.secrets.cloudflareApiToken, {
    method: "POST",
    body: JSON.stringify({
      type: "CNAME",
      name: hostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: false,
    }),
  });
}

async function ensureDnsRecord(input: BootstrapCloudflareTunnelInput, tunnelId: string, hostname: string): Promise<DnsRecord> {
  const existing = await findExistingDnsRecord(input, hostname);
  return existing ?? (await createDnsRecord(input, tunnelId, hostname));
}

/**
 * Crea (o reutiliza, si ya existe por nombre/hostname) el túnel remotely-managed
 * de Cloudflare, sus dos reglas de ingress y los CNAME "DNS only" asociados.
 *
 * Este es el método de exposición default del sistema mientras spec 01 (VPS
 * Oracle) esté pausado: el wizard lo corre automáticamente y deja el túnel
 * autoconfigurado sin pasos manuales en el dashboard de Cloudflare. Ver
 * docs/specs/09_bootstrap_automation.md §5 para el flujo original de un solo
 * ingress; este bootstrap lo extiende a dos (ver AGENT.md, decisión de arquitectura).
 */
export async function bootstrapCloudflareTunnel(
  input: BootstrapCloudflareTunnelInput
): Promise<BootstrapCloudflareTunnelResult> {
  const existingTunnel = await findExistingTunnel(input);
  const tunnel = existingTunnel ?? (await createTunnel(input));

  const tunnelToken = await getTunnelToken(input, tunnel.id);

  await configureIngress(input, tunnel.id);

  const minecraftDnsRecord = await ensureDnsRecord(input, tunnel.id, input.tunnel.minecraftHostname);
  const apiDnsRecord = await ensureDnsRecord(input, tunnel.id, input.tunnel.apiHostname);

  return {
    tunnelId: tunnel.id,
    tunnelToken,
    minecraftDnsRecordId: minecraftDnsRecord.id,
    apiDnsRecordId: apiDnsRecord.id,
  };
}
