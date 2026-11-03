import {sourceAutoGeometry as geometry,type SourceAutoGeometryTip as SharedTip,type SourceAutoGeometryShape} from '@grafetto/shared'
import {sourceAutoSpikes} from './sourceAutoSector'
export type SourceAutoGeometryTip=Omit<SharedTip,'spikes'>&{readonly spikes:number}
export type {SourceAutoGeometryShape,SourceAutoGeometry} from '@grafetto/shared'
/** Native multi-spike allocation uses ratio1; generator keeps original shape. */
export function sourceAutoGeometry(tip:SourceAutoGeometryTip,shape:SourceAutoGeometryShape,subX=0,subY=0){
 sourceAutoSpikes(tip.spikes)
 return geometry({...tip,ratio:tip.spikes>2?1:tip.ratio,spikes:2},tip.spikes>2?{...shape,ratio:1}:shape,subX,subY)
}
