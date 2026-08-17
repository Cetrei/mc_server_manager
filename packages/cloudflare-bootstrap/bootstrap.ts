const CF_API_BASE = "https://api.cloudflare.com/client/v4";

export interface BootstrapCloudflareTunnelInput {
  apiToken: string;
  accountId: string;
  zoneId: string;
  tunnelName: string;
  publicHostname: string;
  localPort: number;
}

export interface BootstrapCloudflareTunnelResult {
  tunnelId: string;
  tunnelToken: string;
  dnsRecordId: string;
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

async function findExistingTunnel(
  input: BootstrapCloudflareTunnelInput
): Promise<CloudflareTunnel | null> {
  const tunnels = await cfRequest<CloudflareTunnel[]>(
    `/accounts/${input.accountId}/cfd_tunnel?name=${encodeURIComponent(input.tunnelName)}&is_deleted=false`,
    input.apiToken
  );
  return tunnels.find((tunnel) => tunnel.name === input.tunnelName) ?? null;
}

async function createTunnel(input: BootstrapCloudflareTunnelInput): Promise<CloudflareTunnel> {
  return cfRequest<CloudflareTunnel>(`/accounts/${input.accountId}/cfd_tunnel`, input.apiToken, {
    method: "POST",
    body: JSON.stringify({ name: input.tunnelName, config_src: "cloudflare" }),
  });
}

async function getTunnelToken(
  input: BootstrapCloudflareTunnelInput,
  tunnelId: string
): Promise<string> {
  return cfRequest<string>(
    `/accounts/${input.accountId}/cfd_tunnel/${tunnelId}/token`,
    input.apiToken
  );
}

async function configureIngress(
  input: BootstrapCloudflareTunnelInput,
  tunnelId: string
): Promise<void> {
  await cfRequest(
    `/accounts/${input.accountId}/cfd_tunnel/${tunnelId}/configurations`,
    input.apiToken,
    {
      method: "PUT",
      body: JSON.stringify({
        config: {
          ingress: [
            {
              hostname: input.publicHostname,
              service: `tcp://localhost:${input.localPort}`,
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

async function findExistingDnsRecord(
  input: BootstrapCloudflareTunnelInput
): Promise<DnsRecord | null> {
  const records = await cfRequest<DnsRecord[]>(
    `/zones/${input.zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(input.publicHostname)}`,
    input.apiToken
  );
  return records[0] ?? null;
}

async function createDnsRecord(
  input: BootstrapCloudflareTunnelInput,
  tunnelId: string
): Promise<DnsRecord> {
  return cfRequest<DnsRecord>(`/zones/${input.zoneId}/dns_records`, input.apiToken, {
    method: "POST",
    body: JSON.stringify({
      type: "CNAME",
      name: input.publicHostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: false,
    }),
  });
}

/**
 * Crea (o reutiliza, si ya existe por nombre/hostname) el túnel remotely-managed
 * de Cloudflare, su ingress TCP genérico y el CNAME "DNS only" asociado.
 *
 * Este es el método de exposición default del sistema: el wizard lo corre
 * automáticamente y deja el túnel autoconfigurado sin pasos manuales en el
 * dashboard de Cloudflare. Ver docs/specs/09_bootstrap_automation.md §5 para
 * el flujo completo (endpoints, shapes de request/response, e idempotencia).
 */
export async function bootstrapCloudflareTunnel(
  input: BootstrapCloudflareTunnelInput
): Promise<BootstrapCloudflareTunnelResult> {
  const existingTunnel = await findExistingTunnel(input);
  const tunnel = existingTunnel ?? (await createTunnel(input));

  const tunnelToken = await getTunnelToken(input, tunnel.id);

  await configureIngress(input, tunnel.id);

  const existingDnsRecord = await findExistingDnsRecord(input);
  const dnsRecord = existingDnsRecord ?? (await createDnsRecord(input, tunnel.id));

  return {
    tunnelId: tunnel.id,
    tunnelToken,
    dnsRecordId: dnsRecord.id,
  };
}
