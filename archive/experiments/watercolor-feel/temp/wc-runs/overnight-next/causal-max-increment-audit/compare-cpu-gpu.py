import pathlib,json,sys
cpu=pathlib.Path(sys.argv[1]);gpu=pathlib.Path(sys.argv[2]);cr=json.loads((cpu/'cpu-calibrated-report.json').read_text());gr=json.loads((gpu/'report.json').read_text());out={}
for mode in ['trueIncrement','wholePrefixRefill','finalSourceFirst']:
 row={}
 for k in ['P','C']:
  a=(cpu/('cpu-calibrated-'+mode+'-'+k+'.rgba')).read_bytes();b=(gpu/(mode+'-'+k+'.rgba')).read_bytes();assert len(a)==len(b);row[k]={'MAEcodes':sum(abs(x-y) for x,y in zip(a,b))/len(a),'maxCode':max(abs(x-y) for x,y in zip(a,b)),'differentCells':sum(any(a[i+q]!=b[i+q] for q in range(4)) for i in range(0,len(a),4)),'signedChannelSumDifference':[sum(b[q::4])-sum(a[q::4]) for q in range(4)]}
 row['GPUdepositionClipping']=[s['depositClippingCodes'] for s in gr['models'][mode]['stages']];row['GPUfloatClampResiduals']=[s['depositFloatClampResiduals'] for s in gr['models'][mode]['stages']];row['GPUalphaResidualPC']=gr['models'][mode]['alphaResidualPC'];row['GPUstrengthResidualBA']=gr['models'][mode]['strengthResidualBA'];row['GPUtransportMassFailures']=[c for s in gr['models'][mode]['stages'] for c in s['contacts'] if not c['massExact']];out[mode]=row
(gpu/'cpu-gpu-comparison.json').write_text(json.dumps({'comparison':out,'limits':['GPU float32 vs CPUdouble boundary arithmetic/floor ties may differ','CPU skips cross-scissor edges whereas GPU draws fullROI with hardzero flow; compare this explicit scope','No optical/photo claims, actual four captured prefixes only']},indent=2))
