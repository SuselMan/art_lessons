#!/usr/bin/env python3
"""Build a portable private review, retaining only selected images and compact metrics."""
import argparse, json, shutil, html
from pathlib import Path

LABELS = {
'input-reference':'Исходный пигмент', 'alternative-stable-fluids':'Stable Fluids',
'alternative-lattice-diffusion':'Локальный перенос', 'alternative-artistic-front':'Быстрый фронт',
'alternative-wet-boundary-detail':'Перенос к мокрой границе (отклонён)',
'alternative-paper-deposition':'Перенос и осаждение в бумаге',
'alternative-correlated-paper-deposition':'Осаждение · связная фактура бумаги',
'wgsl-integer-diffusion-texture':'WebGPU · тот же расчёт через текстуры',
'search-artistic-program':'Автоматический поиск программы',
'gl-integer-diffusion-match':'WebGL · общий целочисленный расчёт',
'wgsl-integer-diffusion-direct':'WebGPU · тот же расчёт',
'wgsl-integer-diffusion-tiled4':'WebGPU · четыре шага в shared memory',
'wgsl-d2q9-bgk':'D2Q9 LBM',
}
SCENES={'dot':'Точка','wave':'Широкий след','wave-open':'Волна','water-only':'Чистая вода','water-stroke':'Мазок через воду','two-colors':'Синий и розовый','blue-yellow':'Синий и жёлтый','fine-detail':'Тонкие линии','border':'Край листа','dry-stroke':'Сухой контроль','isolated-pools':'Раздельные лужи','crosses':'Пересечения','variable-wash':'Неравномерная заливка','dry-barrier':'Тонкий сухой разделитель'}

def main():
 p=argparse.ArgumentParser();p.add_argument('cache',type=Path);p.add_argument('output',type=Path);p.add_argument('--selection',type=Path,required=True);a=p.parse_args()
 selection=json.loads(a.selection.read_text());a.output.mkdir(parents=True,exist_ok=True);(a.output/'images').mkdir(exist_ok=True)
 rows=[]
 for item in selection['cases']:
  report=json.loads((a.cache/item['batch']/'report.json').read_text());case=report['cases'][item['case']];r=case['result'];image=case['png']['file'];dest=case['png']['sha256']+'.png'
  shutil.copy2(a.cache/item['batch']/image,a.output/'images'/dest)
  rows.append(dict(label=item.get('label',LABELS.get(r['algorithm'],r['algorithm'])),algorithm=r['algorithm'],scene=SCENES.get(r['fixture'],r['fixture']),fixture=r['fixture'],encoding=r.get('encoding','premultiplied-rgb'),config=r['config'],warm=r['warmMedianMs'],cold=r['coldMs'],compile=r['createMs'],samples=r['samples'],repeatExact=r['repeatExact'],hashes=r['hashes'],metrics=r['metrics'],ui=r.get('ui'),control=r.get('control'),metadata=r.get('metadata'),fixtureSHA=r['fixtureSHA'],image='images/'+dest,note=item.get('note',''),batch=item['batch']))
 for f in ['wave','dot','two-colors','water-only']:
  if (a.cache/'old-mini-reference'/f'{f}.png').exists():shutil.copy2(a.cache/'old-mini-reference'/f'{f}.png',a.output/'images'/f'old-{f}.png')
 data=dict(summary=selection.get('summary',[]),rows=rows,qualification=selection.get('qualification',''),quota=selection.get('quota',''),source=selection.get('source',''))
 (a.output/'data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
 template=Path(__file__).with_name('report.html').read_text();(a.output/'index.html').write_text(template.replace('/*DATA*/',json.dumps(data,ensure_ascii=False).replace('<','\u003c')))
 print(json.dumps({'images':len(list((a.output/'images').glob('*.png'))),'rows':len(rows),'output':str(a.output)}))
if __name__=='__main__':main()
