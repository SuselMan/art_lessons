#!/usr/bin/env python3
"""Dynamic wetting review. Initial dry paper is permeable, not an immutable wall."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('reports',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
titles={'dynamic-wet-on-dry':'Мокрый мазок на сухой бумаге','dynamic-water-drop':'Капля воды в мокрый пигмент'}
labels={'input-reference':'Исходное состояние','wgsl-macro-dynamic-wetness':'Вода и впитывание: блочная реконструкция','wgsl-macro-dynamic-wetness-smooth':'Та же вода: плавная реконструкция'}
scenes={};seen=set()
for file in reversed(a.reports):
 for row in json.loads(file.read_text())['cases']:
  if not row.get('pass'):continue
  r=row['result'];fid=r['fixture']
  if fid not in titles:continue
  key=(fid,r['algorithm'],json.dumps(r['config'],sort_keys=True))
  if key in seen:continue
  seen.add(key);s=scenes.setdefault(fid,{'id':fid,'title':titles[fid],'note':'В этой модели вода сама смачивает бумагу. Выход за начальную мокрую область ожидаем; проверяем сохранение воды и пигмента.','variants':[]});m=r['metadata'];t=r['transportMetrics'];f=m.get('finalState');reference=r['algorithm']=='input-reference'
  failed=bool(f and not f['prePackGuardPassed']);text='Исходный ввод — без расчёта' if reference else 'Вода распространяется по бумаге'
  if failed:text+=' · Ошибка представления носителя'
  note='Параметры: '+json.dumps(r['config'])+'\n'+json.dumps({'transport':t,'waterInitial':m.get('initialWaterSum'),'pigmentInitial':m.get('initialPigmentAlphaCodes'),'finalState':f},ensure_ascii=False,indent=2)
  s['variants'].append({'id':r['algorithm']+'-'+str(len(s['variants'])),'label':labels.get(r['algorithm'],r['algorithm']),'imageSource':str((file.parent/row['png']['file']).resolve()),'timeMs':None if reference else r['warmMedianMs'],'resultText':text,'functionalError':failed,'note':note,'comparable':False,'evidence':r})
for s in scenes.values():s['variants'].sort(key=lambda v:0 if v['id'].startswith('input-reference-') else 1)
a.output.write_text(json.dumps({'scenes':list(scenes.values())},ensure_ascii=False,indent=2));print(len(scenes))
