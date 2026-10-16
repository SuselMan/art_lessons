/** Immutable parameters of a puddle solver revision. Brush colour and dose are
 * recorded on strokes; they are deliberately not solver parameters. */
export interface PuddleParameters {
  readonly massThreshold: number
  readonly compositionThreshold: number
  readonly hueThreshold: number
  readonly hueStrength: number
  readonly backgroundStrength: number
  readonly minimumRegionArea: number
  readonly backgroundDistortion: number
}

/** Ilya's approved Mini M70 / R2, 2026-10-16. Not enabled for room replay yet. */
export const APPROVED_M70_PARAMETERS: Readonly<PuddleParameters> = Object.freeze({
  massThreshold: 0.298116,
  compositionThreshold: 0.474721,
  hueThreshold: 0.505521,
  hueStrength: 1,
  backgroundStrength: 0.877969,
  minimumRegionArea: 2994.2784,
  backgroundDistortion: 0.597529,
})

export type ReadPuddleParameters = () => Readonly<Partial<PuddleParameters>>
