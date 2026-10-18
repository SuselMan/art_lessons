#!/usr/bin/env python3
"""Publish every tested point of the bounded eddy study, not only a chosen picture."""
import argparse, hashlib, json, subprocess, sys
from pathlib import Path
from flow_labels import review_label
p=argparse.ArgumentParser();p.add_argument('report',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
rows=json.loads(a.report.read_text())['cases'];scenes={}
titles={'mini-wave':'Волнистый мазок настоящей кистью','dynamic-stroke-through-pool':'Штрих через заранее смоченный участок','dynamic-two-strokes':'Два цветных мазка в общей луже'}
for row in rows:
 assert row['pass'];r=row['result'];assert r['repeatExact'];cfg=r['config'];assert cfg['steps']==256 and cfg['mobilityGain']==3
 assert cfg['eddyCells'] in (4,8,16,24) and cfg['curlStrength'] in (32,64,128)
 assert r['metrics']['invalidPremul']==0
 final=r['metadata']['finalState'];assert final['totalWaterCodes']==r['metadata']['initial']['initialWaterCodes']
 assert final['totalPigmentAlphaCodes']==r['metadata']['initial']['initialMobileCodes']
 image=a.report.parent/row['png']['file'];assert hashlib.sha256(image.read_bytes()).hexdigest()==row['png']['sha256']
 scene=scenes.setdefault(r['fixture'],{'id':r['fixture'],'title':titles[r['fixture']],'note':'Меняются только масштаб и сила связного поля. Ввод, 256 шагов и подвижность ×3 одинаковы. Это художественное поле, не гидродинамический решатель.','variants':[]})
 scene['variants'].append({'id':f"eddy-{cfg['eddyCells']}-{cfg['curlStrength']}",'label':review_label(r['algorithm'],cfg),'imageSource':str(image.resolve()),'timeMs':r['warmMedianMs'],'comparable':False,'resultText':'Без мелкого бумажного переноса','note':'Время отдельной прогретой серии, не сравнение скорости между параметрами и не отклик Grafetto. Масштаб поля — шаг его решётки, а не точный диаметр вихря.','evidence':r})
assert len(scenes)==3
for scene in scenes.values():
 assert len(scene['variants'])==12 and len({v['id'] for v in scene['variants']})==12
 scene['variants'].sort(key=lambda v:(v['evidence']['config']['eddyCells'],v['evidence']['config']['curlStrength']))
data={'title':'Подбор формы растекания — все 12 сочетаний','note':'Полная ограниченная серия: четыре масштаба × три силы × три разных мазка. Художественный победитель пока не выбран.','relatedLinks':[{'href':'../index.html','label':'Основное сравнение'}],'scenes':list(scenes.values())}
source=a.report.parent/'eddy-review-cards.json';source.write_text(json.dumps(data,ensure_ascii=False,indent=2))
subprocess.run([sys.executable,str(Path(__file__).with_name('compare.py')),str(source),str(a.output)],check=True)
