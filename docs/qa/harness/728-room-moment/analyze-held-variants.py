"""Quantify ROI dose/gaps; no artistic verdict or whole-stamp mass claim."""
import importlib.util,json,pathlib,sys
spec=importlib.util.spec_from_file_location('factors',pathlib.Path(__file__).with_name('analyze-held-factors.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=pathlib.Path(sys.argv[1]);report=json.loads((r/'report.json').read_text())
if not report.get('valid'):raise ValueError('Capture not valid')
out=[]
for pressure in [.7,.1,.02,0]:
 baseline={g:(r/f'{pressure}-literal-{g}.rgba').read_bytes() for g in ['amount','coverage','contact']}
 for variant in ['literal','A','B']:
  fields={g:(r/f'{pressure}-{variant}-{g}.rgba').read_bytes() for g in baseline}
  pb=list(fields['amount'][2::4]);water=list(fields['amount'][::4]);cov=list(fields['coverage'][3::4]);nib=list(fields['contact'][::4]);tip=list(fields['contact'][2::4]);basePB=list(baseline['amount'][2::4]);baseW=list(baseline['amount'][::4])
  rows=[sum(pb[y*96+x]==0 and nib[y*96+x]==255 for x in range(96))for y in range(96)]
  out.append({'pressure':pressure,'variant':variant,'PBvsLiteral':m.difference(pb,basePB),'ROIwaterSum':sum(water),'ROIwaterDelta':sum(water)-sum(baseW),'ROIPBsum':sum(pb),'ROIPBdelta':sum(pb)-sum(basePB),'interiorZeroPB':sum(v==0 and n==255 for v,n in zip(pb,nib)),'rowsWithInteriorZero':sum(v>0 for v in rows),'maxInteriorZerosInRow':max(rows),'contactZeroInterior':sum(t==0 and n==255 for t,n in zip(tip,nib)),'coverageSum':sum(cov),'critical':[{ 'x':x,'yTop':439,'PB':pb[(439-352)*96+x-384],'water':water[(439-352)*96+x-384],'tipQ8':tip[(439-352)*96+x-384]}for x in [457,458,459]],'scope':'ROI dose only; fixed radius across pressures, not full gesture/release geometry.'})
  for name,channel in [('PB',pb),('water',water),('coverage',cov),('tip',tip)]:m.png(r/f'{pressure}-{variant}-{name}.png',96,96,channel)
(r/'variant-analysis.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
