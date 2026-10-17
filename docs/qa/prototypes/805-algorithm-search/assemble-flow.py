#!/usr/bin/env python3
"""Assemble functional flow cards; no unsupported native equivalence or speed ratios."""
import argparse,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('reports',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
titles={'flow-pool-drop':'Капля в большой луже','flow-separated-colors':'Два раздельных цвета в общей воде','flow-dry-barrier':'Сухая перегородка внутри листа','flow-isolated-pools':'Две отдельные лужи'}
notes={'flow-pool-drop':'Изначально окрашена только маленькая точка в центре. Видно, насколько далеко краска уходит по воде.','flow-separated-colors':'Синий и жёлтый изначально не соприкасаются. Зелёная область должна появиться за счёт расчёта.','flow-dry-barrier':'Между двумя цветами проходит сухая полоса шириной 3 пикселя. Перенос через неё считается ошибкой этой сцены.','flow-isolated-pools':'Синий и жёлтый находятся в разных лужах. Между ними сухой участок.'}
titles.update({'flow-one-pixel-wall':'Сухая перегородка в один пиксель','flow-thin-neck':'Лужи соединены узкой протокой','flow-paper-drop':'Капля на фактурной бумаге','flow-water-only':'Только вода, без краски','flow-dry-pigment':'Пигмент без воды','flow-near-colors':'Близкие цвета в одной воде','flow-diagonal-wall':'Диагональная сухая перегородка'})
notes.update({'flow-one-pixel-wall':'Разделитель смещён относительно сетки. Усреднение воды не должно соединить лужи.','flow-thin-neck':'Вода соединяется через проход шириной 13 пикселей; краска может пройти только через него.','flow-paper-drop':'Тот же ввод капли, но с синтетической фактурой бумаги. Проверяем реакцию материала.','flow-water-only':'Пигмент отсутствует. Расчёт не должен создавать краску.','flow-dry-pigment':'Воды нет. Исходные отпечатки должны сохраниться точно.'})
human={'input-reference':'Исходный ввод (без расчёта)','macro-multiscale-exchange':'Широкий перенос WebGL','macro-wet-geodesic-exchange':'Парный перенос — видны копии','wgsl-macro-implicit':'Неявная диффузия WebGPU','wgsl-macro-darcy':'Вода и краска WebGPU','macro2-dense-wetpath-exchange':'Плотный перенос WebGL','wgsl-macro-implicit-sorption':'Диффузия с осаждением','wgsl-macro-paper-particles':'Перенос частиц по бумаге','wgsl-macro-paper-particles-compact':'Те же частицы, меньше пустой работы','wgsl-macro-implicit-fine-paper':'Перенос с мелкой фактурой бумаги','macro3-local-hydraulic-residual':'Локальный перенос воды и краски'}
scenes={};seen=set();inputs={}
for file in reversed(a.reports):
 report=json.loads(file.read_text());labels={x['id']:x['label'] for x in report.get('catalog',{}).get('algorithms',[])}
 for row in report['cases']:
  if not row.get('pass') or not row.get('png'):continue
  r=row['result'];q=row['request'];fid=q['fixture'];flow=r.get('flowMetrics') or r.get('flow') or row.get('flow');
  if flow is None:continue
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
  barrier=fid in ['flow-dry-barrier','flow-one-pixel-wall','flow-diagonal-wall','flow-isolated-pools']
  invalidBoundary=barrier and (fid!='flow-one-pixel-wall' or flow.get('schemaVersion',1)>=2) and (flow['blueCrossFraction']>0 or flow['yellowCrossFraction']>0)
  functionalError=bool((flow['changedDryPixels'] or invalidBoundary) and r.get('metadata',{}).get('wetDomain')!='dynamic')
  if functionalError:summary+=' · Ошибка: перенос через сухую границу'
  scene['variants'].append({'id':q['algorithm']+'-'+str(len(scene['variants'])),'label':human.get(q['algorithm'],labels.get(q['algorithm'],q['algorithm']))+(' · настройка '+str(sum(v['id'].startswith(q['algorithm']+'-') for v in scene['variants'])+1) if q.get('config') else ''),'imageSource':str(image.resolve()),'timeMs':None if reference else r.get('warmMedianMs'),'resultText':summary,'functionalError':functionalError,'note':'Параметры: '+json.dumps(q.get('config',{}),ensure_ascii=False)+'\n'+json.dumps(flow,ensure_ascii=False,indent=2),'flowMetrics':flow,'fixtureSHA':r['fixtureSHA'],'samples':r['samples'],'comparable':False})
for scene in scenes.values():scene['variants'].sort(key=lambda v:0 if v['id'].startswith('input-reference-') else 1)
data={'title':'Есть ли настоящее растекание?','note':'Контрольные сцены: краска изначально занимает маленькую область, цвета не смешаны. Переключайте варианты. Время включает подготовку ввода и ожидание результата на Samsung; художественное качество оцениваем по картинкам.','scenes':[scenes[k] for k in titles if k in scenes]+[v for k,v in scenes.items() if k not in titles]}
a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2));print(json.dumps({'scenes':len(scenes),'variants':len(seen)}))
