import { bootstrapCloudflareTunnel } from "../../packages/cloudflare-bootstrap/bootstrap";
import { MOCK_INPUT, installFreshAccountMock, assert } from "./_mock-cloudflare-api";

export default async function run() {
  const mock = installFreshAccountMock();

  try {
    const result = await bootstrapCloudflareTunnel(MOCK_INPUT);

    assert(!!result.tunnelId, "no se devolvió tunnelId");
    assert(!!result.tunnelToken, "no se devolvió tunnelToken");
    assert(!!result.minecraftDnsRecordId, "no se devolvió minecraftDnsRecordId");
    assert(!!result.apiDnsRecordId, "no se devolvió apiDnsRecordId");
    assert(
      result.minecraftDnsRecordId !== result.apiDnsRecordId,
      "los dos DNS record deben ser distintos (dos hostnames separados)"
    );

    const createTunnelCall = mock.calls.find((c) => c.url.endsWith("/cfd_tunnel") && c.method === "POST");
    assert(!!createTunnelCall, "no se llamó a crear el túnel");
    const createTunnelBody = createTunnelCall!.body as { name: string; config_src: string };
    assert(createTunnelBody.name === MOCK_INPUT.tunnel.name, "el nombre del túnel no coincide");
    assert(createTunnelBody.config_src === "cloudflare", "config_src debe ser 'cloudflare' (remotely-managed)");

    const configureIngressCall = mock.calls.find((c) => c.url.endsWith("/configurations") && c.method === "PUT");
    assert(!!configureIngressCall, "no se configuró el ingress");
    const ingressBody = configureIngressCall!.body as { config: { ingress: Array<{ hostname?: string; service: string }> } };
    const rules = ingressBody.config.ingress;
    assert(rules.length === 3, "deben existir exactamente 3 reglas: minecraft, api, catch-all");
    const minecraftRule = rules.find((r) => r.hostname === MOCK_INPUT.tunnel.minecraftHostname);
    assert(!!minecraftRule, "falta la regla de ingress para el hostname de minecraft");
    assert(
      minecraftRule!.service === `tcp://localhost:${MOCK_INPUT.tunnel.minecraftLocalPort}`,
      "el servicio de la regla minecraft debe ser tcp:// al puerto local configurado"
    );
    const apiRule = rules.find((r) => r.hostname === MOCK_INPUT.tunnel.apiHostname);
    assert(!!apiRule, "falta la regla de ingress para el hostname de api");
    assert(
      apiRule!.service === `http://localhost:${MOCK_INPUT.tunnel.apiLocalPort}`,
      "el servicio de la regla api debe ser http:// al puerto local configurado"
    );
    const catchAllRule = rules[rules.length - 1];
    assert(catchAllRule.service === "http_status:404", "la última regla debe ser el catch-all http_status:404");

    const createDnsCalls = mock.calls.filter((c) => c.url.endsWith("/dns_records") && c.method === "POST");
    assert(createDnsCalls.length === 2, "deben crearse exactamente 2 DNS records (minecraft + api)");
    for (const call of createDnsCalls) {
      const body = call.body as { type: string; proxied: boolean };
      assert(body.type === "CNAME", "el DNS record debe ser CNAME");
      assert(body.proxied === false, "el DNS record debe ser DNS only (proxied: false)");
    }
  } finally {
    mock.restore();
  }
}
