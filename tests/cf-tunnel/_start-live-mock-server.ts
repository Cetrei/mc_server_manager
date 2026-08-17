import { startMockMinecraftServer, type MockMinecraftServerHandle } from "../_shared/mock-minecraft-server";

/**
 * Helper de remote-e2e.test.ts: levanta el mock server en el puerto local
 * que el túnel de Cloudflare ya tiene configurado como ingress TCP
 * (MC_TUNNEL_LOCAL_PORT), para que las conexiones que entren por el
 * hostname público real (MC_TUNNEL_TEST_DOMAIN) tengan algo escuchando del
 * lado local. No es un test en sí -- prefijo `_`, el runner lo ignora.
 */
export async function startLiveMockServer(env: NodeJS.ProcessEnv = process.env): Promise<MockMinecraftServerHandle> {
  const port = Number(env.MC_TUNNEL_LOCAL_PORT ?? "25565");
  return startMockMinecraftServer(port);
}
