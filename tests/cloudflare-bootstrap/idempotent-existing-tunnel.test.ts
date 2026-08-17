import { bootstrapCloudflareTunnel } from "../../packages/cloudflare-bootstrap/bootstrap";
import { MOCK_INPUT, installExistingAccountMock, assert } from "./_mock-cloudflare-api";

export default async function run() {
  const mock = installExistingAccountMock();

  try {
    const result = await bootstrapCloudflareTunnel(MOCK_INPUT);

    assert(!!result.tunnelId, "debió reutilizar el tunnelId existente");
    assert(!!result.dnsRecordId, "debió reutilizar el dnsRecordId existente");

    const createTunnelCall = mock.calls.find(
      (c) => c.url.endsWith("/cfd_tunnel") && c.method === "POST"
    );
    assert(!createTunnelCall, "no debió llamar a crear un túnel nuevo si ya existe uno");

    const createDnsCall = mock.calls.find(
      (c) => c.url.endsWith("/dns_records") && c.method === "POST"
    );
    assert(!createDnsCall, "no debió llamar a crear un DNS record nuevo si ya existe uno");

    const configureIngressCall = mock.calls.find(
      (c) => c.url.endsWith("/configurations") && c.method === "PUT"
    );
    assert(
      !!configureIngressCall,
      "el ingress se debe configurar siempre, exista o no el túnel de antes"
    );
  } finally {
    mock.restore();
  }
}
