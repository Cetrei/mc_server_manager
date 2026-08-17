import {
  encodeVarInt,
  decodeVarInt,
  buildHandshakePacket,
  buildLoginStartPacket,
  buildLoginHandshake,
  NEXT_STATE_LOGIN,
} from "../_shared/minecraft-protocol";
import { startMockMinecraftServer } from "../_shared/mock-minecraft-server";
import { connectAndHandshake } from "../_shared/mock-minecraft-client";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function testVarIntRoundTrip() {
  const cases = [0, 1, 127, 128, 255, 25565, 2097151, 2147483647];
  for (const value of cases) {
    const encoded = encodeVarInt(value);
    const decoded = decodeVarInt(encoded);
    assert(decoded.value === value, `VarInt round-trip falló para ${value}: obtuve ${decoded.value}`);
    assert(decoded.bytesRead === encoded.length, `bytesRead no coincide con el largo real para ${value}`);
  }
}

function testHandshakePacketFraming() {
  const packet = buildHandshakePacket({
    protocolVersion: 767,
    serverAddress: "servermc.cetrei.dev",
    serverPort: 25565,
    nextState: NEXT_STATE_LOGIN,
  });

  const { value: declaredLength, bytesRead: lengthPrefixBytes } = decodeVarInt(packet);
  assert(
    declaredLength === packet.length - lengthPrefixBytes,
    "el VarInt de longitud del paquete no coincide con el tamaño real del cuerpo"
  );

  const { value: packetId } = decodeVarInt(packet, lengthPrefixBytes);
  assert(packetId === 0x00, "el packet ID del Handshake debe ser 0x00");
}

function testLoginStartPacket() {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const packet = buildLoginStartPacket("TestPlayer", uuid);
  assert(packet.length > 0, "el paquete Login Start no debe estar vacío");

  const { value: declaredLength, bytesRead: lengthPrefixBytes } = decodeVarInt(packet);
  assert(
    declaredLength === packet.length - lengthPrefixBytes,
    "el VarInt de longitud del Login Start no coincide con el tamaño real"
  );
}

async function testFullHandshakeAgainstMockServer() {
  const server = await startMockMinecraftServer();

  try {
    const result = await connectAndHandshake({
      host: "127.0.0.1",
      port: server.port,
      username: "TestPlayer",
      playerUuid: "550e8400-e29b-41d4-a716-446655440000",
    });

    assert(result.bytesEchoed > 0, "el mock server debió devolver un eco de los bytes enviados");
    assert(server.connectionsAccepted === 1, "el mock server debió aceptar exactamente 1 conexión");

    const expectedBytes = buildLoginHandshake({
      protocolVersion: 767,
      serverAddress: "127.0.0.1",
      serverPort: server.port,
      username: "TestPlayer",
      playerUuid: "550e8400-e29b-41d4-a716-446655440000",
    }).length;
    assert(
      server.bytesReceived === expectedBytes,
      `el mock server debió recibir ${expectedBytes} bytes, recibió ${server.bytesReceived}`
    );
  } finally {
    await server.close();
  }
}

export default async function run() {
  testVarIntRoundTrip();
  testHandshakePacketFraming();
  testLoginStartPacket();
  await testFullHandshakeAgainstMockServer();
}
