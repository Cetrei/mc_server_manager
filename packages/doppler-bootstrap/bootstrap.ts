const DOPPLER_API_BASE = "https://api.doppler.com/v3";

export interface BootstrapDopplerProjectInput {
  apiToken: string;
  projectName: string;
  configName: string;
  secrets: Record<string, string>;
}

export interface BootstrapDopplerProjectResult {
  projectSlug: string;
  configName: string;
}

interface DopplerErrorResponse {
  messages?: string[];
}

async function dopplerRequest<T>(
  path: string,
  apiToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${DOPPLER_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as DopplerErrorResponse;
    const detail = errorBody.messages?.join("; ") ?? response.statusText;
    throw new Error(`Doppler API error en ${path}: ${detail}`);
  }

  return (await response.json()) as T;
}

interface DopplerProject {
  slug: string;
  name: string;
}

async function findExistingProject(
  input: BootstrapDopplerProjectInput
): Promise<DopplerProject | null> {
  const response = await fetch(
    `${DOPPLER_API_BASE}/projects/project?project=${encodeURIComponent(input.projectName)}`,
    {
      headers: { Authorization: `Bearer ${input.apiToken}` },
    }
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as DopplerErrorResponse;
    const detail = errorBody.messages?.join("; ") ?? response.statusText;
    throw new Error(`Doppler API error al buscar el proyecto: ${detail}`);
  }

  const body = (await response.json()) as { project: DopplerProject };
  return body.project;
}

async function createProject(input: BootstrapDopplerProjectInput): Promise<DopplerProject> {
  const body = await dopplerRequest<{ project: DopplerProject }>("/projects", input.apiToken, {
    method: "POST",
    body: JSON.stringify({ name: input.projectName }),
  });
  return body.project;
}

async function upsertSecrets(
  input: BootstrapDopplerProjectInput,
  projectSlug: string
): Promise<void> {
  await dopplerRequest("/configs/config/secrets", input.apiToken, {
    method: "POST",
    body: JSON.stringify({
      project: projectSlug,
      config: input.configName,
      secrets: input.secrets,
    }),
  });
}

/**
 * Crea (o reutiliza, si ya existe por nombre) el proyecto Doppler y hace
 * upsert de los secretos recibidos como input (ej. el token del túnel de
 * Cloudflare producido por bootstrapCloudflareTunnel). El upsert de secretos
 * siempre corre, exista o no el proyecto de antes: es la forma en que este
 * paquete queda idempotente sin necesitar diffear el estado remoto.
 */
export async function bootstrapDopplerProject(
  input: BootstrapDopplerProjectInput
): Promise<BootstrapDopplerProjectResult> {
  const existingProject = await findExistingProject(input);
  const project = existingProject ?? (await createProject(input));

  await upsertSecrets(input, project.slug);

  return {
    projectSlug: project.slug,
    configName: input.configName,
  };
}
