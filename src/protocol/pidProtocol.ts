export const FRAME_SOF = 0xa5
export const FRAME_TYPE_MASK = 0x5a
export const UNUSED_PID_ID = 0xff

export enum FrameType {
  ReadPid = 0x01,
  SelectChannels = 0x02,
  SetPid = 0x03,
  PidInfo = 0x81,
  Monitor = 0x84,
  Ack = 0x83,
}

export enum PidInfoStatus {
  Ok = 0x00,
  NotFound = 0x01,
}

export enum AckStatus {
  Ok = 0x00,
  PidNotFound = 0x01,
  InvalidParameter = 0x02,
  InvalidChannel = 0x03,
  CrcError = 0x04,
  UnsupportedCommand = 0x05,
}

export type PidInfoFrame = {
  type: FrameType.PidInfo
  status: PidInfoStatus
  pidId: number
  name: string
  kp: number
  ki: number
  kd: number
}

export type MonitorChannelValue = {
  pidId: number
  ref: number
  measure: number
}

export type MonitorFrame = {
  type: FrameType.Monitor
  timestamp: number
  channels: MonitorChannelValue[]
}

export type AckFrame = {
  type: FrameType.Ack
  commandType: FrameType.SelectChannels | FrameType.SetPid
  status: AckStatus
  pidId: number
  kp: number
  ki: number
  kd: number
}

export type ReceivedFrame = PidInfoFrame | MonitorFrame | AckFrame

const frameLengths = new Map<FrameType, number>([
  [FrameType.ReadPid, 5],
  [FrameType.SelectChannels, 8],
  [FrameType.SetPid, 17],
  [FrameType.PidInfo, 52],
  [FrameType.Monitor, 44],
  [FrameType.Ack, 21],
])

export class PidProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidProtocolError'
  }
}

export function crc16CcittFalse(bytes: Uint8Array) {
  let crc = 0xffff

  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }

  return crc
}

function encodeFrame(type: FrameType, payload: Uint8Array) {
  const frame = new Uint8Array(payload.length + 4)
  frame[0] = FRAME_SOF
  frame[1] = type ^ FRAME_TYPE_MASK
  frame.set(payload, 2)

  const crc = crc16CcittFalse(frame.subarray(1, frame.length - 2))
  const view = new DataView(frame.buffer)
  view.setUint16(frame.length - 2, crc, true)
  return frame
}

export function encodeReadPid(pidId: number) {
  return encodeFrame(FrameType.ReadPid, Uint8Array.of(pidId))
}

export function encodeSelectChannels(pidIds: readonly number[]) {
  if (pidIds.length !== 4) throw new PidProtocolError('SELECT_CHANNELS 必须包含 4 个通道')
  return encodeFrame(FrameType.SelectChannels, Uint8Array.from(pidIds))
}

export function encodeSetPid(pidId: number, kp: number, ki: number, kd: number) {
  if (!Number.isInteger(pidId) || pidId < 0 || pidId >= UNUSED_PID_ID) {
    throw new PidProtocolError('无效 PID 编号')
  }
  if (![kp, ki, kd].every((value) => Number.isFinite(Math.fround(value)))) {
    throw new PidProtocolError('PID 参数必须是有限的 float32 数值')
  }
  const payload = new Uint8Array(13)
  const view = new DataView(payload.buffer)
  view.setUint8(0, pidId)
  view.setFloat32(1, kp, true)
  view.setFloat32(5, ki, true)
  view.setFloat32(9, kd, true)
  return encodeFrame(FrameType.SetPid, payload)
}

function decodePidInfo(view: DataView, frame: Uint8Array): PidInfoFrame {
  const nameBytes = frame.subarray(4, 36)
  const terminator = nameBytes.indexOf(0)
  const name = new TextDecoder().decode(
    terminator === -1 ? nameBytes : nameBytes.subarray(0, terminator),
  )

  return {
    type: FrameType.PidInfo,
    status: view.getUint8(2) as PidInfoStatus,
    pidId: view.getUint8(3),
    name,
    kp: view.getFloat32(36, true),
    ki: view.getFloat32(40, true),
    kd: view.getFloat32(44, true),
  }
}

function decodeMonitor(view: DataView): MonitorFrame {
  const channels: MonitorChannelValue[] = []

  for (let index = 0; index < 4; index += 1) {
    const offset = 6 + index * 9
    channels.push({
      pidId: view.getUint8(offset),
      ref: view.getFloat32(offset + 1, true),
      measure: view.getFloat32(offset + 5, true),
    })
  }

  return {
    type: FrameType.Monitor,
    timestamp: view.getUint32(2, true),
    channels,
  }
}

function decodeAck(view: DataView): AckFrame {
  return {
    type: FrameType.Ack,
    commandType: view.getUint8(2) as FrameType.SelectChannels | FrameType.SetPid,
    status: view.getUint8(3) as AckStatus,
    pidId: view.getUint8(4),
    kp: view.getFloat32(5, true),
    ki: view.getFloat32(9, true),
    kd: view.getFloat32(13, true),
  }
}

export function decodeFrame(frame: Uint8Array): ReceivedFrame {
  if (frame[0] !== FRAME_SOF) throw new PidProtocolError('无效帧头')

  const type = (frame[1] ^ FRAME_TYPE_MASK) as FrameType
  const expectedLength = frameLengths.get(type)
  if (!expectedLength || frame.length !== expectedLength) throw new PidProtocolError('无效帧长度')

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const expectedCrc = view.getUint16(frame.length - 2, true)
  const actualCrc = crc16CcittFalse(frame.subarray(1, frame.length - 2))
  if (actualCrc !== expectedCrc) throw new PidProtocolError('CRC 校验失败')

  switch (type) {
    case FrameType.PidInfo:
      return decodePidInfo(view, frame)
    case FrameType.Monitor:
      return decodeMonitor(view)
    case FrameType.Ack:
      return decodeAck(view)
    default:
      throw new PidProtocolError(`不支持的接收帧类型：0x${type.toString(16)}`)
  }
}

export class PidFrameParser {
  private buffer = new Uint8Array()

  push(chunk: Uint8Array) {
    const combined = new Uint8Array(this.buffer.length + chunk.length)
    combined.set(this.buffer)
    combined.set(chunk, this.buffer.length)
    this.buffer = combined

    const frames: ReceivedFrame[] = []

    while (this.buffer.length >= 2) {
      const sofIndex = this.buffer.indexOf(FRAME_SOF)
      if (sofIndex === -1) {
        this.buffer = new Uint8Array()
        break
      }
      if (sofIndex > 0) this.buffer = this.buffer.slice(sofIndex)
      if (this.buffer.length < 2) break

      const type = (this.buffer[1] ^ FRAME_TYPE_MASK) as FrameType
      const frameLength = frameLengths.get(type)
      if (!frameLength) {
        this.buffer = this.buffer.slice(1)
        continue
      }
      if (this.buffer.length < frameLength) break

      const candidate = this.buffer.slice(0, frameLength)
      try {
        frames.push(decodeFrame(candidate))
        this.buffer = this.buffer.slice(frameLength)
      } catch {
        this.buffer = this.buffer.slice(1)
      }
    }

    return frames
  }

  reset() {
    this.buffer = new Uint8Array()
  }
}
