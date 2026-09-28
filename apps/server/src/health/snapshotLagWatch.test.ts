import { describe, expect, it } from 'vitest'
import { createSnapshotLagWatch, SNAPSHOT_LAG_THRESHOLD } from './snapshotLagWatch.js'

function backlog(uncoveredOps: number, participants = 2, roomId = 'Igy2jy_i') {
  return { roomId, participants, latestSeq: 1500 + uncoveredOps, uncoveredOps }
}

describe('createSnapshotLagWatch', () => {
  it('молчит, пока снапшоты успевают за комнатой', () => {
    const watch = createSnapshotLagWatch()

    expect(watch.observe(backlog(0))).toBeNull()
    expect(watch.observe(backlog(SNAPSHOT_LAG_THRESHOLD - 1))).toBeNull()
  })

  // Урок 21.08: выпечка встала на seq 1500, урок шёл ещё полчаса и набрал
  // 1428 непокрытых операций. Порог перешагивался примерно за 26 минут до
  // того, как комната стала нерабочей.
  it('сообщает, когда хвост перевалил порог при живых участниках', () => {
    const watch = createSnapshotLagWatch()

    expect(watch.observe(backlog(SNAPSHOT_LAG_THRESHOLD))).toEqual(backlog(SNAPSHOT_LAG_THRESHOLD))
  })

  it('не повторяется, пока отставание не удвоилось', () => {
    const watch = createSnapshotLagWatch()
    watch.observe(backlog(300))

    expect(watch.observe(backlog(400))).toBeNull()
    expect(watch.observe(backlog(599))).toBeNull()
    expect(watch.observe(backlog(600))).toEqual(backlog(600))
  })

  // Пустая комната не печёт снапшоты по построению — отставание в ней ничего
  // не значит и разбудить никого не должно.
  it('не сообщает про комнату, в которой никого нет', () => {
    const watch = createSnapshotLagWatch()

    expect(watch.observe(backlog(1428, 0))).toBeNull()
  })

  it('после восстановления сваливание считается новым', () => {
    const watch = createSnapshotLagWatch()
    watch.observe(backlog(300))
    // Кто-то запёк снапшот — хвост схлопнулся.
    expect(watch.observe(backlog(0))).toBeNull()

    // И снова встало: это новость, а не продолжение старой.
    expect(watch.observe(backlog(300))).toEqual(backlog(300))
  })

  it('держит счёт по комнатам раздельно', () => {
    const watch = createSnapshotLagWatch()
    watch.observe(backlog(300, 2, 'room-a'))

    expect(watch.observe(backlog(300, 2, 'room-b'))).toEqual(backlog(300, 2, 'room-b'))
  })

  it('забывает вытесненную комнату', () => {
    const watch = createSnapshotLagWatch()
    watch.observe(backlog(300))
    watch.forget('Igy2jy_i')

    // Не «молчит, потому что помнит» — помнить уже нечего.
    expect(watch.observe(backlog(300))).toEqual(backlog(300))
  })
})
