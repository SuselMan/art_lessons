/** One diagnostic GL owner, including setup failures before replay begins. */
export async function withGlOwnerCleanup<O extends {destroy():void},T>(create:()=>O,run:(owner:O)=>Promise<T>,restore:()=>void):Promise<T>{
 let owner:O|undefined
 try{owner=create();return await run(owner)}finally{try{owner?.destroy()}finally{restore()}}
}
