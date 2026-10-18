#!/usr/bin/env python3
"""Native references and alternatives on exact captured fields; no cross-boundary speed ratio."""
import argparse,json
from pathlib import Path
from flow_labels import review_label
p=argparse.ArgumentParser();p.add_argument('--native',required=True,type=Path,action='append');p.add_argument('--common',required=True,type=Path,action='append');p.add_argument('--image-fallback',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
common=[(file,row) for file in a.common for row in json.loads(file.read_text())['cases'] if row.get('pass')];wanted={row['result']['fixture'] for _,row in common};scenes={}
labels={'wgsl-macro-dynamic-wetness':'Вода и впитывание','wgsl-macro-dynamic-wetness-smooth':'Та же вода: плавная реконструкция','wgsl-macro-artistic-curl':'Вихревой перенос','wgsl-macro-integer-hydraulic':'Перенос на целых числах','wgsl-macro-implicit':'Неявная диффузия','wgsl-macro-darcy':'Перенос воды и краски','macro2-dense-wetpath-exchange':'Плотный перенос','wgsl-macro-implicit-sorption':'Диффузия с осаждением','wgsl-macro-paper-particles':'Частицы','wgsl-macro-implicit-fine-paper':'Перенос с мелкой бумагой','macro3-local-hydraulic-residual':'Локальный перенос воды и краски'}
for file in a.native:
 for row in json.loads(file.read_text())['cases']:
  if row['id'] not in wanted:continue
  assert row['pass'];v=next(x for x in row['variants'] if x['id']=='original');assert v['pass'] and v['repeatExact'];t=v.get('transport',{}).get('metrics')
  image=file.parent/v['png']['file']
  if not image.is_file() and a.image_fallback:image=a.image_fallback/(v['png']['sha256']+'.png')
  assert image.is_file(),image
  scenes[row['id']]={'id':row['id'],'title':row.get('title',row['id']),'note':'Настоящие кистевые вода, пигменты и бумага Mini. Альтернативы получают захват тех же исходных полей; отображение и граница замера отличаются.','commonInputSHA':v['commonSHA'],'variants':[{'id':'original','label':'Исходный алгоритм Mini','imageSource':str(image.resolve()),'timeMs':v['warmMedianMs'],'comparable':False,'resultText':'Исходный Mini'+(' · за 50 px: '+format(100*t['beyond'][2]['fraction'],'.1f')+'%' if t else ''),'transportMetrics':t,'note':'Результат родного композитора; у альтернатив другой композитор и граница времени. '+(json.dumps(t,ensure_ascii=False) if t else '')}]}
seen=set()
for file,row in common:
 r=row['result'];scene=scenes[r['fixture']];assert r['fixtureSHA']==scene['commonInputSHA'];t=r['transportMetrics'];key=(r['fixture'],r['algorithm'],json.dumps(r['config'],sort_keys=True))
 if key in seen:continue
 seen.add(key);cfg=r['config'];label=review_label(r['algorithm'],cfg,labels.get(r['algorithm']))+(' · ширина '+str(cfg['sigma']) if 'sigma' in cfg else '')
 scene['variants'].append({'id':r['algorithm']+'-'+str(len(scene['variants'])),'label':label,'imageSource':str((file.parent/row['png']['file']).resolve()),'timeMs':r['warmMedianMs'],'comparable':False,'functionalError':r.get('metadata',{}).get('finalState',{}).get('prePackGuardPassed',True) is False,'resultText':'За 50 px: '+format(100*t['beyond'][2]['fraction'],'.1f')+'% краски','transportMetrics':t,'note':'Одинаковые захваченные поля; общий оптический композитор. Процент ускорения к Mini не вычисляется. Параметры: '+json.dumps(cfg)+'\n'+json.dumps(t,ensure_ascii=False),'evidence':r})
a.output.write_text(json.dumps({'title':'Настоящие кистевые лужи','scenes':list(scenes.values())},ensure_ascii=False,indent=2));print(len(scenes))
