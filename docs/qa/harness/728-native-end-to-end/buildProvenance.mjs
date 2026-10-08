export function stampBuildCode(source,code){
 if(!/^[a-f0-9]{40}( \+ dirty)?$/.test(code))throw Error('Invalid build commit passport')
 const result=source.replaceAll('__CODE__',code).replaceAll('__SOURCE_CODE__',code)
 if(result.includes('__CODE__')||result.includes('__SOURCE_CODE__'))throw Error('Unresolved build passport')
 return result
}
