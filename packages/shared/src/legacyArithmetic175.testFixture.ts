import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{overlay154,library154}from'./legacyOverlay154.testFixture.js'
export function arithmetic175(mode:'add'|'subtract'='add'):BrushDescriptor{const b=overlay154();b.id='imported-175175175175175175175175';b.version=175;b.mixer!.colorRateComposite=mode;return b}
export function library175(mode:'add'|'subtract'='add'):BrushLibrary{const l=library154();l.brushes[0].descriptor=arithmetic175(mode);l.brushes[0].name='Own legacy foreground '+mode+'175';return l}
