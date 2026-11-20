import {useState} from 'react'
import {hasExperimentCurrentPattern158Scope} from '@grafetto/shared'
import {digitalBrushFromPreset} from '../../../engine'
import {useT, type TranslationKey} from '../../../i18n'
import {CanvasPatternError,selectCanvasBrushPattern,clearCanvasBrushPattern} from './canvasBrushPattern'
import {useRoomStore} from '../../../stores/roomStore'
import styles from './CanvasPatternControls.module.css'

export function CanvasPatternControls(){
 const t=useT()
 const brush=useRoomStore(s=>s.toolSettings.digitalBrush.brush)
 const room=useRoomStore(s=>s.boardId)
 const selected=useRoomStore(s=>s.canvasPatternSelection)
 const [error,setError]=useState<TranslationKey|null>(null),[busy,setBusy]=useState(false)
 let visible=false;try{visible=hasExperimentCurrentPattern158Scope(digitalBrushFromPreset(String(brush)))}catch{/* Unselected imported descriptor. */}
 if(!visible)return null
 return <fieldset className={styles.field}>
  <legend>{t('canvasPattern.title')}</legend>
  <p>{selected.room===room&&selected.name?selected.name:t('canvasPattern.none')}</p>
  <label className={styles.upload}>{t('canvasPattern.choose')}<input type="file" accept="image/png" aria-label={t('canvasPattern.choose')} disabled={busy} onChange={event=>{
   const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return
   setBusy(true);setError(null)
   void selectCanvasBrushPattern(file).catch((e:unknown)=>setError(e instanceof CanvasPatternError?e.translationKey:'canvasPattern.loadFailed')).finally(()=>setBusy(false))
  }}/></label>
  <button type="button" onClick={clearCanvasBrushPattern} disabled={busy}>{t('canvasPattern.remove')}</button>
  <small>{t('canvasPattern.hint')}</small>
  {error&&<p role="alert">{t(error)}</p>}
 </fieldset>
}
