import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{overlay154,library154}from'./legacyOverlay154.testFixture.js'
export function dodgeBurn176(mode:'dodge'|'burn'='dodge'):BrushDescriptor{const b=overlay154();b.id='imported-176176176176176176176176';b.version=176;b.mixer!.colorRateComposite=mode;return b}
export function library176(mode:'dodge'|'burn'='dodge'):BrushLibrary{const l=library154();l.brushes[0].descriptor=dodgeBurn176(mode);l.brushes[0].name='Own legacy foreground '+mode+'176';return l}
