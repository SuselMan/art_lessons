import {expect,it} from 'vitest'
import {m70WindowGroups} from './M70WindowGroups'
import {m70Windows} from './M70WindowPolicy'

it.each([[1536,1536,1],[1240,1754,3],[1754,1240,3],[1754,2480,18],[2480,3508,60]])(
  'solves duplicate windows once on %ix%i and preserves every certified interior',(width,height,count)=>{
    const page={width,height},domain={width:Math.max(1536,Math.ceil(width/256)*256),height:Math.max(1536,Math.ceil(height/256)*256)}
    const groups=m70WindowGroups(page,domain,612),windows=m70Windows(page,domain,612)
    expect(groups).toHaveLength(count)
    const original=new Map(windows.map(w=>[`${w.core.x},${w.core.y}`,w]))
    for(const group of groups)for(const core of group.cores){
      const key=`${core.x},${core.y}`,expected=original.get(key)
      expect(expected).toEqual({field:group.field,core});original.delete(key)
    }
    expect(original.size).toBe(0)
  })
