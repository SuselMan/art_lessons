#!/usr/bin/env python3
"""Preserve only the native target anatomy experiment; never resume old queues."""
import hashlib,json,os,pathlib,shutil,datetime
cache=pathlib.Path(os.environ['QA_CACHE']).resolve()
dest=pathlib.Path.home()/'.local/share/project-services/gl1-review/flow-805-20261018/native-anatomy/evidence'
dest.mkdir(parents=True,exist_ok=True,mode=0o700)
rows=[]
def put(source,relative):
 target=dest/relative;target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);data=source.read_bytes();sha=hashlib.sha256(data).hexdigest()
 if target.exists():
  if hashlib.sha256(target.read_bytes()).hexdigest()!=sha: raise RuntimeError('Immutable archive conflict: '+str(target))
 else:
  shutil.copy2(source,target)
 target.chmod(0o600);rows.append({'source':str(source),'archive':str(relative),'sha256':sha,'bytes':len(data)})
folders=['extension-probe','baseline-calibration','baseline-matched','trace-calibration','trace-calibration-v3','prefix-calibration','prefixes','snapshots-replay','snapshots-extra','trace-warm-three','control-warm-three','two-colors-trace-warm-three','two-colors-control-warm-three','two-colors-snapshots','two-colors-snapshots-extra']
for name in folders:
 folder=cache/name
 if not folder.exists():continue
 for source in sorted(folder.rglob('*')):
  if source.is_file() and source.suffix in ['.json','.gz']:put(source,pathlib.Path('results')/name/source.relative_to(folder))
for name in ['source-passport.json']:
 if(cache/name).exists():put(cache/name,pathlib.Path(name))
for source in sorted((cache/'stage-build-v5').rglob('*')):
 if source.is_file():put(source,pathlib.Path('build-v5')/source.relative_to(cache/'stage-build-v5'))
root=pathlib.Path(__file__).resolve().parents[4]
for pattern in ['docs/qa/prototypes/native-anatomy-805/*.ts','docs/qa/prototypes/native-anatomy-805/source-taps.cjs','docs/qa/prototypes/native-anatomy-805/native-stages.json','docs/qa/harness/805-algorithm-search/native-stage-*','docs/qa/prototypes/mini-worker/{unused}']:
 for source in sorted(root.glob(pattern)):
  if source.is_file():put(source,pathlib.Path('source-current-at-preservation')/source.relative_to(root))
for relative in ['watercolor/puddle/PuddleTarget.ts','watercolor/puddle/ContrastPhase.ts','watercolor/puddle/BackgroundMix.ts','raster/WatercolorSettlePlan.ts','raster/WatercolorFrontPaths.ts']:
 source=root/'apps/web/src/engine/src'/relative;put(source,pathlib.Path('source-current-at-preservation')/source.relative_to(root))
for name in ['build.cjs','controller.ts','runtime.ts','native-component-source.ts','native-component-timed.ts','native-component-partition.ts','native-component-timed-goal.ts']:
 source=root/'docs/qa/prototypes/mini-worker'/name;put(source,pathlib.Path('source-current-at-preservation')/source.relative_to(root))
manifest={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'qualification':'Actual Samsung native target anatomy only. Immutable exact build-v5 is execution authority; source-current-at-preservation is labelled separately (postbuild type-only fixes possible). Prefix differences nonmonotonic and NOT valid additive GPU stage times. Old matrices/Curtis not resumed.','files':rows,'externalImmutableSourceArchive':str(pathlib.Path.home()/'.local/share/project-services/gl1-review/flow-805-20261018/curtis-transport/native'),'totalBytes':sum(x['bytes'] for x in rows)}
(dest/'manifest.json').write_text(json.dumps(manifest,indent=2));(dest/'manifest.json').chmod(0o600)
for x in rows:
 assert hashlib.sha256((dest/x['archive']).read_bytes()).hexdigest()==x['sha256']
print(json.dumps({'archive':str(dest),'files':len(rows),'MiB':round(manifest['totalBytes']/1048576,2),'verified':True}))
