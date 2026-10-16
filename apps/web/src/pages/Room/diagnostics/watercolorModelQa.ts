import {useRoomStore} from '../../../stores/roomStore'
import {hexToRgb} from '../../../lib/browser/color'
import type { PencilEngineOptions } from '../../../engine'

/** Authoring opt-in for the approved standalone model; recorded presets drive replay. */
export function watercolorModelQaOptions(joinedTouch: boolean, search = ''): Pick<PencilEngineOptions, 'asyncFinish' | 'watercolorReview' | 'watercolorModel' | 'materialPresentation' | 'joinedTouch' | 'dryGpuFenceBatch'> {
  const requested = import.meta.env.DEV && new URLSearchParams(search).get('qaModel')==='m70-r2-v1' ? 'm70-r2-v1' : import.meta.env.VITE_QA_WATERCOLOR_MODEL
  const fastDry = new URLSearchParams(search).get('qaFastDry')
  let requestedModel = requested
  if (requested === 'front8-fine-v1') {
    if (fastDry === 'film') requestedModel = 'front8-detail-flow-v3'
    else if (fastDry === 'compact') requestedModel = 'front8-detail-flow-v2'
    else if (fastDry === 'flow' || fastDry === 'smooth') requestedModel = 'front8-detail-flow-v1'
    else if (fastDry === 'detail') requestedModel = 'front8-detail-v1'
    else if (fastDry === '1') requestedModel = 'front8-fine-large-v1'
  }
  const model = import.meta.env.DEV && (requestedModel === 'm70-r2-v1' || requestedModel === 'front8-v1' || requestedModel === 'front8-fine-v1' || requestedModel === 'front8-fine-large-v1' || requestedModel === 'front8-detail-v1' || requestedModel === 'front8-detail-flow-v1' || requestedModel === 'front8-detail-flow-v2' || requestedModel === 'front8-detail-flow-v3' || requestedModel === 'front8-detail-flow-v4') ? requestedModel : 'legacy'
  if(model==='m70-r2-v1') return {joinedTouch:false,asyncFinish:false,watercolorReview:true,watercolorModel:model,materialPresentation:false}
  const front8 = model !== 'legacy'
  const boundedDry = model === 'front8-detail-flow-v2' || model === 'front8-detail-flow-v3' || model === 'front8-detail-flow-v4' || fastDry === 'smooth'
  return { joinedTouch: front8 || joinedTouch, asyncFinish: front8, watercolorReview: front8, watercolorModel: model, materialPresentation: front8, dryGpuFenceBatch: front8 && boundedDry ? 8 : undefined }
}

/** QA authoring defaults only; recorded stroke presets carry the brush dose. */
export function applyM70QaDefaults(search: string): void {
  if(!import.meta.env.DEV || new URLSearchParams(search).get('qaModel')!=='m70-r2-v1')return
  const state=useRoomStore.getState()
  state.setTool('watercolor')
  for(const [key,value] of Object.entries({water:.95,pigment:.34,color:hexToRgb('#2a3b97'),size:90,nib:'round',pressureResponse:'normal'})) state.setToolSetting('watercolor',key,value)
}
