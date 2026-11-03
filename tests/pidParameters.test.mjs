import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { setTimeout, clearTimeout } from 'node:timers'
import vm from 'node:vm'
import ts from 'typescript'

const requirePackage = createRequire(import.meta.url)
const { createPinia, setActivePinia } = requirePackage('pinia')

function loadTypeScript(path, dependencies = {}) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url))
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText
  const module = { exports: {} }
  vm.runInThisContext(`(function(require, module, exports) {${output}\n})`, { filename })(
    (name) => dependencies[name] ?? requirePackage(name),
    module,
    module.exports,
  )
  return module.exports
}

const protocol = loadTypeScript('src/protocol/pidProtocol.ts')
const { FrameType, AckStatus, PidInfoStatus } = protocol
let device

class MockTransport {
  static isSupported() {
    return true
  }
  constructor(options) {
    this.options = options
    this.writes = []
    // Expose the mock endpoint to drive asynchronous responses in the tests.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    device = this
  }
  async connect() {}
  async disconnect() {
    this.options.onDisconnect()
  }
  async send(bytes) {
    this.writes.push(bytes)
    const type = bytes[1] ^ protocol.FRAME_TYPE_MASK
    if (this.respond) return this.respond(type, bytes)
    if (type === FrameType.ReadPid) {
      this.options.onFrame({
        type: FrameType.PidInfo,
        status: bytes[2] === 0 ? PidInfoStatus.Ok : PidInfoStatus.NotFound,
        pidId: bytes[2],
        name: 'Motor',
        kp: 1,
        ki: 0.5,
        kd: 0.25,
      })
    } else if (type === FrameType.SelectChannels) {
      this.options.onFrame({
        type: FrameType.Ack,
        commandType: type,
        status: AckStatus.Ok,
        pidId: 255,
        kp: 0,
        ki: 0,
        kd: 0,
      })
    }
  }
}

globalThis.window = { setTimeout, clearTimeout }
const { usePidStore } = loadTypeScript('src/stores/pid.ts', {
  '@/protocol/pidProtocol': protocol,
  '@/services/pidSerialTransport': { PidSerialTransport: MockTransport },
  '@/services/pidTestDataSource': { PidTestDataSource: class {} },
})

function ack(status, kp = 2, ki = 0.75, kd = 0.125) {
  return { type: FrameType.Ack, commandType: FrameType.SetPid, status, pidId: 0, kp, ki, kd }
}

test('SET_PID matches the documented bytes and rejects invalid float32 values', () => {
  assert.equal(
    Buffer.from(protocol.encodeSetPid(0, 1, 0.5, 0.25)).toString('hex'),
    'a559000000803f0000003f0000803e58f9',
  )
  for (const value of [NaN, Infinity, -Infinity, 1e40]) {
    assert.throws(() => protocol.encodeSetPid(0, value, 0, 0), /float32/)
  }
  for (const id of [-1, 255, 256, 0.5]) {
    assert.throws(() => protocol.encodeSetPid(id, 1, 0, 0), /PID/)
  }
})

test('ACK decoding supports fragmented input and ignores corrupt CRC', () => {
  const bytes = new Uint8Array(21)
  bytes.set([0xa5, 0xd9, 0x03, 0, 0])
  const view = new DataView(bytes.buffer)
  view.setFloat32(5, 2, true)
  view.setFloat32(9, 0.75, true)
  view.setFloat32(13, 0.125, true)
  view.setUint16(19, protocol.crc16CcittFalse(bytes.subarray(1, 19)), true)
  const parser = new protocol.PidFrameParser()
  assert.deepEqual(parser.push(bytes.slice(0, 8)), [])
  assert.deepEqual(parser.push(bytes.slice(8)), [ack(AckStatus.Ok)])
  bytes[19] ^= 1
  assert.deepEqual(parser.push(bytes), [])
})

test('parameter requests use ACK values, reject concurrent requests and recover after errors', async () => {
  setActivePinia(createPinia())
  const store = usePidStore()
  await store.connect()
  assert.equal(store.connected, true)
  assert.deepEqual(
    store.channels.map((channel) => channel.pidId),
    [0, 255, 255, 255],
  )

  device.respond = () => {}
  const pending = store.setPid(0, 3, 1, 0)
  assert.equal(store.requestPending, true)
  await assert.rejects(store.setPid(0, 4, 1, 0), /等待/)
  await assert.rejects(store.selectChannels([0, 255, 255, 255]), /等待/)
  device.options.onFrame({ ...ack(AckStatus.Ok), pidId: 1 })
  assert.equal(store.requestPending, true)
  device.options.onFrame(ack(AckStatus.Ok))
  await pending
  assert.equal(store.requestPending, false)
  assert.equal(store.getInstance(0).kp, 2)

  device.respond = () => device.options.onFrame(ack(AckStatus.InvalidParameter, 1.5))
  await assert.rejects(store.setPid(0, -10, 1, 0), /参数非法/)
  assert.equal(store.getInstance(0).kp, 1.5)
  device.respond = () => device.options.onFrame(ack(AckStatus.PidNotFound, 0, 0, 0))
  await assert.rejects(store.setPid(0, 2, 1, 0), /不存在/)
  assert.equal(store.getInstance(0).kp, 1.5)

  device.respond = () => {}
  await assert.rejects(store.setPid(0, 2, 1, 0), /超时/)
  assert.equal(store.requestPending, false)
  device.respond = () => {
    throw new Error('write failed')
  }
  await assert.rejects(store.setPid(0, 2, 1, 0), /write failed/)
  assert.equal(store.requestPending, false)

  device.respond = () => {}
  const interrupted = store.setPid(0, 2, 1, 0)
  const rejected = assert.rejects(interrupted, /断开/)
  await store.disconnect()
  await rejected
  assert.equal(store.requestPending, false)
  await assert.rejects(store.setPid(0, 2, 1, 0), /尚未连接/)
})

test('opening the editor reads fresh device parameters without clearing live values', async () => {
  setActivePinia(createPinia())
  const store = usePidStore()
  await store.connect()
  store.getInstance(0).ref = 12
  store.getInstance(0).measure = 10
  device.respond = (type, bytes) => {
    assert.equal(type, FrameType.ReadPid)
    assert.equal(bytes[2], 0)
    device.options.onFrame({
      type: FrameType.PidInfo,
      status: PidInfoStatus.Ok,
      pidId: 0,
      name: 'Motor',
      kp: 4,
      ki: 2,
      kd: 0.125,
    })
  }
  const response = await store.refreshPidParameters(0)
  assert.deepEqual([response.kp, response.ki, response.kd], [4, 2, 0.125])
  assert.deepEqual(
    [store.getInstance(0).kp, store.getInstance(0).ref, store.getInstance(0).measure],
    [4, 12, 10],
  )
  device.respond = () =>
    device.options.onFrame({
      type: FrameType.PidInfo,
      status: PidInfoStatus.NotFound,
      pidId: 0,
    })
  await assert.rejects(store.refreshPidParameters(0), /不存在/)
  await assert.rejects(store.refreshPidParameters(255), /无效/)
  await store.disconnect()
  await assert.rejects(store.refreshPidParameters(0), /尚未连接/)
})
