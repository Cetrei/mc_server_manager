import { bootstrapDopplerProject } from "../../packages/doppler-bootstrap/bootstrap";
import { MOCK_INPUT, installFreshAccountMock, assert } from "./_mock-doppler-api";

export default async function run() {
  const mock = installFreshAccountMock();

  try {
    const result = await bootstrapDopplerProject(MOCK_INPUT);

    assert(result.projectSlug === MOCK_INPUT.projectName, "projectSlug no coincide con el mock");
    assert(result.configName === MOCK_INPUT.configName, "configName no coincide con el input");

    const createProjectCall = mock.calls.find(
      (c) => c.url.endsWith("/projects") && c.method === "POST"
    );
    assert(!!createProjectCall, "no se llamó a crear el proyecto");
    const createProjectBody = createProjectCall!.body as { name: string };
    assert(createProjectBody.name === MOCK_INPUT.projectName, "el nombre del proyecto no coincide");

    const secretsCall = mock.calls.find(
      (c) => c.url.endsWith("/configs/config/secrets") && c.method === "POST"
    );
    assert(!!secretsCall, "no se llamó a setear los secretos");
    const secretsBody = secretsCall!.body as {
      project: string;
      config: string;
      secrets: Record<string, string>;
    };
    assert(secretsBody.project === MOCK_INPUT.projectName, "el proyecto del upsert de secrets no coincide");
    assert(secretsBody.config === MOCK_INPUT.configName, "el config del upsert de secrets no coincide");
    assert(
      secretsBody.secrets.CLOUDFLARE_TUNNEL_TOKEN === "mock-tunnel-token",
      "el secret CLOUDFLARE_TUNNEL_TOKEN no se propagó correctamente"
    );
  } finally {
    mock.restore();
  }
}
