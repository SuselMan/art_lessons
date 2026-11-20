import type {PixelReadMetadata} from '@grafetto/shared'
import {prisma} from '../db/prisma.js'

/** Dab arrays can dominate room history. This query returns only the read
 * header, under the same room/sequence scope as the requested history page. */
export async function projectionReadMetadata(roomId:string,beforeSeq:number):Promise<PixelReadMetadata[]> {
 const rows=await prisma.$queryRaw<Array<{data:PixelReadMetadata}>>`
  SELECT jsonb_build_object(
   'type','stroke','layerId',"layerId",
   'brushSource',jsonb_build_object(
    'version',"data"->'brushSource'->'version',
    'projection',"data"->'brushSource'->'projection'
   )
  ) AS data
  FROM "Operation"
  WHERE "roomId"=${roomId} AND "seq"<${beforeSeq}
   AND "type"='stroke' AND ("data"->'brushSource'->'projection') IS NOT NULL
 `
 return rows.map(row=>row.data)
}
