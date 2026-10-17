/** QA-only host observer; requests no engine work. Snapshot clones only on demand. */
export class IndependentGoalClock {
  private failure:{at:number;error:string}|null=null
  get failed():Readonly<{at:number;error:string}>|null{return this.failure}
  fail(at:number,error:string){if(this.failure)return false;this.failure={at,error};this.goalFrames=this.idleFrames=this.noPlanFrames=0;this.add(at,'failed',{error});return true}
  private nextId=0
  private active:number|null=null
  private goalFrames=0
  private idleFrames=0
  private noPlanFrames=0
  private row:{id:number;pointerId:number;downAt:number;upAt:number|null;firstGoalAt:number|null;firstIdleAt:number|null;firstPlanAt:number|null;lastCompletedWindowAt:number|null;goalWindowAt:number|null;repeatedPlans:number;notSubmitted:boolean;cancelled:boolean}|null=null
  private events:{at:number;kind:string;gesture:number|null;epoch?:number;detail?:unknown}[]=[]
  private plans:{epoch:number;gesture:number|null;at:number}[]=[]
  private backgroundReasons=new Set<string>()
  private hiddenStart:number|null=null
  private hiddenAccumulated=0
  get currentGesture():Readonly<NonNullable<typeof this.row>>|null{return this.row}
  get hasCurrentPlan(){return this.row!==null&&this.row.firstPlanAt!==null}
  hiddenDuration(at:number){return this.hiddenAccumulated+(this.hiddenStart===null?0:Math.max(0,at-this.hiddenStart))}
  private add(at:number,kind:string,detail?:unknown,epoch?:number){this.events.push({at,kind,gesture:this.row?.id??null,epoch,detail});if(this.events.length>256)this.events.shift()}
  down(id:number,at:number,trusted:boolean,accepted:boolean){if(this.failure||!trusted||!accepted||this.active!==null)return false;this.active=id;this.row={id:++this.nextId,pointerId:id,downAt:at,upAt:null,firstGoalAt:null,firstIdleAt:null,firstPlanAt:null,lastCompletedWindowAt:null,goalWindowAt:null,repeatedPlans:0,notSubmitted:false,cancelled:false};this.hiddenStart=null;this.hiddenAccumulated=0;this.goalFrames=this.idleFrames=this.noPlanFrames=0;this.add(at,'down');return true}
  up(id:number,at:number,trusted:boolean){if(!trusted||this.active!==id||!this.row)return false;this.active=null;this.row.upAt=at;this.hiddenStart=this.backgroundReasons.size?at:null;this.goalFrames=this.idleFrames=this.noPlanFrames=0;this.add(at,'up');return true}
  cancel(id:number,at:number){if(this.active!==id)return false;this.active=null;if(this.row){this.row.cancelled=true;this.row.upAt=null}this.hiddenStart=null;this.hiddenAccumulated=0;this.goalFrames=this.idleFrames=this.noPlanFrames=0;this.add(at,'cancel');return true}
  invalidate(at:number,reason:string){this.failure=null;this.active=null;this.row=null;this.hiddenStart=null;this.hiddenAccumulated=0;this.goalFrames=this.idleFrames=this.noPlanFrames=0;this.add(at,'invalidate',reason)}
  lifecycle(at:number,kind:'visibilitychange'|'freeze'|'resume',hidden:boolean){if(kind==='freeze')this.backgroundReasons.add('frozen');else if(kind==='resume')this.backgroundReasons.delete('frozen');if(hidden)this.backgroundReasons.add('hidden');else this.backgroundReasons.delete('hidden');const background=this.backgroundReasons.size>0;if(this.row?.upAt!==null&&this.row&&!this.row.cancelled){if(background&&this.hiddenStart===null)this.hiddenStart=at;else if(!background&&this.hiddenStart!==null){this.hiddenAccumulated+=Math.max(0,at-this.hiddenStart);this.hiddenStart=null}}this.add(at,kind,{hidden,background,hiddenDurationAfterUp:this.hiddenDuration(at)})}
  event(at:number,event:{kind:string;epoch:number;[key:string]:unknown}){if(!Number.isSafeInteger(event.epoch))return;const r=this.row;if(event.kind==='plan'){this.plans.push({epoch:event.epoch,gesture:r?.id??null,at});if(this.plans.length>128)this.plans.shift();if(r&&!r.cancelled){r.notSubmitted=false;this.noPlanFrames=0;r.firstPlanAt??=at;if(r.firstGoalAt!==null){r.repeatedPlans++;this.add(at,'repeated-goal-computation',undefined,event.epoch)}}}else if(event.kind==='window'&&event.completed===true&&r&&!r.cancelled&&this.plans.some(p=>p.epoch===event.epoch&&p.gesture===r.id))r.lastCompletedWindowAt=at;this.add(at,event.kind,event,event.epoch)}
  idleWithoutPlan(at:number,idle:boolean){const r=this.row;if(this.failure||!r||r.cancelled||r.upAt===null||this.active!==null||this.hasCurrentPlan)return;this.noPlanFrames=idle?this.noPlanFrames+1:0;if(this.noPlanFrames>=2&&!r.notSubmitted){r.notSubmitted=true;this.add(at,'not-submitted')}}
  sample(at:number,goal:boolean,idle:boolean,blockers:unknown){const r=this.row;if(this.failure||!r||r.cancelled||r.upAt===null||this.active!==null)return;this.goalFrames=goal?this.goalFrames+1:0;this.idleFrames=idle?this.idleFrames+1:0;if(this.goalFrames>=2&&r.firstGoalAt===null){r.firstGoalAt=at;r.goalWindowAt=r.lastCompletedWindowAt;this.add(at,'first-goal',blockers)}if(this.idleFrames>=2&&r.firstIdleAt===null){r.firstIdleAt=at;this.add(at,'first-engine-idle',blockers)}}
  snapshot(at=performance.now()){return structuredClone({failure:this.failure,gesture:this.row,activePointer:this.active,hiddenDurationAfterUp:this.hiddenDuration(at),background:this.backgroundReasons.size>0,plans:this.plans,events:this.events})}
}
