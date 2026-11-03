/** Test-only adapter: emulate PostgreSQL JSON text parsing, preserving the
 * existing fake indexed row store and its deferred/failure controls. */
export function canonicalOperationSqlMockRow(sql:TemplateStringsArray,values:readonly unknown[]){
 if(sql.length!==9||values.length!==8||!sql.join('?').includes('INSERT INTO "Operation"')||!sql.join('?').includes('::jsonb'))throw Error('Unexpected canonical SQL insert')
 const [id,seq,type,roomId,userId,layerId,tool,body]=values
 if(typeof id!=='string'||!Number.isSafeInteger(seq)||typeof type!=='string'||typeof roomId!=='string'||typeof userId!=='string'||layerId!==null&&typeof layerId!=='string'||tool!==null&&typeof tool!=='string'||typeof body!=='string')throw Error('Invalid canonical SQL parameters')
 return {id,seq,type,roomId,userId,layerId,tool,data:JSON.parse(body) as unknown}
}
