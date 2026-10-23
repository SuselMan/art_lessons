import json,base64,math,struct
from pathlib import Path
root=Path(__file__).parent
d=json.loads((root/'production-stages/s4-n1-stages.json').read_text())
def decode(s):
 b=base64.b64decode(s['rgba']);return [list(b[i:i+4])for i in range(0,len(b),4)]
def stats(s):
 a=decode(s);n=len(a)
 return {'count':n,'meanRGBA':[round(sum(v[c]for v in a)/n,5)for c in range(4)],'maxRGBA':[max(v[c]for v in a)for c in range(4)],'saturatedRGBA':[sum(v[c]==255 for v in a)for c in range(4)],'BgtA':sum(v[2]>v[3]for v in a),'sumBminusA':sum(v[2]-v[3]for v in a),'opticalMassMean':round(sum(min(v[2],v[3])for v in a)/n/255,6)}
rows=[]
for i,f in enumerate(d['frames']):
 rows.append({'frame':i,**{k:f[k]for k in ['stage','settleNo','role','bufferId','mapping','fieldSize']},'samples':{s['name']:stats(s)for s in f['samples']if 'rgba'in s}})
summary={'pixelConvention':'world centres x=x0+(GLx+.5)*S; y=y0+(fieldH-GLy-.5)*S. ReadPixels rows bottom-up. Fixed cross world x1280.5..1775.5 y301.5.', 'limitations':['Small horizontal sections and 3 fixed ROIs; not full mass conservation integral.','First-contact brush snapshots outside scissor contain old pressure/band; do not interpret these cells as new pigment.','mode18 a already mutated via prior copy; no before/after remob from its a vs out. base b is zero here: remob adds no old fixed paint.','Current final-pressure postsettle has reused role, not physical final dry mass.','Carry captures first3 only; mode18 mobile after whole carry and before coarse diffusion is valid source boundary.'], 'verdict':{'waterRegistration':'Confirmed at central ROI: initial coverageA/B255, mode11 costR0, domeA255.','mobility':'Confirmed: split k1 and base0, core B255->179.06 before coarse diffusion->170.29 before brush->169.41 after brush.','sourceHeadroom':'Cross initial B255 on324/496 cells (65.3%). Center completely saturated A/B; source structure cannot be recovered after clipping. This establishes saturation, not source-law cause.','vectorMaxDilution':'Not established in central ROI: B=A255 initially. Initial cross B>A3 cells only.','BgtA':'53/496 after diffusion versus3 before; local one-code rounding mostly. min(B,A) slightly changes physical optical mass, cannot explain large opaque core.','display':'Core optical mass after brush .66435, still substantial. Final binding/opacity not captured by this small-stage probe, so display diagnosis remains incomplete.'},'frames':rows}
(root/'numerical-stage-summary.json').write_text(json.dumps(summary,indent=2))
# Self-contained labelled vector plot, no GPU or extra dependencies.
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1020" viewBox="0 0 1240 1020"><rect width="1240" height="1020" fill="white"/><style>text{font-family:monospace;font-size:13px} .title{font-size:20px;font-weight:bold}</style>','<text class="title" x="25" y="28">s4-n1: physical source / water / transport stages</text>','<text x="25" y="52">Crosssection y=301.5; world x=1280.5..1775.5; 3 ROI centres x=1404,1528,1652</text>']
colors=['#c72527','#1570b5','#279447','#833ea4']
sets=[([37,54,74,80],'Pigment B: source / after carry before remob(add=0) / before brush / after brush'),([39,40,59],'Water domain: coverage A / extended A / dome-gate B'),([37,74,80],'A vs B divergence: B-A in byte codes')]
for row,(indices,title)in enumerate(sets):
 x,y,w,h=70,105+row*280,1080,195
 svg.append(f'<text x="25" y="{y-15}">{title}</text><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fafafa" stroke="#bbb"/>')
 for tick in [0,.25,.5,.75,1]:
  yy=y+h*(1-tick);svg.append(f'<path d="M{x} {yy}H{x+w}" stroke="#ddd"/><text x="28" y="{yy+4}">{round(255*tick) if row<2 else round(12*tick-6)}</text>'.replace('&lt;','<'))
 for j,index in enumerate(indices):
  f=d['frames'][index];a=decode(next(s for s in f['samples']if s['name']=='cross'))
  if row==0:vals=[v[2]/255 for v in a]
  elif row==1: vals=[v[3 if index!=59 else 2]/255 for v in a]
  else:vals=[max(0,min(1,(v[2]-v[3]+6)/12))for v in a]
  pts=' '.join(f'{x+i*w/(len(vals)-1):.2f},{y+h*(1-v):.2f}'for i,v in enumerate(vals))
  svg.append(f'<polyline points="{pts}" fill="none" stroke="{colors[j]}" stroke-width="1.7"/><text x="{75+j*285}" y="{y+h+25}" fill="{colors[j]}">frame {index}: {f["stage"]} {f["role"]}</text>')
 for xx in [1404,1528,1652]:
  px=x+(xx-1280)/496*w;svg.append(f'<path d="M{px} {y}V{y+h}" stroke="#666" stroke-dasharray="3 5"/><text x="{px-18}" y="{y+h+45}">{xx}</text>')
svg+=['<text x="25" y="978">Source centre saturated; registered water; transport reduces core but does not erase it.</text>','<text x="25" y="1003">B-A graph clipped to [-6,+6]. Local sections are not whole-field mass integrals.</text></svg>']
(root/'stage-crosssections.svg').write_text('\n'.join(svg))
print('Wrote numerical-stage-summary.json and stage-crosssections.svg')
