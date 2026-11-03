export type FormattedLogRow = Readonly<{ receivedAt: number; fields: readonly string[] }>

function quoteCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function createLogCsv(rows: readonly FormattedLogRow[]) {
  const fieldCount = rows.reduce((max, row) => Math.max(max, row.fields.length - 1), 0)
  const headers = [
    '接收时间 (UTC)',
    ...Array.from({ length: fieldCount }, (_, index) => `日志字段 ${index + 1}`),
  ]
  const lines = [headers.map(quoteCsv).join(',')]

  for (const row of rows) {
    const cells = [new Date(row.receivedAt).toISOString()]
    for (let index = 1; index <= fieldCount; index++) cells.push(row.fields[index] ?? '')
    lines.push(cells.map(quoteCsv).join(','))
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function downloadLogCsv(rows: readonly FormattedLogRow[]) {
  const blob = new Blob([createLogCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `debug-logs-${new Date().toISOString().replaceAll(':', '-')}.csv`
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
