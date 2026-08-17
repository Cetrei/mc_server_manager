import { bootstrapCloudflareTunnel } from "../../packages/cloudflare-bootstrap/bootstrap";
import { MOCK_INPUT, installFreshAccountMock, assert } from "./_mock-cloudflare-api";

export default async function run() {
  const mock = installFreshAccountMock();

  try {
    const result = await bootstrapCloudflareTunnel(MOCK_INPUT);

    assert(!!result.tunnelId, "no se devolvió tunnelId");
    assert(!!result.tunnelToken, "no se devolvió tunnelToken");
    assert(!!result.dnsRecordId, "no se devolvió dnsRecordId");

    const createTunnelCall = mock.calls.find(
      (c) => c.url.endsWith("/cfd_tunnel") && c.method === "POST"
    );
    assert(!!createTunnelCall, "no se llamó a crear el túnel");
    const createTunnelBody = createTunnelCall!.body as { name: string; config_src: string };
    assert(createTunnelBody.name === MOCK_INPUT.tunnelName, "el nombre del túnel no coincide");
    assert(createTunnelBody.config_src === "cloudflare", "config_src debe ser 'cloudflare' (remotely-managed)");

    const configureIngressCall = mock.calls.find(
      (c) => c.url.endsWith("/configurations") && c.method === "PUT"
    );
    assert(!!configureIngressCall, "no se configuró el ingress");

    const createDnsCall = mock.calls.find(
      (c) => c.url.endsWith("/dns_records") && c.method === "POST"
    );
    assert(!!createDnsCall, "no se creó el DNS record");
    const createDnsBody = createDnsCall!.body as { type: string; proxied: boolean };
    assert(createDnsBody.type === "CNAME", "el DNS record debe ser CNAME");
    assert(createDnsBody.proxied === false, "el DNS record debe ser DNS only (proxied: false)");
  } finally {
    mock.restore();
  }
}
