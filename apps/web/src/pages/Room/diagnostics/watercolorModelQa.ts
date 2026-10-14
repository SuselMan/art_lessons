import type { PencilEngineOptions } from '../../../engine'

/** Authoring opt-in for the approved standalone model; recorded presets drive replay. */
export function watercolorModelQaOptions(joinedTouch: boolean): Pick<PencilEngineOptions, 'asyncFinish' | 'watercolorReview' | 'watercolorModel' | 'materialPresentation' | 'joinedTouch'> {
  const front8 = import.meta.env.DEV && import.meta.env.VITE_QA_WATERCOLOR_MODEL === 'front8-v1'
  return { joinedTouch: front8 || joinedTouch, asyncFinish: front8, watercolorReview: front8, watercolorModel: front8 ? 'front8-v1' : 'legacy', materialPresentation: front8 }
}
