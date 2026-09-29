import type { Participant } from '@grafetto/shared'

import { isIdle, rooms } from './roomRegistry.js'
import { isCoveredBySnapshot } from './snapshotCoverage.js'

/** (#612) Read-only views over the resident rooms, for whoever watches the
 *  server rather than draws on it: the health route and the memory gate
 *  (#415), the snapshot-lag watch (#480), the admin panel (#586). Nothing here
 *  changes a record. Moved out of rooms.ts. */

/** (#415, трек #314 §1) Сколько эта карта сейчас держит. До этого числа
 *  наружу не выходило вообще: `rooms` — приватная константа модуля, и
 *  `rooms.size` не читал ни один файл в проекте, то есть «сколько комнат
 *  держит коробка» нельзя было ни спросить у живого прода, ни отследить во
 *  времени.
 *
 *  `idle` считается отдельно от `total` не для симметрии: резидентная комната
 *  без участников — это либо гонка отложенного вытеснения (`evictWhenIdle`
 *  ждёт записи, а перепроверка после ожидания видит уже не тот состав), либо
 *  комната, удалённая через `DELETE /api/rooms/:id` из-под живого участника.
 *  Обе — течи, и ненулевой `idle` на спокойном сервере есть их единственный
 *  внешний признак.
 *
 *  Байты сознательно не оцениваются. Честно их знает только куча (см.
 *  memory.ts), а посчитать вес `operations` можно лишь сериализацией — то
 *  есть построив в памяти копию ровно того, что мы боимся не уместить. */
export function getResidentRoomStats(): { total: number; idle: number; operations: number } {
  let idle = 0
  let operations = 0
  for (const record of rooms.values()) {
    operations += record.operations.length
    if (isIdle(record)) idle += 1
  }
  return { total: rooms.size, idle, operations }
}

/** (#480) Сколько операций пришлось бы проиграть заново тому, кто входит в
 *  комнату прямо сейчас — то есть чего снапшоты ещё не покрывают.
 *
 *  Это ровно тот же фильтр, которым `getRoomSnapshot` собирает `tailOperations`
 *  для входящего с чистого листа, и намеренно он же, а не своя мерка: покрытие
 *  здесь величина по слоям (см. `coveredSeqByLayer`), и всякая попытка свернуть
 *  её в одно room-wide число — это механизм потери содержимого из #369.
 *  Сторожу (`snapshotLagWatch.ts`) нужна цена перезахода, и она тут не
 *  приближение, а она сама.
 *
 *  `undefined` для нерезидентной комнаты — спрашивать про неё нечего. */
export function getRoomBacklog(roomId: string): {
  roomId: string; participants: number; latestSeq: number; uncoveredOps: number
} | undefined {
  const record = rooms.get(roomId)
  if (!record) return undefined
  let uncoveredOps = 0
  for (const op of record.operations) {
    if (!isCoveredBySnapshot(
      record.coveredSeqByLayer, op, record.layerStateSeq, record.layerStateIds, undefined,
      id => record.operationsById.get(id))) {
      uncoveredOps += 1
    }
  }
  return {
    roomId,
    // (#176) Who could bake this board: the sockets on it, not the lesson's
    // whole roster — someone on another board holds none of these pixels.
    participants: record.sockets.size,
    latestSeq: record.nextSeq - 1,
    uncoveredOps,
  }
}

export type LiveLesson = {
  lessonId: string
  name: string
  ownerId: string
  boards: number
  participants: Array<{ userId: string; name: string; role: Participant['role']; boardId: string | undefined }>
}

/** (#586) Lessons somebody is in right now, for the admin panel. Presence is
 *  a fact about the lesson (see `currentSocketForParticipant`), so boards are
 *  not listed on their own — a board is live exactly when someone in its
 *  lesson is on it, and `boardId` says who. */
export function listLiveLessons(): LiveLesson[] {
  const live: LiveLesson[] = []
  for (const record of rooms.values()) {
    if (record.lessonId !== null || record.participants.size === 0) continue
    live.push({
      lessonId: record.room.id,
      name: record.room.name,
      ownerId: record.room.ownerId,
      boards: Math.max(1, record.boards.length),
      participants: [...record.participants.values()].map(p => ({
        userId: p.userId, name: p.name, role: p.role, boardId: p.boardId,
      })),
    })
  }
  return live
}
