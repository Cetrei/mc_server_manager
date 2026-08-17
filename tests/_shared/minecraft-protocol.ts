/**
 * Encoding/decoding mínimo del protocolo Minecraft Java Edition (protocolo
 * documentado públicamente, ver minecraft.wiki/w/Protocol). Cubre solo lo
 * necesario para el handshake de conexión (VarInt, paquete Handshake,
 * paquete Login Start) -- no implementa el protocolo completo.
 */

const VARINT_SEGMENT_BITS = 0x7f;
const VARINT_CONTINUE_BIT = 0x80;

export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value >>> 0;

  do {
    let byte = remaining & VARINT_SEGMENT_BITS;
    remaining >>>= 7;
    if (remaining !== 0) {
      byte |= VARINT_CONTINUE_BIT;
    }
    bytes.push(byte);
  } while (remaining !== 0);

  return Buffer.from(bytes);
}

export interface DecodedVarInt {
  value: number;
  bytesRead: number;
}

export function decodeVarInt(buffer: Buffer, offset = 0): DecodedVarInt {
  let value = 0;
  let position = 0;
  let bytesRead = 0;

  for (;;) {
    if (offset + bytesRead >= buffer.length) {
      throw new Error("decodeVarInt: buffer incompleto, faltan bytes");
    }
    const byte = buffer[offset + bytesRead];
    bytesRead += 1;
    value |= (byte & VARINT_SEGMENT_BITS) << position;

    if ((byte & VARINT_CONTINUE_BIT) === 0) break;

    position += 7;
    if (position >= 32) {
      throw new Error("decodeVarInt: VarInt demasiado largo (más de 5 bytes)");
    }
  }

  return { value, bytesRead };
}

function encodeString(value: string): Buffer {
  const utf8 = Buffer.from(value, "utf-8");
  return Buffer.concat([encodeVarInt(utf8.length), utf8]);
}

function encodeUnsignedShort(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

/**
 * Envuelve el contenido de un paquete con su VarInt de longitud (largo
 * total del paquete, sin contar el propio VarInt de longitud) -- formato
 * estándar de framing del protocolo Minecraft sobre TCP.
 */
export function framePacket(packetId: number, payload: Buffer): Buffer {
  const body = Buffer.concat([encodeVarInt(packetId), payload]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}

const HANDSHAKE_PACKET_ID = 0x00;
const LOGIN_START_PACKET_ID = 0x00;
const NEXT_STATE_LOGIN = 2;
const NEXT_STATE_STATUS = 1;

export interface HandshakeParams {
  protocolVersion: number;
  serverAddress: string;
  serverPort: number;
  nextState: typeof NEXT_STATE_LOGIN | typeof NEXT_STATE_STATUS;
}

export function buildHandshakePacket(params: HandshakeParams): Buffer {
  const payload = Buffer.concat([
    encodeVarInt(params.protocolVersion),
    encodeString(params.serverAddress),
    encodeUnsignedShort(params.serverPort),
    encodeVarInt(params.nextState),
  ]);
  return framePacket(HANDSHAKE_PACKET_ID, payload);
}

export function buildLoginStartPacket(username: string, playerUuid: string): Buffer {
  const uuidHex = playerUuid.replace(/-/g, "");
  const uuidBuffer = Buffer.from(uuidHex, "hex");
  const payload = Buffer.concat([encodeString(username), uuidBuffer]);
  return framePacket(LOGIN_START_PACKET_ID, payload);
}

/**
 * Handshake mínimo de login: paquete Handshake (nextState=login) seguido
 * del paquete Login Start, concatenados como un único write TCP -- así es
 * como un cliente real los envía (sin esperar respuesta entre ambos).
 */
export function buildLoginHandshake(params: {
  protocolVersion: number;
  serverAddress: string;
  serverPort: number;
  username: string;
  playerUuid: string;
}): Buffer {
  const handshake = buildHandshakePacket({
    protocolVersion: params.protocolVersion,
    serverAddress: params.serverAddress,
    serverPort: params.serverPort,
    nextState: NEXT_STATE_LOGIN,
  });
  const loginStart = buildLoginStartPacket(params.username, params.playerUuid);
  return Buffer.concat([handshake, loginStart]);
}

export { NEXT_STATE_LOGIN, NEXT_STATE_STATUS };
