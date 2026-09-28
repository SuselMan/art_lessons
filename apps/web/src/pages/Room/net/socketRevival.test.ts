import { describe, expect, it } from 'vitest'

import { createSocketRevival, reviveDelayMs, REVIVE_MAX_MS, type Timers } from './socketRevival'

/** Управляемые таймеры: тест здесь про то, *когда* и *сколько раз* сокет
 *  заводят заново, так что время должно двигаться по команде. */
function fakeTimers() {
  const queued = new Map<number, { fn: () => void; ms: number }>()
  let nextId = 1
  const timers: Timers = {
    set: (fn, ms) => { const id = nextId++; queued.set(id, { fn, ms }); return id },
    clear: id => { queued.delete(id) },
  }
  return {
    timers,
    get pending() { return [...queued.values()].map(t => t.ms) },
    /** Выполнить всё запланированное (в порядке постановки). */
    run() {
      for (const [id, { fn }] of [...queued]) { queued.delete(id); fn() }
    },
  }
}

function fakeSocket(active: boolean) {
  const socket = {
    active,
    connects: 0,
    connect() { this.connects++; this.active = true },
  }
  return socket
}

describe('reviveDelayMs (#504)', () => {
  it('растёт вдвое и упирается в потолок', () => {
    expect(reviveDelayMs(0)).toBe(1000)
    expect(reviveDelayMs(1)).toBe(2000)
    expect(reviveDelayMs(2)).toBe(4000)
    expect(reviveDelayMs(3)).toBe(REVIVE_MAX_MS)
    expect(reviveDelayMs(20)).toBe(REVIVE_MAX_MS)
  })
})

describe('createSocketRevival (#504)', () => {
  it('заводит сокет, которого сервер отсоединил сам', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteDisconnect('io server disconnect')
    expect(clock.pending).toEqual([1000])
    clock.run()
    expect(socket.connects).toBe(1)
  })

  it('заводит сокет, которому отказали в хендшейке', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteConnectError()
    clock.run()
    expect(socket.connects).toBe(1)
  })

  // Обычный обрыв связи: у socket.io свой бэкофф с джиттером, и он лучше —
  // вторая, наша, лесенка попыток поверх его лесенки только мешала бы.
  it('не вмешивается, пока socket.io ещё пытается сам', () => {
    const socket = fakeSocket(true)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteDisconnect('transport close')
    revival.noteConnectError()
    expect(clock.pending).toEqual([])
  })

  // Иначе очистка эффекта (уход со страницы комнаты зовёт socket.disconnect())
  // сама себе назначала бы переподключение.
  it('не воскрешает сокет, который закрыла сама страница', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteDisconnect('io client disconnect')
    expect(clock.pending).toEqual([])
  })

  it('пара событий об одном отказе даёт одну попытку', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteConnectError()
    revival.noteDisconnect('io server disconnect')
    expect(clock.pending).toEqual([1000])
    clock.run()
    expect(socket.connects).toBe(1)
  })

  it('после неудачной попытки ждёт дольше', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteConnectError()
    clock.run()
    socket.active = false // попытка провалилась тем же отказом
    revival.noteConnectError()
    expect(clock.pending).toEqual([2000])
  })

  it('состоявшееся соединение сбрасывает лесенку и снимает попытку', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteConnectError()
    clock.run()
    socket.active = false
    revival.noteConnectError()
    expect(clock.pending).toEqual([2000])

    revival.noteConnect()
    expect(clock.pending).toEqual([])

    socket.active = false
    revival.noteDisconnect('io server disconnect')
    expect(clock.pending).toEqual([1000])
  })

  it('cancel снимает запланированную попытку', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteDisconnect('io server disconnect')
    revival.cancel()
    clock.run()
    expect(socket.connects).toBe(0)
  })

  it('не заводит сокет, который к сроку ожил сам', () => {
    const socket = fakeSocket(false)
    const clock = fakeTimers()
    const revival = createSocketRevival(socket, clock.timers)

    revival.noteDisconnect('io server disconnect')
    socket.active = true
    clock.run()
    expect(socket.connects).toBe(0)
  })
})
