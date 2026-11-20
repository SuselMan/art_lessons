import { useEffect } from 'react'
import { renderBrushSample, type BrushSampleInput } from '../../engine/brushSample'
declare global { interface Window { renderGrafettoBrushSample?: (input: BrushSampleInput) => Promise<string> } }
export function BrushPreviewRenderer() {
  useEffect(() => { window.renderGrafettoBrushSample = renderBrushSample; return () => { delete window.renderGrafettoBrushSample } }, [])
  return null
}
