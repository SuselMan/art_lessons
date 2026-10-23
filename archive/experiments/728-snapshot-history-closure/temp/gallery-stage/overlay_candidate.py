"""Build a reviewable overlay candidate in private temp; never publish."""
import json, copy, hashlib, pathlib, importlib.util, argparse
p=argparse.ArgumentParser();p.add_argument('--assets',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);p.add_argument('--preview',required=True);args=p.parse_args()
if not args.preview.startswith('gallery-') or '/' in args.preview or '..' in args.preview:raise ValueError('Unsafe preview name')
manifest=json.loads((args.assets/'manifest.json').read_text())
if not manifest['complete'] or manifest['crops']!=85:raise RuntimeError('Incomplete; no publish candidate')
base=pathlib.Path.home()/'.local/share/stroke-gallery';prior=base/'data/rendered.json';old=json.loads(prior.read_text());draft=json.loads((args.assets/'overlay-draft.json').read_text());new=copy.deepcopy(old)
ids={v['id'] for v in old.get('versions',[])}
if any(v['id'] in ids for v in draft['versions']):raise RuntimeError('Version already exists')
for s in draft['sheets']:
 for st in s['strokes']:
  for f in st['app'].values():
   if not (args.assets/f['src']).is_file():raise RuntimeError('Missing image')
   f['src']='preview/'+args.preview+'/'+f['src']
new.setdefault('versions',[]).extend(draft['versions']);new.setdefault('sheets',[]).extend(draft['sheets'])
assert new['versions'][:len(old['versions'])]==old['versions'] and new['sheets'][:len(old['sheets'])]==old['sheets']
spec=importlib.util.spec_from_file_location('render_overlay',pathlib.Path.home()/'linux-setup/scripts/gallery/render_overlay.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
a=json.loads(((base/'current').resolve()/'docs/reference/strokes/archive.json').read_text());mod.apply_render_overlay(a,new)
vid=draft["versions"][0]["id"];assert sum(vid in st.get("app",{}) for sh in a["sheets"] for st in sh["strokes"])==85
args.out.mkdir(parents=True,exist_ok=True);(args.out/'rendered-candidate.json').write_text(json.dumps(new,ensure_ascii=False,indent=1)+'\n');(args.out/'archive-review.json').write_text(json.dumps(a,ensure_ascii=False,indent=1)+'\n')
comments=base/'data/comments.json';evidence={'published':False,'preview':args.preview,'previousRenderedSHA':hashlib.sha256(prior.read_bytes()).hexdigest(),'commentsCount':len(json.loads(comments.read_text())),'commentsSHA':hashlib.sha256(comments.read_bytes()).hexdigest(),'oldVersionsPreserved':len(old['versions']),'newCrops':85,'newSheets':11};(args.out/'publication-review.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n');print(json.dumps(evidence))
