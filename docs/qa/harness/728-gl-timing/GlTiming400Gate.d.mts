import type { GlTimingRecord } from '../../../../apps/web/src/engine/src/diagnostics/BoundedGlTiming'
interface OwnedTimingInput {
  records: readonly GlTimingRecord[]
  expected: readonly { strokeId: string }[]
  userId: string
  layerId: string
}
interface PhaseAttribution {
  input: number
  strokeId: string
  totalMs: number
  phaseMs: Record<string, number>
  observedUnionMs: number
  unknownExclusiveMs: number
}
export function glUpTimingGate(input: OwnedTimingInput & {
  betweenGesture: { firstUpReturn: number; secondDownBegin: number; gapFromFirstUpReturnMs: number } | null
  beforeSecondWet: { layerId: string; at: number; center: number; nearForEligibility: boolean; anyWet: boolean } | null
}): { valid: boolean; reason?: string; inputs?: PhaseAttribution[] }
export function glTiming400Gate(input: OwnedTimingInput & {
  stats: { capacity: number; recorded: number; dropped: number; observerErrors: number; active: boolean }
  pendingBeforeSecond: boolean
}): { valid: boolean; reason?: string }
