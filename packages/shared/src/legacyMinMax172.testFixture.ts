import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{overlay154,library154}from'./legacyOverlay154.testFixture.js'
export function minmax172(mode:'darken'|'lighten'='darken'):BrushDescriptor{const b=overlay154();b.id='imported-172172172172172172172172';b.version=172;b.mixer!.colorRateComposite=mode;return b}
export function library172(mode:'darken'|'lighten'='darken'):BrushLibrary{const l=library154();l.brushes[0].descriptor=minmax172(mode);l.brushes[0].name='Own legacy foreground '+mode+'172';return l}
