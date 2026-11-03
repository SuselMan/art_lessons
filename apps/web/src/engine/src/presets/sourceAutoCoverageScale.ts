/** NEW recorded source-scale mechanism only. Allocation already consumes
 * storedScale; this factor belongs solely to the coverage generator. */
export function sourceAutoCoverageScale(factor:number|undefined,profile:string):number{
 if(factor===undefined)return 1
 if(!Number.isFinite(factor)||factor<=0||factor!==1&&profile!=='browser-number-coverage-v1'&&profile!=='seeded-auto-mask-browser-v1')throw new RangeError('Invalid recorded Auto coverage scale')
 return factor
}
