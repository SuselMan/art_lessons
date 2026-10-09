import {it,expect} from 'vitest'
import {frontFilmHoistShader} from './frontFilmHoist'
import {frontSamplingShader} from './frontSampling'
import {CANONICAL_WATER_FRONT_WGSL,CANONICAL_CACHED_WATER_FRONT_WGSL} from './kernels'
it('OFF retains exact source and ON changes only lazy invariant anchors for every source factory',()=>{for(const base of [CANONICAL_WATER_FRONT_WGSL,CANONICAL_CACHED_WATER_FRONT_WGSL])for(const sampling of [undefined,'manual','hardware'] as const){const source=frontSamplingShader(base,sampling);expect(frontFilmHoistShader(source,false)).toBe(source);const on=frontFilmHoistShader(source,true);expect(on).toContain('if(!filmReady){film=');expect(on.indexOf('if(!filmReady){film=')).toBeGreaterThan(on.indexOf('if(ci>=0.999){continue;}'));expect(on.replace('var film=0.0;var filmReady=false;\n ','').replace(/if\(!filmReady\)\{film=([^;]+);filmReady=true;\}/,'let film=$1;')).toBe(source)}})
it('unexpected duplicated or missing source anchors fail closed',()=>{expect(()=>frontFilmHoistShader('bad',true)).toThrow();expect(()=>frontFilmHoistShader(CANONICAL_WATER_FRONT_WGSL+CANONICAL_WATER_FRONT_WGSL,true)).toThrow()})
