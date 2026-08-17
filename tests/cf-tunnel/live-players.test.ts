import { startMockMinecraftServer } from "../_shared/mock-minecraft-server";
import { connectAndHandshake } from "../_shared/mock-minecraft-client";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const PLAYER_COUNT = 10;
const MAX_ACCEPTABLE_HANDSHAKE_MS = 500; // generoso para localhost, sirve para detectar regresiones groseras

/**
 * Simula 10 jugadores (1 conexión TCP cada uno) conectando concurrentemente
 * contra el mock server local, verificando que el server acepte las 10
 * conexiones, complete el handshake en cada una, y no tenga degradación de
 * latencia grosera bajo esa concurrencia. No toca red real -- corre contra
 * localhost, mock puro (ver tests/README.md).
 */
export default async function run() {
  const server = await startMockMinecraftServer();

  try {
    const connectionAttempts = Array.from({ length: PLAYER_COUNT }, (_, i) =>
      connectAndHandshake({
        host: "127.0.0.1",
        port: server.port,
        username: `Player${i}`,
        playerUuid: `550e8400-e29b-41d4-a716-44665544000${i}`,
      })
    );

    const results = await Promise.all(connectionAttempts);

    assert(results.length === PLAYER_COUNT, `debieron completarse ${PLAYER_COUNT} handshakes, se completaron ${results.length}`);
    assert(
      server.connectionsAccepted === PLAYER_COUNT,
      `el mock server debió aceptar ${PLAYER_COUNT} conexiones, aceptó ${server.connectionsAccepted}`
    );

    for (const [i, result] of results.entries()) {
      assert(result.bytesEchoed > 0, `jugador ${i}: no recibió eco del handshake`);
      assert(
        result.handshakeRoundTripMs < MAX_ACCEPTABLE_HANDSHAKE_MS,
        `jugador ${i}: handshake tardó ${result.handshakeRoundTripMs.toFixed(1)}ms, excede el máximo de ${MAX_ACCEPTABLE_HANDSHAKE_MS}ms`
      );
    }

    const avgHandshakeMs = results.reduce((sum, r) => sum + r.handshakeRoundTripMs, 0) / results.length;
    console.log(`    (${PLAYER_COUNT} conexiones concurrentes, handshake promedio: ${avgHandshakeMs.toFixed(1)}ms)`);
  } finally {
    await server.close();
  }
}
