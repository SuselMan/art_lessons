import {useState} from 'react'
import type {CanonicalToolAvailability} from '../../../lib/tools/canonicalToolAvailability'
import {loadBrushLibrary} from '../../../lib/api/brushLibrary'
import {useT} from '../../../i18n'
import {useRoomStore} from '../../../stores/roomStore'
import styles from './BrushLibraryControls.module.css'

/** Source size is an observed property, not a slider the author ignores. */
export function CanonicalBrushSize({availability}:{availability:CanonicalToolAvailability}) {
 const t=useT(),id=useRoomStore(s=>s.toolSettings.digitalBrush.brush),size=availability.options.find(o=>o.id===id)?.sizePx
 return size===undefined?null:<p>{t('brushLibrary.nativeSize',{size})}</p>
}
export function CanonicalBrushStatus({availability}:{availability:CanonicalToolAvailability}) {
 const t=useT(),[busy,setBusy]=useState(false),[error,setError]=useState(false)
 const retry=async()=>{setBusy(true);setError(false);try{await loadBrushLibrary()}catch{setError(true)}finally{setBusy(false)}}
 return <div className={styles.library}>
  {availability.status!=='ready'&&<p role="status">{t(availability.status==='restoring'?'brushLibrary.sourceRestoring':'brushLibrary.noEligibleSource')}</p>}
  {error&&<p role="alert">{t('brushLibrary.error')}</p>}
  <button type="button" className={styles.button} disabled={busy} onClick={()=>{void retry()}}>{t(busy?'common.loading':'brushLibrary.refresh')}</button>
 </div>
}
