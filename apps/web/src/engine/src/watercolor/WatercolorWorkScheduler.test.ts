import { afterEach, describe, expect, it, vi } from 'vitest'
import { WatercolorWorkScheduler } from './WatercolorWorkScheduler'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('post-lift watercolor scheduling', () => {
  function setup() {
    const tasks: Array<() => void> = [], frames = new Map<number, FrameRequestCallback>()
    let frame = 0, drawing = false
    vi.stubGlobal('scheduler', { postTask: (callback: () => void) => { tasks.push(callback); return Promise.resolve() } })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frame, callback); return frame })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const failed = vi.fn(), scheduler = new WatercolorWorkScheduler({ canRunTasks: () => !drawing, failed })
    return { scheduler, tasks, frames, failed, penDown: () => { drawing = true } }
  }
  it('uses frames normally and yields a pending task to newly arrived pen input', () => {
    const { scheduler, tasks, frames, penDown } = setup(), callback = vi.fn()
    scheduler.schedule(callback)
    expect(tasks).toHaveLength(0)
    scheduler.start(); scheduler.schedule(callback)
    penDown(); tasks.shift()!()
    expect(callback).not.toHaveBeenCalled()
    expect(frames.size).toBe(2)
    scheduler.destroy(); expect(frames.size).toBe(0)
  })
  it('cancels both task and frame continuations without invoking their owners', () => {
    const { scheduler, tasks, frames } = setup(), callback = vi.fn()
    const frame = scheduler.schedule(callback)
    scheduler.cancel(frame); expect(frames.size).toBe(0)
    scheduler.start(); const task = scheduler.schedule(callback)
    scheduler.cancel(task); tasks.shift()!()
    expect(callback).not.toHaveBeenCalled()
    scheduler.destroy()
  })
  it('reports task errors and returns to frame scheduling when Dry completes', () => {
    const { scheduler, tasks, frames, failed } = setup(), error = new Error('GPU work failed')
    scheduler.start(); scheduler.schedule(() => { throw error }); tasks.shift()!()
    expect(failed).toHaveBeenCalledWith(error)
    scheduler.stop(); scheduler.schedule(vi.fn())
    expect(frames.size).toBe(1); scheduler.destroy()
  })
  it('does not let an older Dry completion disable a newer accepted Dry', () => {
    const { scheduler, tasks, frames } = setup(), callback = vi.fn()
    const first = scheduler.start(), second = scheduler.start()
    scheduler.stop(first); scheduler.schedule(callback)
    expect(tasks).toHaveLength(1); tasks.shift()!()
    expect(callback).toHaveBeenCalledWith(true)
    scheduler.stop(second); scheduler.schedule(callback)
    expect(frames.size).toBe(1); scheduler.destroy()
  })

  it('yields consecutive Dry tasks to a frame after their shared time budget', () => {
    vi.useFakeTimers()
    const { scheduler, tasks, frames } = setup()
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const modes: boolean[] = []
    try {
      scheduler.start()
      const work = (task: boolean) => { modes.push(task); now += 25 }
      scheduler.schedule(work); tasks.shift()!()
      scheduler.schedule(work); tasks.shift()!()
      scheduler.schedule(work); tasks.shift()!()
      expect(modes).toEqual([true, true])
      expect(frames.size).toBe(1)
      frames.values().next().value!(now)
      expect(modes).toEqual([true, true])
      vi.runOnlyPendingTimers()
      expect(modes).toEqual([true, true, true])
      scheduler.schedule(work); tasks.shift()!()
      expect(modes).toEqual([true, true, true, true])
    } finally { scheduler.destroy(); clock.mockRestore() }
  })

})
