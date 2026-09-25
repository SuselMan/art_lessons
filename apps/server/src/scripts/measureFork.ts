/** (#568, ADR 014 §5) Замер форка урока целиком: сколько стоит скопировать
 *  урок из N досок по M резидентных операций и по снапшоту на слой, и
 *  укладывается ли это в 30-секундный таймаут транзакции форка
 *  (forkRoutes.ts). Скрипт, а не тест — по той же причине, что и
 *  measureRoomMemory.ts: ответ «сколько» зависит от железа и формы данных,
 *  закоммитить можно только способ его получить.
 *
 *  Меряется настоящий маршрут через `app.inject`, а не копия его логики:
 *  именно та транзакция, у которой стоит таймаут.
 *
 *  Запуск (из apps/server, DATABASE_URL — изолированная база, скрипт создаёт
 *  и удаляет свои строки):
 *
 *    node --env-file=.env --import tsx src/scripts/measureFork.ts --boards 5 --ops 2000 --snapshot-mb 1
 *
 *  Снапшоты засеваются с seq 0, так что ни одна операция не считается
 *  покрытой — худший случай, когда копируется и весь резидентный лог, и
 *  пиксели каждого слоя. */

import { randomBytes, randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import type { Prisma } from '@prisma/client'

import { isForkSeedUser } from '@grafetto/shared'
import { prisma } from '../prisma.js'
import { registerForkRoutes } from '../forkRoutes.js'

const OWNER_ID = 'measure-fork-owner'
const LAYERS = ['measure-layer-a', 'measure-layer-b']

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : Number(process.argv[index + 1])
}

/** Roughly what a real stroke row weighs: ~150 points with pressure, ~5 KB
 *  of JSON. The route rewrites `id`/`userId` and stores the rest verbatim. */
function strokeData(id: string, seq: number, layerId: string): Prisma.InputJsonObject {
  const points = Array.from({ length: 150 }, (_, i) => ({ x: 100 + i * 2.37, y: 200 + Math.sin(i / 7) * 40, p: 0.5 + (i % 5) / 10 }))
  return { id, type: 'stroke', userId: OWNER_ID, seq, layerId, tool: 'pencil', points }
}

async function seedBoard(boardId: string, ops: number, snapshotBytes: number): Promise<void> {
  await prisma.operation.createMany({
    data: Array.from({ length: ops }, (_, i) => {
      const id = randomUUID()
      const layerId = LAYERS[i % LAYERS.length]
      return { id, seq: i + 1, type: 'stroke', roomId: boardId, userId: OWNER_ID, layerId, tool: 'pencil', data: strokeData(id, i + 1, layerId) }
    }),
  })
  for (const layerId of LAYERS) {
    await prisma.roomLayerSnapshot.create({
      data: { roomId: boardId, layerId, seq: 0, data: randomBytes(snapshotBytes), hash: `h-${boardId}-${layerId}` },
    })
  }
  await prisma.roomLayerState.create({ data: { roomId: boardId, seq: ops, state: { items: {}, order: LAYERS } } })
}

async function main(): Promise<void> {
  const boards = arg('boards', 5)
  const ops = arg('ops', 2000)
  const snapshotBytes = Math.round(arg('snapshot-mb', 1) * 1024 * 1024)

  await prisma.user.upsert({ where: { id: OWNER_ID }, create: { id: OWNER_ID }, update: {} })
  const lessonId = `mf-${randomUUID().slice(0, 8)}`
  const base = { paper: 'coarse', paperColor: '#f5f0e6', infinite: false, canvasWidth: 1240, canvasHeight: 1754, ownerId: OWNER_ID }
  await prisma.room.create({ data: { id: lessonId, name: 'measure lesson', ...base } })
  const boardIds = [lessonId]
  for (let i = 1; i < boards; i++) {
    const id = randomUUID()
    await prisma.room.create({ data: { id, name: `board ${i + 1}`, lessonId, boardOrder: i, ...base } })
    boardIds.push(id)
  }
  await prisma.room.update({ where: { id: lessonId }, data: { activeBoardId: boardIds[boardIds.length - 1] } })
  const seedStart = performance.now()
  for (const id of boardIds) await seedBoard(id, ops, snapshotBytes)
  console.log(`seeded ${boards} boards × ${ops} ops × ${LAYERS.length} snapshots of ${(snapshotBytes / 1024 / 1024).toFixed(1)} MB in ${((performance.now() - seedStart) / 1000).toFixed(1)} s`)

  const app = Fastify()
  app.addHook('preHandler', async request => { request.userId = OWNER_ID })
  registerForkRoutes(app)

  let forkId: string | null = null
  try {
    const start = performance.now()
    const res = await app.inject({ method: 'POST', url: `/api/rooms/${lessonId}/fork`, payload: { scope: 'lesson' } })
    const elapsed = performance.now() - start
    if (res.statusCode !== 201) throw new Error(`fork answered ${res.statusCode}: ${res.body}`)
    forkId = (res.json() as { room: { id: string } }).room.id

    const copiedBoards = await prisma.room.findMany({ where: { OR: [{ id: forkId }, { lessonId: forkId }] }, select: { id: true } })
    const copiedIds = copiedBoards.map(b => b.id)
    const [copiedOps, copiedSnapshots] = await Promise.all([
      prisma.operation.count({ where: { roomId: { in: copiedIds } } }),
      prisma.roomLayerSnapshot.count({ where: { roomId: { in: copiedIds } } }),
    ])
    console.log(`fork of ${boards} boards: ${(elapsed / 1000).toFixed(2)} s total (${(elapsed / boards / 1000).toFixed(2)} s per board)`)
    console.log(`copy holds ${copiedBoards.length} boards, ${copiedOps} operations, ${copiedSnapshots} snapshots`)

    // The copy is rewritten inside Postgres; check on one row that the
    // identity rewrite reached the payload, not only the columns.
    const sample = await prisma.operation.findFirst({ where: { roomId: forkId }, orderBy: { seq: 'asc' } })
    const data = sample?.data as { id?: string; userId?: string; seq?: number } | undefined
    const rewritten = !!sample && data?.id === sample.id && isForkSeedUser(sample.userId) && data?.userId === sample.userId && data?.seq === sample.seq
    console.log(`sample row rewritten inside payload: ${rewritten ? 'yes' : 'NO — inspect'}`)
  } finally {
    await app.close()
    await prisma.room.deleteMany({ where: { id: { in: [lessonId, ...(forkId ? [forkId] : [])] } } })
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
