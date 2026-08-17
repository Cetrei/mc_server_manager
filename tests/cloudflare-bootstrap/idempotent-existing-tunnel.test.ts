import { bootstrapCloudflareTunnel } from "../../packages/cloudflare-bootstrap/bootstrap";
import { MOCK_INPUT, installExistingAccountMock, assert } from "./_mock-cloudflare-api";

export default async function run() {
  const mock = installExistingAccountMock();

  try {
    const result = await bootstrapCloudflareTunnel(MOCK_INPUT);

    assert(!!result.tunnelId, "debió reutilizar el tunnelId existente");
    assert(!!result.minecraftDnsRecordId, "debió reutilizar el minecraftDnsRecordId existente");
    assert(!!result.apiDnsRecordId, "debió reutilizar el apiDnsRecordId existente");

    const createTunnelCall = mock.calls.find((c) => c.url.endsWith("/cfd_tunnel") && c.method === "POST");
    assert(!createTunnelCall, "no debió llamar a crear un túnel nuevo si ya existe uno");

    const createDnsCall = mock.calls.find((c) => c.url.endsWith("/dns_records") && c.method === "POST");
    assert(!createDnsCall, "no debió llamar a crear ningún DNS record nuevo si ambos ya existen");

    const configureIngressCall = mock.calls.find((c) => c.url.endsWith("/configurations") && c.method === "PUT");
    assert(!!configureIngressCall, "el ingress se debe configurar siempre, exista o no el túnel de antes");

    const dnsLookupCalls = mock.calls.filter((c) => c.url.includes("/dns_records?type=CNAME") && c.method === "GET");
    assert(dnsLookupCalls.length === 2, "debió consultar existencia de DNS record para ambos hostnames");
  } finally {
    mock.restore();
  }
}
