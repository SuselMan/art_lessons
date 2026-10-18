#!/usr/bin/env python3
"""Private exact-byte evidence archive, no GPU actions and no cache deletions."""
import pathlib,json,gzip,hashlib,os,shutil
cache=pathlib.Path(os.environ['QA_CACHE']);dest=pathlib.Path.home()/'.local/share/project-services/gl1-review/flow-805-20261018/curtis-transport';dest.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(dest,0o700);objects=dest/'_objects';objects.mkdir(exist_ok=True,mode=0o700);pathmap=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def put(relative,data,source=None,linkSource=None):
 h=sha(data);obj=objects/h
 if obj.exists():assert sha(obj.read_bytes())==h
 else:
  if linkSource and pathlib.Path(linkSource).stat().st_mode&0o777==0o600:os.link(linkSource,obj)
  else:obj.write_bytes(data);obj.chmod(0o600)
 p=dest/relative;p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if p.exists():assert sha(p.read_bytes())==h
 else:os.link(obj,p)
 pathmap.append({'archive':str(relative),'sha256':h,'bytes':len(data),**({'source':str(source)}if source else{})});return p
root=pathlib.Path(__file__).resolve().parents[4];source=cache/'curtis-final7-v5-split-fixtures';q=json.loads((source/'queue.json').read_text());assert q.get('pass')and len(q['runs'])==7,'Only a CLOSED seven-fixture series can be archived as final';ids=[r['fixture']for r in q['runs']];put('curtis/queue.json',(source/'queue.json').read_bytes(),source/'queue.json')
for item in q['runs']:
 report=pathlib.Path(item['report']);r=json.loads(report.read_text());assert r['pass']and r['sourceStable']and r['contextClosed']and len(r['cases'])==5;put(pathlib.Path('curtis/fixtures')/item['fixture']/'report.json',report.read_bytes(),report)
 for row in r['cases']:
  assert row['pass']and len(row['executionRequests'])==3;f=report.parent/row['png']['file'];assert sha(f.read_bytes())==row['png']['sha256'];put(pathlib.Path('curtis/fixtures')/item['fixture']/row['png']['file'],f.read_bytes(),f)
catalog=json.loads(pathlib.Path('/home/suselman/.cache/codex-qa/flow805-frozen-input30/catalog.json').read_text());archived=json.loads(pathlib.Path.home().joinpath('.local/share/project-services/gl1-review/flow-805-20261018/frozen-inputs-30/catalog-archived.json').read_text());inputs=[]
for row in catalog:
 if row['id']not in ids:continue
 b=pathlib.Path(row['input']).read_bytes();assert len(b)==6291456 and sha(b)==row['binarySHA256'];archivedInput=next(x for x in archived if x['id']==row['id']);compressed=pathlib.Path(archivedInput['inputGzip']).read_bytes();assert gzip.decompress(compressed)==b;rel=pathlib.Path('inputs')/(row['id']+'.bin.gz');put(rel,compressed,archivedInput['inputGzip'],linkSource=archivedInput['inputGzip']);meta=pathlib.Path(row['metadata']);put(pathlib.Path('inputs')/(row['id']+'.metadata.json'),meta.read_bytes(),meta);inputs.append({'id':row['id'],'gzip':str(rel),'gzipSHA256':sha(compressed),'binarySHA256':sha(b),'decodedBytes':len(b),'sha':row['sha'],'encoding':row['encoding']})
put('inputs/catalog.json',json.dumps(inputs,indent=2).encode())
build=cache/'curtis-transport-build-v5';manifest=json.loads((build/'manifest.json').read_text());put('curtis/build/manifest.json',(build/'manifest.json').read_bytes(),build/'manifest.json')
for f in manifest['files']:
 if f['file'].startswith('fixtures/'):continue
 b=(build/f['file']).read_bytes();assert sha(b)==f['sha256'];put(pathlib.Path('curtis/build')/f['file'],b,build/f['file'])
