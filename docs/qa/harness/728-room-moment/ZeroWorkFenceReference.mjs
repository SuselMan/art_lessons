/** OFF decision oracle, never executes/skips a GPU barrier itself. */
export class ZeroWorkFenceReference {
 constructor(){this.cert=null;this.serial=0;this.generation=0;this.alive=true;this.coverageComplete=false}
 configure({generation,coverageComplete,alive=true}){if(generation!==this.generation||!alive)this.cert=null;this.generation=generation;this.coverageComplete=coverageComplete;this.alive=alive}
 submit(){this.serial++;return this.serial}
 decision(){return this.alive&&this.coverageComplete&&this.cert?.generation===this.generation&&this.cert.serial===this.serial?'reuse-existing-idle':'actual-barrier-required'}
 completeActualBarrier({success,alive=this.alive}){if(success&&alive&&this.alive)this.cert={serial:this.serial,generation:this.generation};else this.cert=null}
}
