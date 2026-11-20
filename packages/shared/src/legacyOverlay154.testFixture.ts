import type{BrushDescriptor,BrushLibrary}from'./brushes.js'
import{spray133,library133}from'./sprayWash133.testFixture.js'
export function overlay154():BrushDescriptor{const b=spray133();delete b.spray;b.id='imported-154154154154154154154154';b.version=154;b.model='mixer';b.mixer={source:'previousCanvas',load:0,initialLoad:0,pickup:.5,strength:1,smearAlpha:true,foreground:{rate:.5},colorRateComposite:'overlay'};delete b.behavior!.rendering!.accumulation;b.sizeByPressure=[[0,.2],[1,1]];return b}
export function library154():BrushLibrary{const l=library133();l.brushes[0].descriptor=overlay154();l.brushes[0].name='Authored legacy ColorRate Overlay154';return l}
