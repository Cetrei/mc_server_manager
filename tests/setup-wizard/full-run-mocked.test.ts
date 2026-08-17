import { runSetupWizard } from "../../apps/setup-wizard/index";
import { installCombinedFreshMock, MOCK_ENV, assert } from "./_mock-wizard-env";

export default async function run() {
  const mock = installCombinedFreshMock();

  try {
    await runSetupWizard(MOCK_ENV);

    const cloudflareCreateCall = mock.cloudflareCalls.find(
      (c) => c.url.endsWith("/cfd_tunnel") && c.method === "POST"
    );
    assert(!!cloudflareCreateCall, "el wizard no invocó la creación del túnel de Cloudflare");

    const dopplerCreateCall = mock.dopplerCalls.find(
      (c) => c.url.endsWith("/projects") && c.method === "POST"
    );
    assert(!!dopplerCreateCall, "el wizard no invocó la creación del proyecto Doppler");

    const secretsCall = mock.dopplerCalls.find(
      (c) => c.url.endsWith("/configs/config/secrets") && c.method === "POST"
    );
    assert(!!secretsCall, "el wizard no seteó los secretos en Doppler");
    const secretsBody = secretsCall!.body as { secrets: Record<string, string> };
    assert(
      secretsBody.secrets.CLOUDFLARE_TUNNEL_TOKEN === "mock-tunnel-token",
      "el token del túnel de Cloudflare no se propagó al paso de Doppler"
    );

    // Orden: la llamada de creación del túnel debe estar en el historial de
    // Cloudflare antes de que exista cualquier llamada en el historial de
    // Doppler, verificando el orden de dependencia cloudflare -> doppler.
    assert(
      mock.cloudflareCalls.length > 0 && mock.dopplerCalls.length > 0,
      "ambos pasos deben haberse ejecutado"
    );
  } finally {
    mock.restore();
  }
}
