import { startLiveMockServer } from "./_start-live-mock-server";
import { connectAndHandshake } from "../_shared/mock-minecraft-client";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const DEFAULT_REMOTE_PORT = 25565;
const CONNECT_TIMEOUT_MS = 10000; // generoso: la ruta real cruza el túnel de Cloudflare, no localhost
const HANDSHAKE_TIMEOUT_MS = 10000;

/**
 * E2E real: conecta contra el hostname público del túnel (MC_TUNNEL_TEST_DOMAIN)
 * en vez de localhost, con un mock server real escuchando del lado local en
 * MC_TUNNEL_LOCAL_PORT (ver _start-live-mock-server.ts). Verifica que el
 * handshake de Minecraft cruce el túnel de punta a punta.
 *
 * Requiere infraestructura real (túnel activo apuntando a este host, DNS
 * resuelto) -- no es parte del set mock/offline. Sigue el contrato de
 * docs/standards/testing.md: si MC_TUNNEL_TEST_DOMAIN no está seteada, el
 * test se salta (log informativo + return, sin throw) en vez de fallar, para
 * no romper `bun run test` en un checkout limpio sin esa infraestructura.
 */
export default async function run() {
  const testDomain = process.env.MC_TUNNEL_TEST_DOMAIN;

  if (!testDomain) {
    console.log(
      "    (saltado: MC_TUNNEL_TEST_DOMAIN no está seteada -- ver tests/README.md para correr este test contra el túnel real)"
    );
    return;
  }

  const remotePort = Number(process.env.MC_TUNNEL_TEST_PORT ?? DEFAULT_REMOTE_PORT);
  const server = await startLiveMockServer();

  try {
    const result = await connectAndHandshake({
      host: testDomain,
      port: remotePort,
      username: "E2EPlayer",
      playerUuid: "550e8400-e29b-41d4-a716-446655440099",
      connectTimeoutMs: CONNECT_TIMEOUT_MS,
      handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
    });

    assert(result.bytesEchoed > 0, "no se recibió eco del handshake a través del túnel real");
    assert(
      server.connectionsAccepted === 1,
      `el mock server local debió aceptar exactamente 1 conexión entrante por el túnel, aceptó ${server.connectionsAccepted}`
    );

    console.log(
      `    (conectado vía ${testDomain}:${remotePort}, connect: ${result.connectMs.toFixed(1)}ms, handshake: ${result.handshakeRoundTripMs.toFixed(1)}ms)`
    );
  } finally {
    await server.close();
  }
}
