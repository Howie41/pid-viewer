import { PidFrameParser } from '@/protocol/pidProtocol'
import type { ReceivedFrame } from '@/protocol/pidProtocol'

type SerialOptions = {
  baudRate: number
  dataBits?: 7 | 8
  stopBits?: 1 | 2
  parity?: 'none' | 'even' | 'odd'
  flowControl?: 'none' | 'hardware'
}

type WebSerialPort = {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: SerialOptions): Promise<void>
  close(): Promise<void>
}

type WebSerialApi = {
  requestPort(): Promise<WebSerialPort>
}

type SerialNavigator = Navigator & {
  serial?: WebSerialApi
}

export type PidSerialTransportOptions = {
  onFrame: (frame: ReceivedFrame) => void
  onError: (error: Error) => void
  onDisconnect: () => void
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

export class PidSerialTransport {
  private readonly parser = new PidFrameParser()
  private port: WebSerialPort | undefined
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined
  private readTask: Promise<void> | undefined
  private closing = false
  private writeQueue = Promise.resolve()

  constructor(private readonly options: PidSerialTransportOptions) {}

  static isSupported() {
    return 'serial' in navigator
  }

  async connect() {
    const serial = (navigator as SerialNavigator).serial
    if (!serial) throw new Error('当前浏览器不支持 Web Serial API')
    if (this.port) return

    this.closing = false
    this.parser.reset()
    const port = await serial.requestPort()
    await port.open({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    })

    if (!port.readable || !port.writable) {
      await port.close()
      throw new Error('串口数据流不可用')
    }

    this.port = port
    this.writer = port.writable.getWriter()
    this.readTask = this.readLoop()
  }

  send(bytes: Uint8Array) {
    const operation = this.writeQueue.then(async () => {
      if (!this.writer) throw new Error('串口尚未连接')
      await this.writer.write(bytes)
    })
    this.writeQueue = operation.catch(() => undefined)
    return operation
  }

  async disconnect() {
    if (!this.port) return

    this.closing = true
    try {
      await this.reader?.cancel()
    } catch {
      // The read loop may already have released the reader.
    }
    await this.readTask?.catch(() => undefined)

    this.writer?.releaseLock()
    this.writer = undefined

    const port = this.port
    this.port = undefined
    await port.close()
    this.parser.reset()
  }

  private async readLoop() {
    try {
      while (!this.closing && this.port?.readable) {
        const reader = this.port.readable.getReader()
        this.reader = reader
        try {
          while (!this.closing) {
            const { value, done } = await reader.read()
            if (done) break
            if (!value) continue
            for (const frame of this.parser.push(value)) this.options.onFrame(frame)
          }
        } finally {
          reader.releaseLock()
          if (this.reader === reader) this.reader = undefined
        }
      }
    } catch (error) {
      if (!this.closing) this.options.onError(asError(error))
    } finally {
      if (!this.closing) this.options.onDisconnect()
    }
  }
}
