// (#487) Замер входа в комнату: фазы, порог и — главное — вход, который не
// заканчивается. Последнее и есть причина, по которой этот модуль существует:
// 24.08 комната U68gWoq- вставала на «Joining…» навсегда, и измерять было
// нечего, потому что финиша не наступало.
import { describe, expect, it } from 'vitest'

import { SLOW_OPEN_MS, createOpenTimer, isSlowOpen, stagesLine } from './openTiming'

/** Управляемые часы: время двигают тесты, а не машина, на которой они идут. */
function clock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0
  return { now: () => t, advance: ms => { t += ms } }
}

describe('фазы входа', () => {
  it('раскладывает время по фазам, а не в одно число', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)

    c.advance(300)
    timer.stage('paper')
    c.advance(4000)
    timer.stage('snapshot')
    c.advance(700)
    timer.stage('replay')
    c.advance(1000)
    const report = timer.finish()

    expect(report.outcome).toBe('ready')
    expect(report.totalMs).toBe(6000)
    expect(report.stages).toEqual({ join: 300, paper: 4000, snapshot: 700, replay: 1000 })
    expect(report.reached).toBe('replay')
  })

  it('не засчитывает фазу дважды, если переподключение объявило её снова', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(100)
    timer.stage('snapshot')
    c.advance(200)
    // Догон на переподключении заново проходит по тем же событиям.
    timer.stage('paper')
    c.advance(50)
    const report = timer.finish()

    expect(report.reached).toBe('snapshot')
    expect(report.stages.paper).toBeUndefined()
    expect(report.stages.snapshot).toBe(250)
  })

  it('у входа один финиш, сколько бы раз его ни объявили', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(1000)
    const first = timer.finish()
    c.advance(5000)
    expect(timer.finish()).toEqual(first)
    expect(timer.done).toBe(true)
  })

  it('после финиша фазы больше не открываются', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(10)
    timer.finish()
    timer.stage('replay')
    expect(timer.stalled().reached).toBe('join')
  })
})

describe('вход, который не закончился', () => {
  it('снимок по будильнику отчитывается фазой, на которой стоит', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(200)
    timer.stage('paper')
    c.advance(SLOW_OPEN_MS)

    const report = timer.stalled()
    expect(report.outcome).toBe('stalled')
    expect(report.reached).toBe('paper')
    expect(report.stages.paper).toBe(SLOW_OPEN_MS)
    expect(timer.done).toBe(false)
  })

  it('снимок не закрывает фазу — следующий отчёт считает её с её же начала', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(1000)
    expect(timer.stalled().stages.join).toBe(1000)
    c.advance(1000)
    // Не 1000: фаза идёт с нуля, а не с момента, когда её подсмотрели.
    expect(timer.stalled().stages.join).toBe(2000)
    expect(timer.finish().stages.join).toBe(2000)
  })

  it('после финиша будильник отдаёт финишный отчёт, а не выдумывает застревание', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(500)
    const done = timer.finish()
    c.advance(60_000)
    expect(timer.stalled()).toEqual(done)
    expect(timer.stalled().outcome).toBe('ready')
  })
})

describe('порог', () => {
  it('быстрый вход не новость', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(SLOW_OPEN_MS - 1)
    expect(isSlowOpen(timer.finish())).toBe(false)
  })

  it('ровно порог — уже новость', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(SLOW_OPEN_MS)
    expect(isSlowOpen(timer.finish())).toBe(true)
  })

  it('застрявший вход — новость всегда, каким бы коротким ни был снимок', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(5)
    expect(isSlowOpen(timer.stalled())).toBe(true)
  })
})

describe('факты', () => {
  it('досыпаются по мере того, как становятся известны, и не теряются', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    timer.note({ latestSeq: 11291, snapshotSeq: 4100 })
    timer.stage('replay')
    timer.note({ tailOperations: 7191, layers: 9, restoredFromSnapshot: true })

    expect(timer.finish().facts).toEqual({
      latestSeq: 11291, snapshotSeq: 4100, tailOperations: 7191, layers: 9, restoredFromSnapshot: true,
    })
  })

  it('на застрявшем входе видно ровно то, что успело стать известным', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    timer.note({ latestSeq: 11291 })
    c.advance(SLOW_OPEN_MS)

    const report = timer.stalled()
    // Отсутствие фактов — тоже сведение: встали, не дойдя до снапшота.
    expect(report.facts).toEqual({ latestSeq: 11291 })
    expect(report.reached).toBe('join')
  })
})

describe('строка для крошки', () => {
  it('перечисляет только пройденные фазы, в порядке прохождения', () => {
    const c = clock()
    const timer = createOpenTimer(c.now)
    c.advance(120)
    timer.stage('paper')
    c.advance(30)
    expect(stagesLine(timer.finish())).toBe('join 120ms | paper 30ms')
  })
})
