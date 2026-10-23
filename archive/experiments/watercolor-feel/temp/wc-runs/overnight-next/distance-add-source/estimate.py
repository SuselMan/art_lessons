import json,math
from pathlib import Path
root=Path('temp/wc-runs/overnight-next'); out=[]
for case,name in [('s6-n6','baseline-scalar-report.json'),('s9-n3','s9-n3-baseline-scalar-report.json')]:
 report=json.loads((root/'s6-source-scalar-audit'/name).read_text());rows=[r for s in report['reports'] for r in s['rows']] if 'reports' in report else []
 if not rows:
  print(report.keys());continue
 # Diagnostic circular kernel, not engine raster: band interpolated at segment midpoint.
 step=4.; x0=min(r['x']-2*r['minor'] for r in rows);y0=min(r['y']-2*r['minor'] for r in rows)
 maxima={};add={};visits={};scalarfilm=scalaradd=0
 for r in rows:
  radius=r['radius'];seg=r['dist'] if r['dist']>.01 else (radius*.5 if r['keptIndex']==0 else radius*.12)
  sf=r['stampFilmDose'];bf=r['bandFilmDose'];share=report['reports'][0]['profile']['stampInkShare']
  sa=sf/1.4*(seg/radius)*share;ba=bf/2.8*(r['dist']/radius)*(1-share)
  scalarfilm+=sf+bf;scalaradd+=sa+ba
  for cx,cy,f,a in [(r['x'],r['y'],sf,sa),(r['x']-r['dx']*.5,r['y']-r['dy']*.5,bf,ba)]:
   rad=r['minor'];ix0=math.floor((cx-2*rad-x0)/step);ix1=math.ceil((cx+2*rad-x0)/step);iy0=math.floor((cy-2*rad-y0)/step);iy1=math.ceil((cy+2*rad-y0)/step)
   for iy in range(iy0,iy1+1):
    for ix in range(ix0,ix1+1):
     q=((x0+ix*step-cx)/rad)**2+((y0+iy*step-cy)/rad)**2
     if q>4:continue
     k=math.exp(-2*q);key=(ix,iy);maxima[key]=max(maxima.get(key,0),f*k);add[key]=add.get(key,0)+a*k;visits[key]=visits.get(key,0)+(k>.2)
 vals=list(add.values());m=list(maxima.values())
 out.append({'case':case,'keptDabs':len(rows),'sourceScalarSumFilm':scalarfilm,'sourceScalarSumADD':scalaradd,'approxKernelIntegralFilmMAX':sum(m)*step*step,'approxKernelIntegralDistanceADD':sum(vals)*step*step,'approxIntegralRatioADDoverFilmMAX':sum(vals)/sum(m),'approxMaxFilm':max(m),'approxMaxADD':max(vals),'approxOver1FilmCells':sum(v>1 for v in m),'approxOver1ADDCells':sum(v>1 for v in vals),'maxKernelRevisitCount':max(visits.values())})
(root/'distance-add-source/cpu-overlap-estimate.json').write_text(json.dumps({'model':'Diagnostic circular Gaussian radius=minor, stamp endpoint+band midpoint surrogate, 4worldpx grid; actual engine triangles, anisotropic nib, paper, mask, halo, vertex interpolation NOT modeled. Numbers are not actual GPU mass or source calibration. No finite brush inventory.', 'results':out},indent=2))
