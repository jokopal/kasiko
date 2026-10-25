// Runs the pgTAP suites in supabase/tests against the Supabase project without Docker
// (decision #33). Every file is one transaction ending in ROLLBACK, so no test row is ever
// kept. The connection string comes from the environment, never from the repo:
//
//   node --env-file=.env.bootstrap scripts/db-test.ts
//
// SUPABASE_DB_URL = session pooler URL (the direct db.<ref> host is IPv6-only).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Butuh SUPABASE_DB_URL (session pooler) di environment')
  process.exit(1)
}

const dir = 'supabase/tests'
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.sql'))
  .sort()

let ok = 0
let problems = 0
for (const name of files) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    // A multi-statement script yields one result per statement.
    const results = ([] as pg.QueryResult<Record<string, unknown>>[]).concat(
      await client.query<Record<string, unknown>>(readFileSync(join(dir, name), 'utf8')),
    )
    const lines = results
      .flatMap((r) => r.rows)
      .map((row) => {
        const value = Object.values(row)[0]
        return typeof value === 'string' ? value : ''
      })
    const passed = lines.filter((line) => line.startsWith('ok')).length
    const bad = lines.filter(
      (line) => line.startsWith('not ok') || /^# (Looks like|Failed)/.test(line),
    )
    ok += passed
    problems += bad.length
    console.log(`${name}: ${passed} ok${bad.length ? `, ${bad.length} masalah` : ''}`)
    for (const line of bad) console.log(`   ${line}`)
  } catch (error) {
    problems += 1
    console.log(`${name}: ERROR ${error instanceof Error ? error.message : String(error)}`)
    await client.query('rollback').catch(() => undefined)
  } finally {
    await client.end()
  }
}
console.log(`Total: ${ok} ok, ${problems} masalah`)
process.exitCode = problems > 0 ? 1 : 0
