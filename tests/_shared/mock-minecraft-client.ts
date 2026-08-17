import { Socket } from "node:net";
import { buildLoginHandshake } from "./minecraft-protocol";

/**
 * Mock de cliente Minecraft: abre un socket TCP crudo, envía el handshake
 * de login (Handshake + Login Start) y mide el tiempo hasta recibir el
 * primer byte de vuelta. Contra el mock server (echo), esto mide RTT de la
 * ruta de red real sin implementar el protocolo de juego completo.
 */

export interface HandshakeConnectionResult {
  connectMs: number;
  handshakeRoundTripMs: number;
  bytesEchoed: number;
}

export interface HandshakeConnectionParams {
  host: string;
  port: number;
  username: string;
  playerUuid: string;
  protocolVersion?: number;
  connectTimeoutMs?: number;
  handshakeTimeoutMs?: number;
}

const DEFAULT_PROTOCOL_VERSION = 767; // Java Edition 1.21.x, valor de referencia del protocolo público
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;

export function connectAndHandshake(params: HandshakeConnectionParams): Promise<HandshakeConnectionResult> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const connectStart = performance.now();
    let connectMs = 0;

    const connectTimeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`connectAndHandshake: timeout de conexión (${params.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS}ms)`));
    }, params.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);

    socket.connect(params.port, params.host, () => {
      clearTimeout(connectTimeout);
      connectMs = performance.now() - connectStart;

      const packet = buildLoginHandshake({
        protocolVersion: params.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
        serverAddress: params.host,
        serverPort: params.port,
        username: params.username,
        playerUuid: params.playerUuid,
      });

      const handshakeStart = performance.now();
      const handshakeTimeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`connectAndHandshake: timeout esperando respuesta (${params.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS}ms)`));
      }, params.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);

      socket.once("data", (chunk) => {
        clearTimeout(handshakeTimeout);
        const handshakeRoundTripMs = performance.now() - handshakeStart;
        socket.destroy();
        resolve({ connectMs, handshakeRoundTripMs, bytesEchoed: chunk.length });
      });

      socket.write(packet);
    });

    socket.on("error", (err) => {
      clearTimeout(connectTimeout);
      reject(err);
    });
  });
}
