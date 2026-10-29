#!/usr/bin/env python3
"""Extract observed bytes; never compute compositor expected values.
Usage: python3 extract.py /path/to/private/fixes-v52
The original library is never an input/output file of this extractor.
"""
import hashlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
proof=[]
for source,target,count in [('installed-kernel-all.json','machine-corpus.native.json',2688),('installed-kernel-witness.json','machine-witness.native.json',72),('installed-kernel-custom.json','machine-alpha.native.json',137)]:
 p=root/source;d=json.loads(p.read_text())
 assert d['status']=='PASS' and d['caseCount']==count and d['arithmeticHooks']==0 and d['FPCR']==0 and not d['libraryPersisted']
 assert all(c['wrapperEqual'] for c in d['cases'])
 keys=['scope','librarySHA256','isaGateSHA256','toolWheelSHA256','functionCodeSHA256','inputCorpusSHA256','scriptSHA256']
 compact={k:d[k] for k in keys};compact['cases']=[{'id':c['id'],'pixels':c['direct']['pixels']} for c in d['cases']]
 # Stable whitespace is intentionally immaterial to the numerical oracle.
 (out/target).write_text(json.dumps(compact,separators=(',',':'))+'\n')
 proof.append({'report':source,'reportSHA256':sha(p),'fixture':target,'caseCount':count,'inputSHA256':d['inputCorpusSHA256'],'runnerSHA256':d['scriptSHA256'],'wrapperDirectEqual':True})
(out/'native-proof.json').write_text(json.dumps({'scope':'Original installed ARM64 machine-code emulation, FPCR0, Unicorn 2.1.4 A72; no arithmetic hooks. Not physical CPU/active GUI/paint-device equivalence.','runs':proof},indent=2)+'\n')
