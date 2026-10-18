#!/usr/bin/env python3
"""Dynamic wetting review. Initial dry paper is permeable, not an immutable wall."""
import argparse,json
from pathlib import Path
from flow_labels import review_label
p=argparse.ArgumentParser();p.add_argument('reports',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
titles={'dynamic-wet-on-dry':'Мокрый мазок на сухой бумаге','dynamic-water-drop':'Капля воды в мокрый пигмент','dynamic-stroke-through-pool':'Штрих проходит через заранее смоченный участок','dynamic-two-strokes':'Два цветных мазка в общей луже'}
labels={'wgsl-macro-integer-dynamic':'Целочисленное движение воды — без смешения','wgsl-macro-integer-smooth-control':'То же движение воды: сглаживание','wgsl-macro-integer-mixing-smooth':'Целочисленная вода и смешение','wgsl-macro-dynamic-wetness-smooth-dither':'Плавная вода: сглаживание цветовых полос','input-reference':'Исходное состояние','wgsl-macro-dynamic-wetness':'Вода и впитывание: блочная реконструкция','wgsl-macro-dynamic-wetness-smooth':'Та же вода: плавная реконструкция'}
scenes={};seen=set()
for file in reversed(a.reports):
 for row in json.loads(file.read_text())['cases']:
  if not row.get('pass'):continue
  r=row['result'];fid=r['fixture']
  if fid not in titles:continue
  key=(fid,r['algorithm'],json.dumps(r['config'],sort_keys=True))
  if key in seen:continue
  seen.add(key);s=scenes.setdefault(fid,{'id':fid,'title':titles[fid],'note':'В этой модели вода сама смачивает бумагу. Выход за начальную мокрую область ожидаем; проверяем сохранение воды и пигмента.','variants':[]});m=r['metadata'];t=r['transportMetrics'];f=m.get('finalState');reference=r['algorithm']=='input-reference'
  failed=bool(f and f.get('prePackGuardPassed') is False);text='Исходный ввод — без расчёта' if reference else 'Вода распространяется по бумаге'
  dm=r.get('dynamicMetrics') or {};mix=dm.get('mixedCarrierFraction');ratio=dm.get('insideOutsideWidthRatio')
  if mix is not None and fid=='dynamic-two-strokes':text+=' · смешение '+str(round(mix*100,1))+'%'
  if ratio is not None:text+=' · ширина внутри/снаружи '+str(round(ratio,2))
  if failed:text+=' · Ошибка представления носителя'
  note='Параметры: '+json.dumps(r['config'])+'\n'+json.dumps({'dynamic':dm,'transport':t,'waterInitial':m.get('initialWaterSum'),'pigmentInitial':m.get('initialPigmentAlphaCodes'),'finalState':f},ensure_ascii=False,indent=2)
  s['variants'].append({'id':r['algorithm']+'-'+str(len(s['variants'])),'label':review_label(r['algorithm'],r['config'],labels.get(r['algorithm'])),'imageSource':str((file.parent/row['png']['file']).resolve()),'timeMs':None if reference else r['warmMedianMs'],'resultText':text,'functionalError':failed,'note':note,'comparable':False,'evidence':r})
for s in scenes.values():s['variants'].sort(key=lambda v:0 if v['id'].startswith('input-reference-') else 1)
a.output.write_text(json.dumps({'scenes':list(scenes.values())},ensure_ascii=False,indent=2));print(len(scenes))
