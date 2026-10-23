import type { PencilEngineOptions } from '../../../engine'

/** Authoring opt-in for the approved standalone model; recorded presets drive replay. */
export function watercolorModelQaOptions(joinedTouch: boolean): Pick<PencilEngineOptions, 'asyncFinish' | 'watercolorReview' | 'watercolorModel' | 'materialPresentation' | 'joinedTouch'> {
  const requested = import.meta.env.DEV ? import.meta.env.VITE_QA_WATERCOLOR_MODEL : undefined
  const model = requested === 'front8-v1' || requested === 'front8-v2' ? requested : 'legacy'
  const front8 = model !== 'legacy'
  return { joinedTouch: front8 || joinedTouch, asyncFinish: front8, watercolorReview: front8, watercolorModel: model, materialPresentation: front8 }
}
