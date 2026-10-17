#!/usr/bin/env python3
"""Join actual native pairs and common-model evidence for the scene-card UI."""
import argparse,json
from pathlib import Path
LABELS={'original':'Оригинал','lazy':'Точная оптимизация шума','one-octave':'Одна октава','alternative-finite-volume-exchange':'Новый перенос пигмента','alternative-correlated-paper-deposition':'Бумажное осаждение','alternative-stable-fluids':'Stable Fluids','alternative-artistic-front':'Быстрый фронт','wgsl-d2q9-bgk':'LBM'}
def main():
 p=argparse.ArgumentParser();p.add_argument('--native',type=Path,action='append',required=True);p.add_argument('--common',type=Path,action='append',default=[]);p.add_argument('--source',type=Path,action='append',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 sources={}
 for path in a.source:
  for row in json.loads(path.read_text())['scenes']:sources[row['id']]=row
 scenes={}
 for path in a.native:
  report=json.loads(path.read_text());assert report['pass'],path
  for row in report['cases']:
   assert row['pass'] and row['id'] not in scenes
   source=sources[row['id']];base=next(v for v in row['variants'] if v['id']=='original');variants=[]
   for v in row['variants']:
    assert v['pass'] and v['repeatExact'] and v['captureMetadata']['nativeMaterialModel']=='front8-detail-flow-v4'
    assert v['rawSHA']==base['rawSHA'] and v['commonSHA']==base['commonSHA']
    assert v['replay']['operationSHA']==base['replay']['operationSHA']
    t=v['warmMedianMs'];b=base['warmMedianMs'];gain=(b-t)/b*100
    gainText='оригинал' if v['id']=='original' else ('разница меньше 1%' if abs(gain)<1 else ('на '+str(round(abs(gain)))+'% '+('быстрее' if gain>0 else 'медленнее')))
    note='Одинаковые исходные поля, бумага и записанные действия. Медиана '+str(len(v['samples'])-1)+' прогретых повторов на Samsung. '
    note+=('Картинка совпала с оригиналом побайтно.' if v['id']=='lazy' else 'Одна октава шума вместо двух; конечная картинка может отличаться.' if v['id']=='one-octave' else 'Текущий Mini front8-detail-flow-v4, с уже принятой точной оптимизацией нулевого фронта.')
    variants.append({'id':v['id'],'label':LABELS[v['id']],'imageSource':str(path.parent/v['png']['file']),'timeMs':t,'baselineMs':b,'gainText':gainText,'comparable':True,'sameInputVerified':True,'note':note,'evidence':{'nativeRawSHA':v['rawSHA'],'outputHashes':v['hashes'],'samples':v['samples'],'sourceHashes':v['sourceHashes'],'model':v['captureMetadata']['nativeMaterialModel'],'replayedOperationSHA':v['replay']['operationSHA']}})
   title=('Лист '+source['sheet']+' · ' if source.get('sheet') else '')+source['label']
   scenes[row['id']]={'id':row['id'],'title':title,'note':'Повтор геометрии из проверки октав.' if row['id'].startswith('mini-') else '','variants':variants,'transform':{**row['transform'],'replayedModel':base['replay']['model'],'presetOverrides':base['replay']['presetOverrides']},'sourceRef':source.get('sourceRef'),'commonInputSHA':base['commonSHA']}
 for path in a.common:
  report=json.loads(path.read_text());assert report['pass'],path
  for case in report['cases']:
   assert case['pass'];r=case['result'];scene=scenes[r['fixture']];assert r['fixtureSHA']==scene['commonInputSHA']
   assert r['repeatExact'] and r['metrics']['invalidPremul']==0
   scene['variants'].append({'id':r['algorithm'],'label':LABELS.get(r['algorithm'],r['algorithm']),'imageSource':str(path.parent/case['png']['file']),'timeMs':r['warmMedianMs'],'comparable':False,'sameInputVerified':True,'note':('Сумма alpha к исходнику: '+format((r['metrics']['massRatio']-1)*100,'+.2f')+'% — прокси количества пигмента, не физическая масса. Другой алгоритм на тех же преобразованных полях краски, воды и бумаги. Общее оптическое отображение компенсирует масштаб захвата; оно отличается от полного композитора Mini, поэтому процент ускорения относительно оригинала не вычисляем.'),'evidence':r})
 for scene in scenes.values():
  if len(scene['variants'])==3:scene['note']='Здесь сравниваются оригинал и две оптимизации; новые модели пока не включены.'
 data={'title':'Один мазок — разные варианты','note':'По одному примеру с 11 листов галереи и две сцены из проверки октав. Листайте варианты стрелками, списком или свайпом. Время — на Samsung; прирост указан относительно оригинала той же карточки.','scenes':list(scenes.values())}
 a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2));print('scenes',len(scenes),'variants',sum(len(s['variants']) for s in scenes.values()))
if __name__=='__main__':main()
