import { createServer, type Server, type Socket } from "node:net";

/**
 * Mock de servidor Minecraft para tests de carga/latencia: no implementa el
 * protocolo real del lado servidor (no responde Login Success ni nada del
 * juego) -- solo recibe bytes por conexión y los devuelve (echo), para poder
 * medir latencia y throughput de N conexiones concurrentes sin necesidad de
 * un server real corriendo. Usado por live-players.test.ts y remote-e2e.test.ts.
 */

export interface MockMinecraftServerHandle {
  port: number;
  connectionsAccepted: number;
  bytesReceived: number;
  close: () => Promise<void>;
}

export function startMockMinecraftServer(port = 0): Promise<MockMinecraftServerHandle> {
  return new Promise((resolve, reject) => {
    let connectionsAccepted = 0;
    let bytesReceived = 0;

    const server: Server = createServer((socket: Socket) => {
      connectionsAccepted += 1;
      socket.on("data", (chunk) => {
        bytesReceived += chunk.length;
        socket.write(chunk);
      });
      socket.on("error", () => {
        // Conexión cerrada abruptamente por el cliente -- no es un fallo del
        // mock server, los tests de carga cierran sockets sin FIN limpio.
      });
    });

    server.on("error", reject);

    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("startMockMinecraftServer: no se pudo determinar el puerto asignado"));
        return;
      }

      resolve({
        port: address.port,
        get connectionsAccepted() {
          return connectionsAccepted;
        },
        get bytesReceived() {
          return bytesReceived;
        },
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => (err ? rejectClose(err) : resolveClose()));
          }),
      } as MockMinecraftServerHandle);
    });
  });
}
