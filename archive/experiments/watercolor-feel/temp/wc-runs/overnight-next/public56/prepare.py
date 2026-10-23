from pathlib import Path
import json,shutil,hashlib
r=Path(__file__).resolve().parents[1];dest=r/'pool-contrast-publication-ready';dest.mkdir(exist_ok=True);parent='production-calibrated-pool-beer85-softshoulder16';variants=[('pool-amplitude055-primary-two','production-calibrated-pool-softshoulder16-amplitude0p55'),('pool-amplitude035-primary-two','production-calibrated-pool-softshoulder16-amplitude0p35')];proof=[]
for folder,tag in [('saturating-beer-softshoulder16-four',parent)]+variants:
 p=dest/tag;p.mkdir(exist_ok=True);src=r/folder;shutil.copyfile(src/'report.json',p/'report.json');s=json.loads((p/'report.json').read_text())
 for cid in ['s6-n6','s9-n3']:
  shutil.copyfile(src/(cid+'.png'),p/(cid+'.png'));row=next(c for c in s['cases'] if c['id']==cid);sha=hashlib.sha256((p/(cid+'.png')).read_bytes()).hexdigest();assert sha==row['pngSha256'] and row['variant']==tag;proof.append({'case':cid,'variant':tag,'imageSHA':sha,'reportSHA':hashlib.sha256((p/'report.json').read_bytes()).hexdigest(),'source':str(src)})
inputs=json.loads((r/'critical-accepted-publication-ready/inputs.json').read_text());inputs['cases']=[c for c in inputs['cases'] if c['id'] in ['s6-n6','s9-n3']];assert len(inputs['cases'])==2;(dest/'inputs.json').write_text(json.dumps(inputs,ensure_ascii=False,indent=2)+'\n');(dest/'provenance-copy-qc.json').write_text(json.dumps(proof,indent=2)+'\n')
config={'baseline':parent,'description':'Два варианта более мягких скоплений пигмента на листах6 и9. Сравнение с выбранным вариантом предыдущей пачки, а не с production. Фото — ориентир.','comparisons':[{'case':cid,'candidate':tag} for _,tag in variants for cid in ['s6-n6','s9-n3']]};(r/'public56/config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');print('prepared4pairs')
