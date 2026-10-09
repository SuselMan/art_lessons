"""RGB chromatic contrast proxy, not physical pigment mass or premultiplied alpha."""
import json,sys,pathlib,math
from analyzeMorphFilmstrip import load_png

def radial(path):
 w,h,c,p=load_png(path); result={}
 for threshold in [2,5,10,20]:
  cells=[]
  for y in range(h):
   for x in range(w):
    i=(y*w+x)*c;r,g,b=p[i:i+3];v=max(0,(r+b)/2-g)
    if v>threshold:cells.append((x,y,v))
  total=sum(v for x,y,v in cells)
  if total:
   cx=sum(x*v for x,y,v in cells)/total;cy=sum(y*v for x,y,v in cells)/total;variance=sum(((x-cx)**2+(y-cy)**2)*v for x,y,v in cells)/total
  else:cx=cy=variance=None
  result[str(threshold)]={'pixels':len(cells),'contrastIntegral':total,'peak':max((v for x,y,v in cells),default=0),'centroidPx':[cx,cy],'variancePx2':variance}
 return result
if __name__=='__main__':
 raw=json.loads(pathlib.Path(sys.argv[1]).read_text());s=raw['rows'][0]['scenario'];out={'scope':'Rendered RGB violet chroma ((R+B)/2-G), thresholded, neutral wet-paper excluded; NOT physical mass, alpha, optical depth or same-tape canonical comparison','frames':[]}
 for phase,key in [('up','filmstrip'),('handoff','handoffFilmstrip')]:
  for f in (s.get(key) or {}).get('frames',[]):out['frames'].append({'phase':phase,'elapsed':f.get('elapsed'),'path':f['path'],'radial':radial(f['path'])})
 print(json.dumps(out,indent=2))
