import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderQuadlet } from "../../packages/quadlet-render/render";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export default async function run() {
  const workDir = await mkdtemp(join(tmpdir(), "quadlet-render-test-"));
  const templatePath = join(workDir, "test.container.template");
  const outputDir = join(workDir, "output");

  try {
    await writeFile(
      templatePath,
      "Exec=tunnel --no-autoupdate run --token {{CLOUDFLARE_TUNNEL_TOKEN}}\n"
    );

    const result = await renderQuadlet({
      templatePath,
      outputDir,
      env: { CLOUDFLARE_TUNNEL_TOKEN: "mock-token-123" },
    });

    const written = await readFile(result.outputPath, "utf-8");
    assert(
      written.includes("mock-token-123"),
      "el placeholder no se resolvió con el valor del entorno"
    );
    assert(
      result.resolvedVars.includes("CLOUDFLARE_TUNNEL_TOKEN"),
      "resolvedVars no reporta la variable resuelta"
    );

    let thrown: Error | null = null;
    try {
      await renderQuadlet({ templatePath, outputDir, env: {} });
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
    }
    assert(thrown !== null, "el render debió fallar ante una variable faltante");
    assert(
      thrown!.message.includes("CLOUDFLARE_TUNNEL_TOKEN"),
      "el mensaje de error no menciona la variable faltante"
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
