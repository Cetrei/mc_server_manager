import { runSetupWizard } from "../../apps/setup-wizard/index";
import { installCombinedFreshMock, MOCK_ENV, assert } from "./_mock-wizard-env";

/**
 * Caso nuevo tras introducir config-loader: el wizard debe fallar explícito
 * (nunca con un default inventado) si infra/config/bootstrap.yml no existe
 * o no puede leerse en la ruta indicada.
 */
export default async function run() {
  const mock = installCombinedFreshMock();
  const nonExistentPath = "/tmp/mc-server-manager-test-nonexistent-config.yml";

  try {
    let thrown: Error | null = null;
    try {
      await runSetupWizard(nonExistentPath, MOCK_ENV);
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
    }

    assert(thrown !== null, "el wizard debió fallar si el .yml estructural no existe");
    assert(mock.cloudflareCalls.length === 0, "no debió invocar ningún paquete de bootstrap si el .yml no se pudo leer");
    assert(mock.dopplerCalls.length === 0, "no debió invocar ningún paquete de bootstrap si el .yml no se pudo leer");
  } finally {
    mock.restore();
  }
}
