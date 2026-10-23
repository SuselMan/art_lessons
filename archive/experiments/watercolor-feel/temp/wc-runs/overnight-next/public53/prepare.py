from pathlib import Path
import json,hashlib,shutil
r=Path(__file__).resolve().parents[1]; dest=r/'morning-accepted-publication-ready';dest.mkdir(exist_ok=True)
variant='production-calibrated-pool-beer85-softshoulder16'
inputs=json.loads((r/'inputs.json').read_text());primary={c['id']:c for c in inputs['cases']};hold={c['id']:c for c in json.loads((r/'optics-independent-holdouts/preview-inputs.json').read_text())['cases']}
cases=[hold[x] for x in ['s6-n5','s9-n1','s9-n5']]+[primary[x] for x in ['s8-n1','s7-n3']]
# Add the first-stroke control only once its independently rendered report exists.
one=r/'softshoulder16-straight-control-one'
if (one/'report.json').exists(): cases.append(primary['s1-n1'])
indexes={'baseline':{},variant:{}};proof=[]
for c in cases:
 cid=c['id'];sourcebase=r/('holdout-production' if cid in hold else 'production-fields')
 sourcecandidate=r/('optics-holdout-softshoulder16-three' if cid in hold else ('softshoulder16-straight-control-one' if cid=='s1-n1' else 'saturating-beer-softshoulder16-four'))
 for tag,source in [('baseline',sourcebase),(variant,sourcecandidate)]:
  p=dest/tag;p.mkdir(exist_ok=True);name=source.name+'-report.json'
  shutil.copyfile(source/'report.json',p/name); imageSource=source/(cid+'.png'); imageSource=imageSource if imageSource.exists() else r/'production'/(cid+'.png'); shutil.copyfile(imageSource,p/(cid+'.png'))
  report=json.loads((p/name).read_text());row=next(z for z in report['cases'] if z['id']==cid)
  sha=hashlib.sha256((p/(cid+'.png')).read_bytes()).hexdigest();assert sha==row['pngSha256'];assert row['variant']==tag
  indexes[tag][cid]=name;proof.append({'case':cid,'variant':tag,'source':str(source),'reportSHA':hashlib.sha256((p/name).read_bytes()).hexdigest(),'imageSHA':sha})
for tag,mapping in indexes.items():(dest/tag/'report-index.json').write_text(json.dumps({'cases':mapping},indent=2)+'\n')
inputs['cases']=cases;(dest/'inputs.json').write_text(json.dumps(inputs,ensure_ascii=False,indent=2)+'\n')
(dest/'provenance-copy-qc.json').write_text(json.dumps(proof,indent=2)+'\n')
config={'baseline':'baseline','description':'Выбранный вариант на других мазках листов6 и9 и контрольных1/8/7. Сравнение с текущим движком в production; фото — ориентир. Вариант включает перенос и отображение краски, а не только изменение цвета.','comparisons':[{'case':c['id'],'candidate':variant} for c in cases]}
(r/'public53/config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');print({'cases':len(cases),'root':str(dest)})
