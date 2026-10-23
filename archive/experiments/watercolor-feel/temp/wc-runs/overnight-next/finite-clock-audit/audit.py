import json,math
from pathlib import Path
base=Path('temp/wc-runs/overnight-next/s6-source-scalar-audit');out=[]
for case,name in [('s6-n6','curvature-yield10-scalar-report.json'),('s9-n3','s9-n3-curvature-yield10-scalar-report.json')]:
 angular=json.loads((base/name).read_text()); baselineName='baseline-scalar-report.json' if case=='s6-n6' else 's9-n3-baseline-scalar-report.json'; d=json.loads((base/baselineName).read_text());
 for report in d['reports']:
  rows=report['rows'];run=8+72*report['profile']['waterLevel'];pol=[]
  for law in ['distance-only','excess-wet-clock','excess-wet-clock-curvature20']:
   p=0;R=1;Q=[]
   for i,r in enumerate(rows):
    step=r['pigUsed']-(rows[i-1]['pigUsed'] if i else 0)
    delta=step
    if law!='distance-only':delta*=r['excess']*(1+r['wet'])
    if law.endswith('curvature20'):delta+=20*angular['reports'][0]['rows'][i]['angularImpulse']
    before=R;p+=delta;R=math.exp(-p/run);Q.append({'Q':before-R,'clockStep':delta,'pathStep':step,'turn':r['turn'],'p':p})
   sumQ=sum(q['Q'] for q in Q);corners=[q['Q']/max(q['pathStep'],1e-9) for q in Q if q['turn']>=.2];body=[q['Q']/max(q['pathStep'],1e-9) for i,q in enumerate(Q) if q['turn']<.05 and rows[i]['pigUsed']>3]
   pol.append({'law':law,'releasedInventoryFraction':sumQ,'remainingInventoryFraction':R,'telescopingError':abs(sumQ+R-1),'finalConsumptionClock':p,'maxPerDabRelease':max(q['Q'] for q in Q),'cornerMeanReleasePerRadius':sum(corners)/len(corners) if corners else None,'bodyMeanReleasePerRadius':sum(body)/len(body) if body else None,'initialReleaseFraction':Q[0]['Q']})
  out.append({'case':case,'strokeId':report['strokeId'],'run':run,'laws':pol})
Path('temp/wc-runs/overnight-next/finite-clock-audit/cpu-results.json').write_text(json.dumps({'scope':'R0=1 normalized inventory; existing recorded scalar coefficients reused, NOT recomputed source scalar feedback after alternative clock, no faithful GPU source geometry. Curvature20 is diagnostic arbitrary global acceleration, not calibrated.', 'results':out},indent=2))
