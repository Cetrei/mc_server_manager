import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import { runSetupWizard } from "../../apps/setup-wizard/index";
import { installCombinedFreshMock, writeMockStructuralConfig, MOCK_ENV, assert } from "./_mock-wizard-env";

export default async function run() {
  const mock = installCombinedFreshMock();
  const configPath = await writeMockStructuralConfig();

  try {
    const incompleteEnv: NodeJS.ProcessEnv = { ...MOCK_ENV };
    delete incompleteEnv.CLOUDFLARE_API_TOKEN;
    delete incompleteEnv.DOPPLER_API_TOKEN;

    let thrown: Error | null = null;
    try {
      await runSetupWizard(configPath, incompleteEnv);
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
    }

    assert(thrown !== null, "el wizard debió fallar ante un entorno de secretos incompleto");
    assert(
      thrown!.message.includes("cloudflareApiToken"),
      "el mensaje de error no menciona el campo cloudflareApiToken faltante"
    );
    assert(
      thrown!.message.includes("dopplerApiToken"),
      "el mensaje de error no menciona el campo dopplerApiToken faltante"
    );

    assert(mock.cloudflareCalls.length === 0, "no debió invocar ningún paquete de bootstrap si faltan secretos requeridos");
    assert(mock.dopplerCalls.length === 0, "no debió invocar ningún paquete de bootstrap si faltan secretos requeridos");
  } finally {
    mock.restore();
    await rm(dirname(configPath), { recursive: true, force: true });
  }
}