native=cache/'native-component-matrix-results';nr=json.loads((native/'report.json').read_text());assert len(nr['cases'])==28 and all(r['pass']and r['request']['fixture']in ids for r in nr['cases']);put('native/report.json',(native/'report.json').read_bytes(),native/'report.json')
seen=set()
for row in nr['cases']:
 for key in ['sourceEvidence','endpoint','commonCarrier','commonPNG']:
  f=native/row[key]['file']
  if f in seen:continue
  seen.add(f);data=f.read_bytes();expected=row[key].get('gzipSHA')or row[key]['sha256'];assert sha(data)==expected;put(pathlib.Path('native')/row[key]['file'],data,f)
for arm in ['original','lazy','one-octave','cache']:
 b=cache/('native-component-v5-'+arm);m=json.loads((b/'manifest.json').read_text());put(pathlib.Path('native/builds')/arm/'manifest.json',(b/'manifest.json').read_bytes(),b/'manifest.json')
 for f in m['files']:
  data=(b/f['file']).read_bytes();assert sha(data)==f['sha256'];put(pathlib.Path('native/builds')/arm/f['file'],data,b/f['file'])
for name in ['curtis-tiny-output-probes','curtis-gate-zero-v2-results','curtis-gate-zero-v3-results']:
 p=cache/name/'report.json';put(pathlib.Path('precision')/(name+'.json'),p.read_bytes(),p)
for folder,pattern in [('docs/qa/harness/805-algorithm-search','curtis-*'),('docs/qa/prototypes/rebelle-transport-805','**/*')]:
 for p in (root/folder).glob(pattern):
  if p.is_file()and '__pycache__'not in p.parts:put(pathlib.Path('source')/p.relative_to(root),p.read_bytes(),p)
passport=json.loads((build/'source-passport.json').read_text())
for name,expected in passport['sources'].items():
 p=root/name;data=p.read_bytes()
 if sha(data)!=expected and name.endswith('/curtis-worker.ts'):data=data.replace(b'stateHashes:Record<string,string>[]=[];',b'stateHashes=[];')
 assert sha(data)==expected,'Frozen source reconstruction differs '+name
 put(pathlib.Path('source/frozen-v5')/name,data,p)
for p in cache.glob('curtis-*-health.json'):put(pathlib.Path('health')/p.name,p.read_bytes(),p)
put('README.txt',b'Private Curtis seven-fixture evidence. Original closed JSON and hashes are unchanged. Relative PNG/native artifact paths are preserved inside their archived report directories. Inputs are exact6MiB gzip; verify gzipSHA then decode and verify binarySHA and three fieldSHA. Build fixture paths reconstruct from inputs/catalog.json; no runtime/dependency copies. Diagnostic64MiB raw GPU dumps were not persisted. Native28 proofs are component-isolated current source, not old native-all13. Source/source-passport binds actual compiled worker. All timings include actual input fence and full16MiB output; raw audits/hash/PNG are outside. Old135/timed120 stayed stopped.\n')
summary={'scope':'Curtis seven actual inputs and35closedcheckpoints/105actualexecutions; native28 actual comparison proofs; no old130worker artifacts','files':pathmap,'inputCount':len(inputs),'closedCurtisCases':35,'nativeCells':28,'uniqueObjectBytes':sum(p.stat().st_size for p in objects.iterdir()),'pathmapDoesNotRewriteOriginalJSON':True};p=dest/'preservation-manifest.json';p.write_text(json.dumps(summary,indent=2));p.chmod(0o600)
for folder in dest.rglob('*'):
 if folder.is_dir():folder.chmod(0o700)
for row in pathmap:assert sha((dest/row['archive']).read_bytes())==row['sha256']
print(json.dumps({'archive':str(dest),'files':len(pathmap),'inputs':len(inputs),'closedCases':35,'nativeCells':28,'uniqueMiB':round(summary['uniqueObjectBytes']/2**20,2),'verified':True}))
