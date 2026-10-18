#!/usr/bin/env python3
"""Rebuild the current review from an explicit manifest of physical-device evidence."""
import argparse,json,subprocess,sys,hashlib
from statistics import median
from pathlib import Path
from review_timing import apply_timing,apply_paused_exact_timing
from review_model_timing import apply_model_timing
from review_earlier import merge_earlier
from review_catalog import catalog_variants
from review_native_cache import apply_native_cache,apply_native_cache_timing
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
scene_order={'mini-wave':0,'mini-two-colors':1}
scenes.sort(key=lambda s:scene_order.get(s['id'],2 if s['id'].startswith('gallery-') else 3 if s['id'].startswith('native-') else 4 if s['id'].startswith('dynamic-') else 5))
assert len({s['id'] for s in scenes})==len(scenes),'Duplicate scene group'
for earlier in m.get('earlierComparisons',[]):merge_earlier(scenes,earlier['comparison'],earlier['imageRoot'])
# The failed constant-modulo PACK must never be presented as a valid art candidate.
for scene in scenes:
 scene['displayDiagnostics']=[v for v in scene['variants'] if v['id']=='native-common']
 scene['variants']=[v for v in scene['variants'] if v['id']!='native-common' and v.get('evidence',{}).get('algorithm')!='wgsl-macro-integer-smooth-dither']
 assert scene['variants']
 preferred=['wgsl-macro-physical-dt-fine','wgsl-macro-coherent-physical-dt','wgsl-macro-true-coherent-fine','wgsl-macro-packed-carrier-coherent-fine','wgsl-macro-soft-paper-coherent-fine','wgsl-macro-coherent-fast-initial','wgsl-macro-fast-coherent-smooth-fine-paper','wgsl-macro-coherent-smooth-fine-paper','wgsl-macro-coherent-safe-dither','wgsl-macro-mobility-smooth-fine-paper','wgsl-macro-coherent-advection','wgsl-macro-integer-smooth-safe-dither','wgsl-macro-mobility-calibration']
 def priority(v):
  if v['id']=='original':return -3
  if v['id']=='input' or v['id'].startswith('input-reference-'):return -2
  if v['id']=='native-common':return -1
  algorithm=v.get('evidence',{}).get('algorithm')
  return preferred.index(algorithm) if algorithm in preferred else 100
 scene['variants'].sort(key=lambda v:(priority(v), 0 if v.get('evidence',{}).get('config',{}).get('physicalDt')==4 and v.get('evidence',{}).get('config',{}).get('eddyCells')==8 else 1))
for scene in scenes:
 for variant in scene['variants']:
  if variant.get('timeMs') is None:continue
  samples=variant.get('evidence',{}).get('samples',[])[1:]
  variant['timingMode']='после паузы' if samples and all(x.get('idleBeforeSampleMs',0)>=4900 for x in samples) else 'в серии'
apply_timing(scenes,m.get('timingReports',[]),m.get('idleTimingReports',[]))
apply_model_timing(scenes,m.get('modelTimingReports',[]))
apply_paused_exact_timing(scenes,m.get('pausedExactTimingReports',[]))

for report_path in m.get('nativeIdleReports',[]):
 report=json.loads(Path(report_path).read_text());assert report.get('pass') is True
 for row in report['cases']:
  scene=next((x for x in scenes if x['id']==row['id']),None)
  if scene is None:continue
  v=next(x for x in row['variants'] if x['id']=='original');assert v['pass'] and v['repeatExact'] and v['sourceStable'] and not v['errors']
  original=next(x for x in scene['variants'] if x['id']=='original')
  assert scene['commonInputSHA']==v['commonSHA']
  assert hashlib.sha256(Path(original['imageSource']).read_bytes()).hexdigest()==v['png']['sha256']
  samples=v['samples'][1:];assert len(samples)==4 and all(x['idleBeforeSampleMs']>=4900 for x in samples)
  times=[x['totalReadyMs'] for x in samples];center=median(times)
  original['nativeIdleTiming']={'medianMs':center,'minMs':min(times),'maxMs':max(times),'samples':samples,'qualification':'Отдельная серия после5с без собственного расчёта; native reset/solve/dry/composite +1px. Не чистое GPU и не равная граница WebGPU.'}
  original['note']+='\nПосле5с без собственного расчёта: медиана '+format(center,'.1f')+'мс, диапазон '+format(min(times),'.1f')+'–'+format(max(times),'.1f')+'мс. Исходные поля и конечная картинка совпали с контрольной серией. Это отдельный режим; не смешан с числом над описанием.'

apply_native_cache(scenes,m.get('nativeCachePairs',[]))
apply_native_cache_timing(scenes,m.get('nativeCacheTimingReports',[]))

for scene in scenes:
 def final_priority(v):
  native={'original':-5,'earlier-native-lazy':-4,'earlier-native-one-octave':-3,'native-feather-cache':-2,'input':-1}
  return native.get(v['id'],priority(v))
 scene['variants'].sort(key=final_priority)
 for v in scene['variants']:
  if v['id']=='earlier-native-lazy':v['label']='Исходный Mini — точная оптимизация шума'
  elif v['id']=='earlier-native-one-octave':v['label']='Исходный Mini — одна октава шума'

data={'title':'Все алгоритмы и оптимизации растекания','note':'Исследование продолжается. Список вариантов одинаковый для всех карточек; серые варианты ещё не рассчитаны для этого мазка. Готовится полный пересчёт с неподвижной исходной лужей; текущие картинки ещё могут выходить за её границу. Переключайте варианты и увеличивайте до 1:1. У новых моделей проверяем перенос краски, качество и совпадение между устройствами отдельно. Время не является полным откликом Grafetto.','relatedLinks':[{'href':'shortlist.html','label':'Короткое сравнение основных кандидатов'},{'href':'report.html','label':'Проблемы, исправления и что ещё не проверено'},{'href':'eddy/index.html','label':'Подбор формы вихрей: 12 сочетаний'}],'scenes':scenes}
catalog_variants(data)
combined=intermediate/'current-all-cards.json';combined.write_text(json.dumps(data,ensure_ascii=False,indent=2))
subprocess.run([sys.executable,str(here/'compare.py'),str(combined),str(a.output)],check=True)
