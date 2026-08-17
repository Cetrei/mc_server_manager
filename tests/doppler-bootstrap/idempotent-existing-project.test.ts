import { bootstrapDopplerProject } from "../../packages/doppler-bootstrap/bootstrap";
import { MOCK_INPUT, installExistingAccountMock, assert } from "./_mock-doppler-api";

export default async function run() {
  const mock = installExistingAccountMock();

  try {
    const result = await bootstrapDopplerProject(MOCK_INPUT);

    assert(result.projectSlug === MOCK_INPUT.projectName, "debió reutilizar el projectSlug existente");

    const createProjectCall = mock.calls.find(
      (c) => c.url.endsWith("/projects") && c.method === "POST"
    );
    assert(!createProjectCall, "no debió llamar a crear un proyecto nuevo si ya existe uno");

    const secretsCall = mock.calls.find(
      (c) => c.url.endsWith("/configs/config/secrets") && c.method === "POST"
    );
    assert(!!secretsCall, "el upsert de secrets se debe correr siempre, exista o no el proyecto");
  } finally {
    mock.restore();
  }
}
