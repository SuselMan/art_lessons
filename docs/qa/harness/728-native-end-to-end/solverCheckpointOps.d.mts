export interface SolverCheckpointCapture {index:number;[role:string]:any}
export function installSolverCheckpointOps(planner:any,options:{indices:number[];getField:()=>any;clone:(buffer:any)=>any;rolesForIndex?:(index:number)=>string[];beforeOperation?:(index:number)=>()=>void}):{captures:SolverCheckpointCapture[];readonly calls:number;detach:()=>void}
