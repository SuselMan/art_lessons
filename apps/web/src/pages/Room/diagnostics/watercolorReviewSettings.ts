import type {ToolSettingsMap} from '../../../lib/tools/toolSchemas'
/** Explicit DEV review link seeds real UI settings; normal rooms stay unchanged. */
export function watercolorReviewSettings(settings:ToolSettingsMap,search:string,dev:boolean){
 if(!dev)return{settings,enabled:false}
 const params=new URLSearchParams(search),values=params.getAll('wcReview400')
 if(!values.length)return{settings,enabled:false}
 if(values.length!==1||values[0]!=='1'||params.get('wcNative')!=='1')throw Error('wcReview400 requires one explicit1 and wcNative=1')
 return{enabled:true,settings:{...settings,watercolor:{...settings.watercolor,size:400,nib:'round',pressureResponse:'normal',water:1,pigment:1,color:[.2,0,.6]}} satisfies ToolSettingsMap}
}
