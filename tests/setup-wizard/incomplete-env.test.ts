import { runSetupWizard } from "../../apps/setup-wizard/index";
import { installCombinedFreshMock, MOCK_ENV, assert } from "./_mock-wizard-env";

export default async function run() {
  const mock = installCombinedFreshMock();

  try {
    const incompleteEnv: NodeJS.ProcessEnv = { ...MOCK_ENV };
    delete incompleteEnv.CLOUDFLARE_API_TOKEN;
    delete incompleteEnv.DOPPLER_API_TOKEN;

    let thrown: Error | null = null;
    try {
      await runSetupWizard(incompleteEnv);
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
    }

    assert(thrown !== null, "el wizard debió fallar ante un .env incompleto");
    assert(
      thrown!.message.includes("CLOUDFLARE_API_TOKEN"),
      "el mensaje de error no menciona la variable CLOUDFLARE_API_TOKEN faltante"
    );
    assert(
      thrown!.message.includes("DOPPLER_API_TOKEN"),
      "el mensaje de error no menciona la variable DOPPLER_API_TOKEN faltante"
    );

    assert(
      mock.cloudflareCalls.length === 0,
      "no debió invocar ningún paquete de bootstrap si faltan variables requeridas"
    );
    assert(
      mock.dopplerCalls.length === 0,
      "no debió invocar ningún paquete de bootstrap si faltan variables requeridas"
    );
  } finally {
    mock.restore();
  }
}
