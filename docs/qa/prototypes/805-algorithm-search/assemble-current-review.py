#!/usr/bin/env python3
"""Rebuild the current review from an explicit manifest of physical-device evidence."""
import argparse,json,subprocess,sys
from pathlib import Path
from review_timing import apply_timing
p=argparse.ArgumentParser();p.add_argument('manifest',type=Path);p.add_argument('output',type=Path);a=p.parse_args();m=json.loads(a.manifest.read_text());here=Path(__file__).parent;intermediate=a.manifest.parent
native=intermediate/'current-native-cards.json';dynamic=intermediate/'current-dynamic-cards.json'
args=[sys.executable,str(here/'assemble-native-flow.py')]
for file in m['native']:args+=['--native',file]
for file in m['common']:args+=['--common',file]
for file in m.get('render',[]):args+=['--render',file]
args+=['--image-fallback',m['imageFallback'],'--output',str(native)]
subprocess.run(args,check=True)
subprocess.run([sys.executable,str(here/'assemble-dynamic-flow.py'),*m['dynamic'],'--output',str(dynamic)],check=True)
scenes=json.loads(native.read_text())['scenes']+json.loads(dynamic.read_text())['scenes']+json.loads(Path(m['staticCards']).read_text())['scenes']
scene_order={'dynamic-stroke-through-pool':0,'dynamic-two-strokes':1}
scenes.sort(key=lambda s:scene_order.get(s['id'],2 if s['id'].startswith(('gallery-','mini-')) else 3 if s['id'].startswith('native-') else 4 if s['id'].startswith('dynamic-') else 5))
assert len({s['id'] for s in scenes})==len(scenes),'Duplicate scene group'
# The failed constant-modulo PACK must never be presented as a valid art candidate.
for scene in scenes:
 scene['variants']=[v for v in scene['variants'] if v.get('evidence',{}).get('algorithm')!='wgsl-macro-integer-smooth-dither']
 assert scene['variants']
 preferred=['wgsl-macro-soft-paper-coherent-fine','wgsl-macro-coherent-fast-initial','wgsl-macro-fast-coherent-smooth-fine-paper','wgsl-macro-coherent-smooth-fine-paper','wgsl-macro-coherent-safe-dither','wgsl-macro-mobility-smooth-fine-paper','wgsl-macro-coherent-advection','wgsl-macro-integer-smooth-safe-dither','wgsl-macro-mobility-calibration']
 def priority(v):
  if v['id']=='original':return -3
  if v['id']=='input' or v['id'].startswith('input-reference-'):return -2
  if v['id']=='native-common':return -1
  algorithm=v.get('evidence',{}).get('algorithm')
  return preferred.index(algorithm) if algorithm in preferred else 100
 scene['variants'].sort(key=priority)
apply_timing(scenes,m.get('timingReports',[]),m.get('idleTimingReports',[]))
data={'title':'Как разные алгоритмы меняют мазок','note':'Исследование продолжается. Переключайте варианты и исходный мазок, увеличивайте до1:1. У новых моделей проверяем перенос краски, качество и совпадение между устройствами отдельно. Время не является полным откликом Grafetto.','relatedLinks':[{'href':'report.html','label':'Проблемы, исправления и что ещё не проверено'},{'href':'eddy/index.html','label':'Подбор формы вихрей: 12 сочетаний'},{'href':'../index.html','label':'Первое сравнение13мазков'}],'scenes':scenes}
combined=intermediate/'current-all-cards.json';combined.write_text(json.dumps(data,ensure_ascii=False,indent=2))
subprocess.run([sys.executable,str(here/'compare.py'),str(combined),str(a.output)],check=True)
