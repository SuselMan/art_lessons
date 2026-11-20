import{it,expect,vi}from'vitest'
import Fastify from'fastify'
import{mkdtemp,rm,readdir}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{registerBrushLibraryRoutes}from'./routes.js'
import{mayReadBoardContent,mayPublishBoardBrushResource}from'../rooms/boardContentAccess.js'
vi.mock('../rooms/boardContentAccess.js',()=>({mayReadBoardContent:vi.fn(),mayPublishBoardBrushResource:vi.fn()}))
it('read access alone cannot publish raw source resources through existing room endpoint',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pattern-route158-'));vi.stubEnv('GRAFETTO_BRUSH_STORAGE_DIR',directory);const server=Fastify();server.addHook('onRequest',async request=>{request.userId='own'})
 try{await registerBrushLibraryRoutes(server,'');vi.mocked(mayReadBoardContent).mockResolvedValue(true);vi.mocked(mayPublishBoardBrushResource).mockResolvedValue(false)
  const denied=await server.inject({method:'POST',url:'/api/rooms/own/brush-library',payload:{presets:[],sourcePattern:{version:1,kind:'none'},sourceAssets:[]}});expect(denied.statusCode).toBe(403)
  vi.mocked(mayPublishBoardBrushResource).mockResolvedValue(true);const ready=await server.inject({method:'POST',url:'/api/rooms/own/brush-library',payload:{presets:[],sourcePattern:{version:1,kind:'none'},sourceAssets:[]}});expect(ready.statusCode).toBe(200)
  for(const body of [
   {sourcePattern:null,sourceAssets:[]},
   {sourcePattern:{version:1,kind:'receiver-current'},sourceAssets:[]},
   {sourcePattern:{version:1,kind:'none'},sourceAssets:{}},
   {sourcePattern:{version:1,kind:'none'},sourceAssets:[{id:'asset:bad',size:4,file:'bad.bin'}]},
   {sourcePattern:{version:1,kind:'none'},sourceAssets:[],assetPayloads:null},
   {sourcePattern:{version:1,kind:'none'},sourceAssets:[],assetPayloads:[]},
   {sourcePattern:{version:1,kind:'none'},sourceAssets:[],assetPayloads:{bad:12}},
  ]){const response=await server.inject({method:'POST',url:'/api/rooms/own/brush-library',payload:{presets:[],...body}});expect(response.statusCode).toBe(400)}
  expect(await readdir(join(directory,'assets'))).toEqual([])
  const malformed=await server.inject({method:'POST',url:'/api/rooms/own/brush-library',payload:{presets:[],sourceAssets:[]}});expect(malformed.statusCode).toBe(400)
 }finally{await server.close();vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true})}
})
