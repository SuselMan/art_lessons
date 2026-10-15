import type { PencilEngineOptions } from '../../../engine'

/** Authoring opt-in for the approved standalone model; recorded presets drive replay. */
export function watercolorModelQaOptions(joinedTouch: boolean, search = ''): Pick<PencilEngineOptions, 'asyncFinish' | 'watercolorReview' | 'watercolorModel' | 'materialPresentation' | 'joinedTouch' | 'dryGpuFenceBatch'> {
  const requested = import.meta.env.VITE_QA_WATERCOLOR_MODEL
  const fastDry = new URLSearchParams(search).get('qaFastDry')
  let requestedModel = requested
  if (requested === 'front8-fine-v1') {
    if (fastDry === 'film') requestedModel = 'front8-detail-flow-v3'
    else if (fastDry === 'compact') requestedModel = 'front8-detail-flow-v2'
    else if (fastDry === 'flow' || fastDry === 'smooth') requestedModel = 'front8-detail-flow-v1'
    else if (fastDry === 'detail') requestedModel = 'front8-detail-v1'
    else if (fastDry === '1') requestedModel = 'front8-fine-large-v1'
  }
  const model = import.meta.env.DEV && (requestedModel === 'front8-v1' || requestedModel === 'front8-fine-v1' || requestedModel === 'front8-fine-large-v1' || requestedModel === 'front8-detail-v1' || requestedModel === 'front8-detail-flow-v1' || requestedModel === 'front8-detail-flow-v2' || requestedModel === 'front8-detail-flow-v3') ? requestedModel : 'legacy'
  const front8 = model !== 'legacy'
  const boundedDry = model === 'front8-detail-flow-v2' || model === 'front8-detail-flow-v3' || fastDry === 'smooth'
  return { joinedTouch: front8 || joinedTouch, asyncFinish: front8, watercolorReview: front8, watercolorModel: model, materialPresentation: front8, dryGpuFenceBatch: front8 && boundedDry ? 8 : undefined }
}
