// (#425) Обрезанный по краю листа тайл идёт быстрым путём, а не через
// переразбиение.
//
// Сетка тайлов в комнате с границами свисает за лист: 1754×2480 на тайлах по
// 1024 даёт правую колонку до 2048 и нижний ряд до 3072. Выпечка теперь этот
// свес отрезает, и такой тайл выровнен по сетке, но кончается там же, где
// бумага. Переразбиение разобрало бы его правильно, но ценой полной клетки в
// памяти и альфа-скана на каждый тайл — во время входа, на планшете.
import { describe, expect, it } from 'vitest'

import { clipTileToPage, retileSnapshotTiles } from './retileSnapshot'
import type { SnapshotTile } from './snapshotCodec'

/** Лист A4 @150dpi — тот самый, на котором это меряли (комната U68gWoq-). */
const PAGE = { w: 1754, h: 2480 }

function tile(originX: number, originY: number, width: number, height: number, fill = 1): SnapshotTile {
  return { originX, originY, width, height, pixels: new Uint8Array(width * height * 4).fill(fill) }
}

describe('обрезанный по листу тайл', () => {
  it('проходит насквозь, без копирования и без переразбиения', () => {
    // Правая колонка: 1754 - 1024 = 730.
    const tiles = [tile(0, 0, 1024, 1024), tile(1024, 0, 730, 1024)]
    // Возврат по идентичности — то, на что опирается вызывающий, чтобы
    // пропустить альфа-скан (см. restoreLayerFromSnapshot).
    expect(retileSnapshotTiles(tiles, 1024, 1024, PAGE)).toBe(tiles)
  })

  it('и по вертикали: нижний ряд листа 2480 высотой', () => {
    const tiles = [tile(0, 2048, 1024, 432)]
    expect(retileSnapshotTiles(tiles, 1024, 1024, PAGE)).toBe(tiles)
  })

  it('угол, обрезанный по обеим осям', () => {
    const tiles = [tile(1024, 2048, 730, 432)]
    expect(retileSnapshotTiles(tiles, 1024, 1024, PAGE)).toBe(tiles)
  })
})

describe('чего послабление не должно было разрешить', () => {
  it('половинный тайл посреди листа — не край, значит переразбирается', () => {
    // Это и есть случай слияния, который файл обещает: два исходных тайла в
    // одну клетку обязаны сложиться, а не выжить оба. Свободное правило
    // «меньше клетки» пропустило бы их насквозь.
    const left = tile(0, 0, 512, 1024, 1)
    const right = tile(512, 0, 512, 1024, 2)
    const out = retileSnapshotTiles([left, right], 1024, 1024, PAGE)
    expect(out).not.toBe(null)
    expect(out.length).toBe(1)
    expect(out[0].width).toBe(1024)
  })

  it('без листа правило остаётся точным — у бесконечной комнаты нет края', () => {
    const tiles = [tile(1024, 0, 730, 1024)]
    const out = retileSnapshotTiles(tiles, 1024, 1024)
    expect(out).not.toBe(tiles)
    expect(out[0].width).toBe(1024)
  })

  it('тайл со старой страницей целиком по-прежнему переразбирается', () => {
    // (#469) Снапшот до подразбиения комнат с границами: один тайл во весь
    // лист. Он шире клетки — быстрый путь здесь был бы той самой тихой
    // порчей, ради которой файл и написан. Правого края листа он тоже
    // касается, так что это ровно та проверка, которую «ends where the sheet
    // ends» обязано было не сломать.
    const tiles = [tile(0, 0, 1754, 2480)]
    const out = retileSnapshotTiles(tiles, 1024, 1024, PAGE)
    expect(out).not.toBe(tiles)
    expect(out.length).toBeGreaterThan(1)
    for (const t of out) {
      expect(t.width).toBe(1024)
      expect(t.height).toBe(1024)
    }
  })

  it('невыровненный тайл переразбирается, каким бы мелким ни был', () => {
    const tiles = [tile(500, 500, 100, 100)]
    const out = retileSnapshotTiles(tiles, 1024, 1024, PAGE)
    expect(out).not.toBe(tiles)
    expect(out[0].originX).toBe(0)
    expect(out[0].originY).toBe(0)
  })
})

describe('clipTileToPage', () => {
  /** Тайл, у которого каждый пиксель помечен своей строкой массива, — чтобы
   *  было видно не «сколько строк осталось», а *какие именно*. */
  function marked(w: number, h: number): Uint8Array {
    const px = new Uint8Array(w * h * 4)
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const o = (row * w + col) * 4
        px[o] = row; px[o + 1] = col; px[o + 2] = 0; px[o + 3] = 255
      }
    }
    return px
  }

  it('не трогает тайл, целиком лежащий на листе, и не копирует его', () => {
    const px = marked(4, 4)
    const out = clipTileToPage(0, 0, 4, 4, px, { w: 8, h: 8 })
    expect(out.pixels).toBe(px)
    expect(out.width).toBe(4)
  })

  it('по горизонтали оставляет левые столбцы', () => {
    // Лист шириной 6: у тайла в (4,0) на листе только 2 столбца из 4.
    const out = clipTileToPage(4, 0, 4, 4, marked(4, 4), { w: 6, h: 100 })
    expect(out.width).toBe(2)
    expect(out.height).toBe(4)
    // Столбцы 0 и 1 исходника, в том же порядке.
    expect(Array.from(out.pixels.subarray(0, 8))).toEqual([0, 0, 0, 255, 0, 1, 0, 255])
  })

  it('по вертикали оставляет ВЕРХ тайла, то есть последние строки массива', () => {
    // Это та ошибка, которую легко сделать и почти невозможно заметить на
    // симметричной картинке: массив идёт снизу вверх, видимая часть тайла у
    // нижнего края листа — его верх, значит хвост массива, а не начало.
    const out = clipTileToPage(0, 4, 4, 4, marked(4, 4), { w: 100, h: 6 })
    expect(out.height).toBe(2)
    // Первая строка результата — строка 2 исходника (4 - 2), а не строка 0.
    expect(out.pixels[0]).toBe(2)
    // Ширина здесь не режется, значит шаг строки — 4 пикселя. Последняя
    // строка результата — строка 3 исходника: верх тайла остаётся верхом.
    expect(out.width).toBe(4)
    expect(out.pixels[(1 * 4 + 0) * 4]).toBe(3)
  })

  it('режет по обеим осям сразу', () => {
    const out = clipTileToPage(4, 4, 4, 4, marked(4, 4), { w: 6, h: 7 })
    expect([out.width, out.height]).toEqual([2, 3])
    expect(out.pixels.length).toBe(2 * 3 * 4)
    // Верхняя строка результата — по-прежнему верх тайла.
    expect(out.pixels[(2 * 2 + 0) * 4]).toBe(3)
  })

  it('тайл целиком за листом сжимается в ничто, а не в отрицательный размер', () => {
    const out = clipTileToPage(10, 0, 4, 4, marked(4, 4), { w: 6, h: 100 })
    expect(out.width).toBe(0)
    expect(out.pixels.length).toBe(0)
  })
})
