import{previewCarrySourceOptions}from'./PreviewCarrySourceOptions.mjs';
import{PreviewFrontCarryGlPort}from'./PreviewFrontCarryGlPort.mjs';
/** Bounded visual-only phase. Caller owns transport tickets and advances pingpong after carry. */
export class PreviewCarrySession{
 constructor({source,chunks,pressureLease,fixedP,passes,world,paperWidth,paperHeight,constants,maxFrontSteps=32,carrySteps=16}){
  if(!pressureLease?.fields||!Number.isInteger(carrySteps)||carrySteps<1||carrySteps>16)throw Error('Explicit leased pressure/bounded carry');
  this.source=source;this.pressureLease=pressureLease;this.fixedP=fixedP;this.options=previewCarrySourceOptions(chunks,constants,{maxFrontSteps});this.port=new PreviewFrontCarryGlPort(passes,{world,paperWidth,paperHeight,maxFrontSteps:this.options.frontSteps});this.carrySteps=carrySteps;this.carried=0;this.seeded=false;this.done=false;
 }
 input(ticket){return{source:this.source,options:this.options.options,targets:{oldP:ticket.p,oldC:ticket.c,outP:ticket.outP,outC:ticket.outC,fixedP:this.fixedP,...this.pressureLease.fields}}}
 step(ticket){if(this.done)throw Error('Carry session complete');const input=this.input(ticket);let seededNow=false,frontAdvanced=false;if(!this.seeded){this.port.seed(input);this.seeded=true;seededNow=true}
  if(this.port.frontSteps<this.options.frontSteps){this.port.frontStep(input,ticket.coverage);frontAdvanced=true}
  this.port.carry(input);this.carried++;this.done=this.carried===this.carrySteps;return{phase:'carry',writesMaterial:true,done:this.done,seededNow,frontAdvanced,frontSteps:this.port.frontSteps,requestedFrontSteps:this.options.requestedFrontSteps}
 }
}
