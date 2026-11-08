import{expect,it}from'vitest'
import{cloneSourceRound152,cloneSourceOffset152}from'./cloneHealing152Request'
it('accepts fractional source metadata and applies pinnedQt5 rounding to actual source point',()=>{expect([-.5,-1.5,.5,1.5].map(cloneSourceRound152)).toEqual([0,-1,1,2]);const rect={minX:-10,minY:-4,maxX:10,maxY:8},source={x:-.5,y:1.5,offsetX:.25,offsetY:-.5};expect(cloneSourceOffset152(rect,{x:0,y:0},source,true)).toEqual({x:0,y:0});expect(cloneSourceOffset152(rect,{x:2,y:3},source,false)).toEqual({x:-2,y:-1});expect(()=>cloneSourceRound152(Infinity)).toThrow()})
