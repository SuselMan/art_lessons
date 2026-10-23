import random,json,pathlib
r=random.Random(680);checks=10000;maxerr=0
for _ in range(checks):
 raw=[0]*4;sumdelta=[0]*4
 for n in range(8):
  stamp=[r.randrange(256) for _ in range(4)];new=[max(a,b) for a,b in zip(raw,stamp)];delta=[a-b for a,b in zip(new,raw)];sumdelta=[a+b for a,b in zip(sumdelta,delta)];raw=new
 assert sumdelta==raw
# One-dimensional same raw stamp repeated after a mass-conserving shift.
S=[100,0];M=[100,0];moved=[0,100];nextstamp=[100,0]
r7=[max(a,b) for a,b in zip(moved,nextstamp)];delta=[max(a,b)-a for a,b in zip(S,nextstamp)];true=[a+b for a,b in zip(moved,delta)]
out={'integerTelescopingTests':checks,'RGBAChannels':'independent arbitrary byte vectors; no cone assumption','exactSumDeltaEqualsFinalRawMAX':True,'repeatAfterMove':{'initialRaw':S,'movingBeforeRepeat':moved,'newRawStamp':nextstamp,'R7nextMAX':r7,'R7sum':sum(r7),'trueIncrement':delta,'trueMovingNext':true,'trueSum':sum(true)},'clippingCounterexample':{'Mbefore':[200,0],'rawOld':[0,0],'rawNew':[100,0],'unclippedMovingAfter':[300,0],'RGBA8MovingAfter':[255,0],'lost':45},'pairedConeCounterexample':{'rawPrevious':[100,100],'rawNext':[200,150],'delta':[100,50],'note':'componentwise MAX increments need not retain original channel ratio; theorem concerns raw channels not colour/carrier physical validity'}}
pathlib.Path('temp/wc-runs/overnight-next/causal-max-increment-audit/cpu-oracle.json').write_text(json.dumps(out,indent=2)+'\n')
