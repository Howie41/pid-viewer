export type PidTestSample = {
  timestamp: number
  ref: number
  measure: number
}

export type PidTestDataSourceOptions = {
  onSample: (sample: PidTestSample) => void
}

const sampleIntervalMs = 10
const stepIntervalMs = 2500

export class PidTestDataSource {
  private timer: number | undefined
  private startedAt = 0
  private previousTick = 0
  private measure = 0

  constructor(private readonly options: PidTestDataSourceOptions) {}

  start() {
    if (this.timer !== undefined) return

    this.startedAt = performance.now()
    this.previousTick = this.startedAt
    this.measure = 0
    this.emitSample()
    this.timer = window.setInterval(() => this.emitSample(), sampleIntervalMs)
  }

  stop() {
    if (this.timer !== undefined) window.clearInterval(this.timer)
    this.timer = undefined
  }

  private emitSample() {
    const now = performance.now()
    const timestamp = Math.round(now - this.startedAt)
    const deltaSeconds = Math.max(0, (now - this.previousTick) / 1000)
    const ref = Math.floor(timestamp / stepIntervalMs) % 2 === 0 ? 30 : -30
    const responseRatio = 1 - Math.exp(-deltaSeconds / 0.3)
    this.measure += (ref - this.measure) * responseRatio
    this.previousTick = now

    this.options.onSample({
      timestamp,
      ref,
      measure: this.measure + Math.sin(timestamp / 180) * 0.35,
    })
  }
}
