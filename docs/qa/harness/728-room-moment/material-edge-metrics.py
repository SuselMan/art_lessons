"""Raw alpha-support observations; these are not artistic quality scores."""
import json,pathlib,sys

def edge_metrics(data,w,h):
 if len(data)!=w*h*4:raise ValueError('Matched material dimensions required')
 a=data[3::4];rows=[];enclosed_row_gaps=0;gap_pixels=0;max_gap=0;edge_count=0
 for y in range(h):
  row=a[y*w:(y+1)*w];present=[x for x,v in enumerate(row)if v]
  if not present:continue
  lo,hi=present[0],present[-1];run=0
  for x in range(lo,hi+1):
   if row[x]==0:run+=1
   elif run:enclosed_row_gaps+=1;gap_pixels+=run;max_gap=max(max_gap,run);run=0
  rows.append({'y':y,'left':lo,'right':hi})
  for x in present:
   if x==0 or y==0 or x==w-1 or y==h-1 or not a[y*w+x-1]or not a[y*w+x+1]or not a[(y-1)*w+x]or not a[(y+1)*w+x]:edge_count+=1
 changes=[abs(p['left']-q['left'])+abs(p['right']-q['right'])for p,q in zip(rows,rows[1:])if q['y']==p['y']+1]
 return{'nonzeroAlpha':sum(v>0 for v in a),'zeroRunsBetweenFirstLastSupportInRow':enclosed_row_gaps,'zeroPixelsBetweenFirstLastSupportInRow':gap_pixels,'maxZeroRun':max_gap,'fourNeighborBoundaryPixels':edge_count,'rowBoundaryVariationTotal':sum(changes),'rowBoundaryVariationMax':max(changes,default=0),'scope':'Alpha>0 exact. Row gaps may touch outer geometry; not closed2Dholes or aesthetic roughness score.'}
if __name__=='__main__':
 p=pathlib.Path(sys.argv[1]);result=edge_metrics(p.read_bytes(),1024,1024);p.with_suffix('.edges.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
