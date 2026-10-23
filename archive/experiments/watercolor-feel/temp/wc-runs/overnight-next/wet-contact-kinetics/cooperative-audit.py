import json,math,statistics
from pathlib import Path
r=Path(__file__).parent;data=json.load(open(r/'predictions.json'));result=[]
def percentile(vals,p):
 s=sorted(vals);i=(len(s)-1)*p;lo=int(i);return s[lo]+(s[min(lo+1,len(s)-1)]-s[lo])*(i-lo)
for rep in data['reports']:
 rows=[x for x in rep['rows']if x['wet']>0]
 if not rows:continue
 vals=[x['contactMs']for x in rows];finite=[v for v in vals if v<1000];tauResults=[]
 for tau in [25,50,75]:
  k=[1-x['wet']*math.exp(-(x['contactMs']/tau)**2)for x in rows];kf=[1-x['wet']*math.exp(-(x['contactMs']/tau)**2)for x in rows if x['contactMs']<1000]
  tauResults.append({'tauMs':tau,'meanSourceMultiplier':statistics.mean(k),'suppressionFraction':1-statistics.mean(k),'finiteMeanMultiplier':statistics.mean(kf),'minMultiplier':min(k),'maxMultiplier':max(k)})
 result.append({'case':rep['case'],'strokeId':rep['strokeId'],'preset':rep['preset'],'wetCount':len(rows),'stationaryEMAStartCount':sum(v>=1000for v in vals),'contactMsQuantiles':{str(p):percentile(vals,p)for p in [0,.1,.25,.5,.75,.9,1]},'finiteContactMsRange':[min(finite),max(finite)],'finiteContactMsMedian':statistics.median(finite),'cooperative':tauResults})
# Bounds: want keep3>=90% on its WORST movingdab and4<=50% on its SLOWEST crossing; cooperative exp model assumptionsfullwet.
v3=next(x for x in result if x['case']=='s3-n1');v4=next(x for x in result if x['case']=='s4-n1');t3=v3['finiteContactMsRange'][0];t4=v4['finiteContactMsRange'][1]
keep3TauMax=t3/math.sqrt(-math.log(.1));half4TauMin=t4/math.sqrt(-math.log(.5))
# weighted average notactualGPU MAXsource estimate deliberatelynotclaim.
report={'source':'CPU keptdabs existing sourceEMA speed, minor/v proxy, noGPU','cooperativeLaw':'k=(1-wet)+wet*(1-exp(-(contactMs/tau)^2)); tau shared25/50/75 ms, notperfixturefit','reports':result,'separationBound':{'target':'keep all finite3dabs>=90%, attenuateall4wetcontacts<=50%','keep3TauMaxMs':keep3TauMax,'half4TauMinMs':half4TauMin,'possible':keep3TauMax>=half4TauMin,'reason':'Finiteproxycontact distributions overlap/barely separate at33.77vs31.68; no globaltau meetsstrongguarantee.','note':'Thresholdboundsmin/max are explanatory, notselectingtaufromfixtures.'},'limitations':['Initial speedEMA0 givescontactMs~50000..99000ms, not actual dwell; excludeinit forphysicalrange.','Arithmeticmean per-keptdab isnot deliveredpigmentmass orGPUspatialMAXresult.','minor/v ishalfwidth proxy; true residence uses direction-dependent2*travelRadius/v and pressurecontactarea.','No depositedpigmentreturn means proposedsource suppression losesmass byconstruction; cooperativecurve remainsphenomenologicaldiagnostic.','Recordedwet digit mixedpartialwetness; statedallwetbound presumesw=1.','Colour/pigment changesrequirepairedsource law; originalbanddepthdosequadratic changes suppressionsquared and cancorrupt experimental optical interpretation.']}
(r/'cooperative-summary.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
