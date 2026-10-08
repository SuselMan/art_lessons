import type { CanonicalDrawCommand } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
export type SourceFieldRole = 'coverage'|'coverageFilm'|'pigmentLoad'|'pigmentBase'|'pigmentFilm'|'colourLoad'|'colourBase'|'colourFilm'|'solventLoad'|'solventBase'|'solventFilm'
export interface TypedSourceSegment { readonly commands: readonly CanonicalDrawCommand[]; readonly waterOnly?: boolean; readonly rect: readonly [number,number,number,number] | null }
export interface LateSourceBindings<F> { readonly landedVersion: number; readonly fields: Readonly<Record<SourceFieldRole,F>> }
export interface TypedGlSourcePort<F> {
  /** Must return CURRENT predecessor-landed fields; never a base captured during future input. */
  bindCurrentCanonical(): LateSourceBindings<F>
  clear(field:F):void
  copy(source:F,destination:F):void
  draw(command:CanonicalDrawCommand,destination:F,coverage:F,blend:'over'|'max'|'add'):void
  /** Original mode1,k1, same GL scissor; P then C must remain an indivisible pair. */
  basePlusFilm(destination:F,base:F,film:F,rect:readonly[number,number,number,number]):void
}
const rank={coverage:0,solvent:1,pigment:2,color:3,halo:4}
export class TypedGlSourceReplayPrototype {
  private readonly segments: readonly TypedSourceSegment[]
  private readonly expectedPredecessorVersion: number
  private readonly film:boolean
  private readonly captureRunningCoverage:boolean
  private used=false
  constructor(input:{segments:readonly TypedSourceSegment[];expectedPredecessorVersion:number;film:boolean;captureRunningCoverage:boolean}){
    this.expectedPredecessorVersion=input.expectedPredecessorVersion;this.film=input.film;this.captureRunningCoverage=input.captureRunningCoverage
    this.segments=input.segments.map(segment=>{
      let previous=-1
      const commands=segment.commands.map(command=>{
        if(rank[command.phase]<previous)throw Error('Each source segment must preserve phase boundaries')
        previous=rank[command.phase]
        if(segment.waterOnly&&rank[command.phase]>1)throw Error('Water-only material command')
        if(command.kind==='ribbon'&&command.batch.vertices.length%11)throw Error('Invalid canonical vertex stride')
        const copy=structuredClone(command)
        if(copy.phase!=='coverage'&&(copy.kind==='stamp'?copy.stamp.inkBlend:copy.batch.inkBlend)!==(this.film?'max':'add'))throw Error('Recorded Q8 blend/film mismatch')
        return copy
      })
      return{commands,waterOnly:segment.waterOnly,rect:segment.rect?[...segment.rect]as[number,number,number,number]:null}
    })
  }
  /** No delivery, dose or geometry regeneration. Original per-command F32 inputs are replayed. */
  execute<F>(port:TypedGlSourcePort<F>):void{
    if(this.used)throw Error('Typed source owner is single-use')
    const binding=port.bindCurrentCanonical()
    if(binding.landedVersion!==this.expectedPredecessorVersion)throw Error('Predecessor canonical base not ready')
    this.used=true
    const f=binding.fields
    // First-gesture initialization matches filmBuffers P/C clear/copy order. No old base snapshot.
    let initialized=false,solventInitialized=false
    for(const segment of this.segments){
      if(!initialized){
        if(this.captureRunningCoverage)port.copy(f.coverage,f.coverageFilm)
        if(this.film){port.clear(f.pigmentFilm);port.copy(f.pigmentLoad,f.pigmentBase);port.clear(f.colourFilm);port.copy(f.colourLoad,f.colourBase)}
        initialized=true
      }
      let solventPending=false
      const landSolvent=()=>{if(solventPending&&segment.rect)port.basePlusFilm(f.solventLoad,f.solventBase,f.solventFilm,segment.rect);solventPending=false}
      for(const command of segment.commands){
        if(command.phase==='coverage'){port.draw(command,f.coverage,f.coverage,'over');continue}
        if(command.phase==='solvent'){
          if(!solventInitialized){port.clear(f.solventFilm);port.copy(f.solventLoad,f.solventBase);solventInitialized=true}
          port.draw(command,f.solventFilm,f.coverage,this.film?'max':'add');solventPending=true;continue
        }
        landSolvent()
        const target=command.phase==='color'?(this.film?f.colourFilm:f.colourLoad):(this.film?f.pigmentFilm:f.pigmentLoad)
        port.draw(command,target,f.coverage,this.film?'max':'add')
      }
      landSolvent()
      if(!segment.waterOnly&&this.film&&segment.rect){port.basePlusFilm(f.pigmentLoad,f.pigmentBase,f.pigmentFilm,segment.rect);port.basePlusFilm(f.colourLoad,f.colourBase,f.colourFilm,segment.rect)}
    }
  }
}
