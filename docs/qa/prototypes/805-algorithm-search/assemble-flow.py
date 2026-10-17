#!/usr/bin/env python3
"""Assemble functional flow cards; no unsupported native equivalence or speed ratios."""
import argparse,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('reports',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
titles={'flow-pool-drop':'Капля в большой луже','flow-separated-colors':'Два раздельных цвета в общей воде','flow-dry-barrier':'Сухая перегородка внутри листа','flow-isolated-pools':'Две отдельные лужи'}
notes={'flow-pool-drop':'Изначально окрашена только маленькая точка в центре. Видно, насколько далеко краска уходит по воде.','flow-separated-colors':'Синий и жёлтый изначально не соприкасаются. Зелёная область должна появиться за счёт расчёта.','flow-dry-barrier':'Между двумя цветами проходит сухая полоса шириной 3 пикселя. Перенос через неё считается ошибкой этой сцены.','flow-isolated-pools':'Синий и жёлтый находятся в разных лужах. Между ними сухой участок.'}
scenes={};seen=set();inputs={}
for file in a.reports:
 report=json.loads(file.read_text());labels={x['id']:x['label'] for x in report.get('catalog',{}).get('algorithms',[])}
 for row in report['cases']:
  if not row.get('pass') or not row.get('png'):continue
  r=row['result'];q=row['request'];fid=q['fixture'];flow=r.get('flowMetrics') or r.get('flow') or row.get('flow');assert flow is not None
  sha=json.dumps(r['fixtureSHA'],sort_keys=True)
  assert inputs.get(fid,sha)==sha,'Different input for '+fid
  inputs[fid]=sha
  key=(fid,q['algorithm'],json.dumps(q.get('config',{}),sort_keys=True))
  if key in seen:continue
  seen.add(key);image=file.parent/row['png']['file'];assert hashlib.sha256(image.read_bytes()).hexdigest()==row['png']['sha256']
  scene=scenes.setdefault(fid,{'id':fid,'title':titles.get(fid,fid),'note':notes.get(fid,''),'variants':[]})
  reference=q['algorithm']=='input-reference'
  summary='Исходный ввод — без растекания' if reference else 'За 50 px: '+format(100*flow['massBeyond50px'],'.1f')+'% краски'
  if fid=='flow-separated-colors' and not reference:summary+=' · смешение '+format(100*flow['mixedCarrierFraction'],'.1f')+'%'
  if flow['changedDryPixels']:summary+=' · изменён сухой участок!'
  scene['variants'].append({'id':q['algorithm']+'-'+str(len(scene['variants'])),'label':labels.get(q['algorithm'],q['algorithm'])+(' '+str(q.get('config',{})) if q.get('config') else ''),'imageSource':str(image.resolve()),'timeMs':None if reference else r.get('warmMedianMs'),'resultText':summary,'note':'Параметры: '+json.dumps(q.get('config',{}),ensure_ascii=False)+'\n'+json.dumps(flow,ensure_ascii=False,indent=2),'flowMetrics':flow,'fixtureSHA':r['fixtureSHA'],'samples':r['samples'],'comparable':False})
data={'title':'Есть ли настоящее растекание?','note':'Контрольные сцены: краска изначально занимает маленькую область, цвета не смешаны. Переключайте варианты. Время включает подготовку ввода и ожидание результата на Samsung; художественное качество оцениваем по картинкам.','scenes':list(scenes.values())}
a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2));print(json.dumps({'scenes':len(scenes),'variants':len(seen)}))
