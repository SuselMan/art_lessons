// (#522) Продолжение #287 на путь, который тот не закрыл.
//
// #287 научил undo/redo штриха не терять пиксели, пришедшие из сетевого
// снапшота: `restoreLayerFromSnapshot` сеет закреплённый чекпойнт, и
// `_rebuildLayer` находит его вместо того, чтобы переигрывать пустой лог.
// Но `_destroyBuffer` этот чекпойнт **удалял** — на том основании, что id
// слоёв не переиспользуются, значит слой ушёл навсегда.
//
// Посылка неверна для обратимых операций. `layer_delete` и поглощение слоя
// мержем undoable, и отмена возвращает тот же id: буфер создаётся заново
// пустым, `_rebuildLayer` переигрывает лог слоя — а лога ниже снапшота у
// клиента нет и быть не должно. Единственное место, где жили те пиксели, —
// удалённый чекпойнт.
//
// В проде (комната cdf314dd-153, 31.08.2026) это стоило слоя со всей
// светотенью: мерж в 17:29:18, отмена мержа в 17:29:22 вернула слой пустым,
// а очередная выпечка в 17:29:43 записала эту пустоту на сервер как самый
// свежий снапшот — 107 КБ вместо 981 КБ. Дальше `isCoveredBySnapshot`
// придержал все штрихи слоя как «уже покрытые», и потеря стала общей и
// постоянной.
import { describe, expect, it } from 'vitest'

import {
  createTestEngine, dab, makeLayerAdd, makeLayerDelete, makeLayerMerge, makeStroke, readTilePixels,
} from './testing/engineTestUtils'
import { decodeLayerTiles } from './src/snapshotCodec'

/** Клиент, вошедший в комнату по снапшоту: пиксели слоя есть, а истории под
 *  ними нет — ровно то положение, в котором был пострадавший клиент. */
function joinedFromSnapshot() {
  const { engine: source } = createTestEngine({ userId: 'user-a' }, { width: 8, height: 8 })
  source.appendOperation(makeLayerAdd('user-a', 'L'))
  source.appendOperation(makeStroke('user-a', 'L', [dab(4, 4, { size: 6, pressure: 1, opacity: 0.5 })]))
  const { tiles } = decodeLayerTiles(source.bakeNetworkSnapshot('L')!, 0)
  const restoredPixels = [...readTilePixels(source, 'L', 0, 0, 8, 8)!]

  const { engine: target } = createTestEngine({ userId: 'user-b' }, { width: 8, height: 8 })
  target.initLayer('L')
  target.restoreLayerFromSnapshot('L', tiles, 2)
  return { target, restoredPixels }
}

describe('слой, воскрешённый отменой структурной операции (#522)', () => {
  it('сохраняет пиксели из снапшота, когда отменён поглотивший его мерж', () => {
    const { target, restoredPixels } = joinedFromSnapshot()

    target.appendOperation(makeLayerAdd('user-b', 'M'))
    target.appendOperation(makeLayerMerge('user-b', 'N', [{ id: 'L', opacity: 1 }, { id: 'M', opacity: 1 }]))
    expect(target.bakeNetworkSnapshot('L')).toBeNull() // слоя больше нет — мерж его съел

    expect(target.undo()?.type).toBe('layer_merge')

    const revived = readTilePixels(target, 'L', 0, 0, 8, 8)
    expect(revived).not.toBeNull()
    expect([...revived!]).toEqual(restoredPixels)
  })

  it('сохраняет пиксели из снапшота, когда отменено удаление слоя', () => {
    const { target, restoredPixels } = joinedFromSnapshot()

    target.appendOperation(makeLayerDelete('user-b', ['L']))
    expect(target.undo()?.type).toBe('layer_delete')

    const revived = readTilePixels(target, 'L', 0, 0, 8, 8)
    expect(revived).not.toBeNull()
    expect([...revived!]).toEqual(restoredPixels)
  })

  it('не публикует воскрешённый слой, пиксели которого восстановить нечем', () => {
    const { target } = joinedFromSnapshot()

    // Чекпойнта не стало (здесь — руками, в проде это вытеснение по бюджету):
    // слой воскреснет неполным, и такой блоб не должен уехать на сервер.
    // Пустой снапшот стоит переигранных операций, неверный — стоит урока.
    target.appendOperation(makeLayerDelete('user-b', ['L']))
    dropCheckpointsFor(target, 'L')
    target.undo()

    // Рисуем поверх воскрешённого слоя: без этого он просто пуст, и `null`
    // ничего не доказывал бы — его вернула бы проверка «нет тайлов».
    // Теперь тайлы есть, и отказать может только сам запрет.
    target.appendOperation(makeStroke('user-b', 'L', [dab(2, 2, { size: 4, pressure: 1, opacity: 0.5 })]))
    expect(readTilePixels(target, 'L', 0, 0, 8, 8)).not.toBeNull()

    expect(target.bakeNetworkSnapshot('L')).toBeNull()
  })
})

/** Белый ящик: выбрасывает все чекпойнты слоя, чтобы воспроизвести
 *  вытеснение по бюджету без наполнения его настоящими мегабайтами. */
function dropCheckpointsFor(engine: unknown, layerId: string): void {
  const checkpoints = (engine as { _checkpoints: { layerId: string }[] })._checkpoints
  for (let i = checkpoints.length - 1; i >= 0; i--) {
    if (checkpoints[i].layerId === layerId) checkpoints.splice(i, 1)
  }
}
