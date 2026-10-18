// A node:test reporter for GitHub Actions: each failing test becomes an
// error annotation on the run (readable without downloading logs).
export default async function * ciReporter (source) {
  for await (const event of source) {
    if (event.type !== 'test:fail' || event.data.details?.type === 'suite') continue
    const err = event.data.details?.error
    const cause = err?.cause || err
    const msg = String(cause?.message || err?.message || 'failed').replace(/\r?\n/g, '%0A').slice(0, 900)
    const where = String(cause?.stack || '').split('\n').find((l) => l.includes('test')) || ''
    yield `::error title=${process.platform}: ${event.data.name.replace(/[,:]/g, ' ')}::${msg} ${where.trim()}\n`
  }
}
