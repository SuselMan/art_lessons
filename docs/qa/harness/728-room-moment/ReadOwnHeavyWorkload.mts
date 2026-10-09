/** Read-only own QA rooms; never emits credentials or raw operation data. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { strokeDabs } from '@grafetto/shared'
import { mottleSeedFromStrokeId } from '../../../../apps/web/src/engine/src/presets/watercolorPresets.ts'
const container = 'grafetto_pg_728_callgraph'
const inspect = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
const env = new Map<string, string>((inspect.Config.Env as string[]).map(text => { const i = text.indexOf('='); return [text.slice(0, i), text.slice(i + 1)] }))
const user = env.get('POSTGRES_USER'), database = env.get('POSTGRES_DB')
if (!user || !database || !/^[A-Za-z0-9_]+$/.test(user) || !/^[A-Za-z0-9_]+$/.test(database)) throw Error('Named safe QA DB identity required')
const query = `SELECT coalesce(jsonb_agg(jsonb_build_object('roomId',"roomId",'seq',seq,'data',data) ORDER BY "roomId",seq),'[]') FROM "Operation" WHERE "roomId" IN ('ZI8qE1XM','urxtjjE1') AND data->>'type'='stroke'`
const rows = JSON.parse(execFileSync('docker', ['exec', container, 'psql', '-U', user, '-d', database, '-At', '-c', query], { encoding: 'utf8' }))
if (rows.length !== 4) throw Error('Expected two owned strokes per arm')
const report = rows.map(({ roomId, seq, data: op }: any) => {
 const dabs = strokeDabs(op), bound = (key: string) => [Math.min(...dabs.map((d: any) => d[key])), Math.max(...dabs.map((d: any) => d[key]))]
 let length = 0; for (let i = 1; i < dabs.length; i++) length += Math.hypot(dabs[i].x - dabs[i - 1].x, dabs[i].y - dabs[i - 1].y)
 return { arm: roomId === 'ZI8qE1XM' ? 'OFF' : 'ON', seq, strokeId: op.strokeId, seed: mottleSeedFromStrokeId(op.strokeId), preset: op.preset, color: op.color, dabCount: dabs.length, arcLengthWorld: length, boundsXY: { x: bound('x'), y: bound('y') }, pressure: bound('pressure'), size: bound('size'), time: bound('t'), wetLength: op.wet?.length ?? 0, packedSHA: createHash('sha256').update(op.dabsPacked ?? JSON.stringify(op.dabs)).digest('hex') }
})
const output = { scope: 'Read-only QA persisted authored strokes; different live trajectories/seeds, not paired material/performance proof', codecSourceSHA: createHash('sha256').update(fs.readFileSync('packages/shared/src/dabCodec.ts')).digest('hex'), strokes: report }
fs.writeFileSync('docs/qa/harness/728-room-moment/mixed-heavy-workload-comparison.json', JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output))
