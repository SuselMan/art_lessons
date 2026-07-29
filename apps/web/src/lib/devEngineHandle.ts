// (#308) A handle on the live engine, in dev builds only.
//
// The engine is deliberately not on the store and not on `window` (CLAUDE.md:
// store state is a *reflection* of what was already applied to the engine, and
// the engine's internals are nobody else's business). That is right for the
// app and useless for measuring it: the numbers in #308 came off a tablet over
// CDP, and reproducing them means driving the real engine — real GL, real dab
// loops — from a console, with a history whose size is under the measurer's
// control rather than whatever happened to be drawn.
//
// Dev-only for the usual reason and one specific one: this hands out a
// reference that can append operations to the live log, which in a room with
// other participants is a way to broadcast nonsense to them.
import type { PencilEngineAPI } from '../engine'
import { useRoomStore } from '../stores/roomStore'

declare global {
  // eslint-disable-next-line no-var
  var __engine: PencilEngineAPI | undefined
  // eslint-disable-next-line no-var
  var __roomStore: typeof useRoomStore | undefined
}

export function exposeEngineForDev(engine: PencilEngineAPI | null): void {
  if (!import.meta.env.DEV) return
  globalThis.__engine = engine ?? undefined
  // The store comes with it: almost every engine call needs a layer id, and
  // the store is where the ids live (the engine takes them, it doesn't list
  // them).
  globalThis.__roomStore = useRoomStore
}
