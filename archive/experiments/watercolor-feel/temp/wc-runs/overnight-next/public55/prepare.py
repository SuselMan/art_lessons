from pathlib import Path
import json,hashlib,shutil
r=Path(__file__).resolve().parents[1];dest=r/'critical-accepted-publication-ready';dest.mkdir(exist_ok=True);variant='production-calibrated-pool-beer85-softshoulder16';inputs=json.loads((r/'inputs.json').read_text());byid={c['id']:c for c in inputs['cases']};ids=['s3-n1','s4-n1','s10-n3','s6-n6','s9-n3'];indexes={'baseline':{},variant:{}};proof=[]
bases={'s3-n1':r/'puddle3-baseline','s4-n1':r/'carry-fields-production','s10-n3':r.parent/'overnight-2026-10-04/baseline','s6-n6':r/'transport-global-audit/s6-n6-production','s9-n3':r/'transport-global-audit/s9-n3-production'}
for cid in ids:
 for tag,source in [('baseline',bases[cid]),(variant,r/('softshoulder16-critical-three' if cid in ids[:3] else 'saturating-beer-softshoulder16-four'))]:
  p=dest/tag;p.mkdir(exist_ok=True);name=source.parent.name+'-'+source.name+'-report.json';shutil.copyfile(source/'report.json',p/name);image=source/(cid+'.png');image=image if image.exists() else r/'production'/(cid+'.png');shutil.copyfile(image,p/(cid+'.png'))
  s=json.loads((p/name).read_text());row=next(c for c in s['cases'] if c['id']==cid);sha=hashlib.sha256((p/(cid+'.png')).read_bytes()).hexdigest();assert row['pngSha256']==sha;assert row['variant']==tag;indexes[tag][cid]=name;proof.append({'id':cid,'variant':tag,'originalReport':str(source/'report.json'),'reportSHA':hashlib.sha256((p/name).read_bytes()).hexdigest(),'PNGsha':sha})
for tag,mapping in indexes.items():(dest/tag/'report-index.json').write_text(json.dumps({'cases':mapping},indent=2)+'\n')
cs=[byid[x] for x in ids];batches=json.loads(Path('/home/suselman/.local/share/stroke-gallery/data/review-batches.json').read_text())
for c in cs:
 if 'inputSha256'in c:continue
 compact=hashlib.sha256(json.dumps(c['ops'],sort_keys=True,separators=(',',':')).encode()).hexdigest();spaced=hashlib.sha256(json.dumps(c['ops'],sort_keys=True).encode()).hexdigest();old=[t['inputSha256'] for b in batches for t in b['cases'] if t['sheet']==c['sheet'] and t['n']==c['n'] and 'inputSha256'in t];assert compact in old or spaced in old,c['id'];c['inputSha256']=compact if compact in old else spaced
inputs['cases']=cs;(dest/'inputs.json').write_text(json.dumps(inputs,ensure_ascii=False,indent=2)+'\n');(dest/'provenance-copy-qc.json').write_text(json.dumps(proof,indent=2)+'\n');config={'baseline':'baseline','description':'Дополнительная проверка выбранного варианта: пигмент в луже, проход через воду и движение туда-обратно. Для контекста — основные примеры листов6 и9. Сравнение с текущим production; фото — ориентир.','comparisons':[{'case':cid,'candidate':variant} for cid in ids]};(r/'public55/config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');print('prepared',len(cs))
