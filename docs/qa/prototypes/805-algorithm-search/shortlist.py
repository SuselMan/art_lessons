#!/usr/bin/env python3
"""Small visual comparison; preserves original images, timings and evidence verbatim."""
import argparse,copy,json
from pathlib import Path
from review_catalog import catalog_variants

def select_variant(v):
    if v['id'] in ('original','input','native-common','native-feather-cache','earlier-native-lazy','earlier-native-one-octave') or v['id'].startswith('input-reference-'):return True
    e=v.get('evidence',{});a=e.get('algorithm');c=e.get('config',{})
    if a=='wgsl-macro-coherent-physical-dt':return c.get('physicalDt') in (1,4) and c.get('eddyCells')==8 and c.get('curlStrength')==64
    if a=='wgsl-macro-physical-dt-fine':return c.get('physicalDt')==4 and c.get('fineSteps')==4 and c.get('affinityBase')==64 and c.get('eddyCells')==8 and c.get('curlStrength')==64
    if a in ('wgsl-macro-gpu-initial-coherent-dt4','wgsl-macro-capacity-aware-lite','wgsl-macro-gpu-capacity-aware-lite'):return c.get('verifyInitializer',0)==0 and c.get('eddyCells')==8 and c.get('curlStrength')==64
    if a in ('wgsl-macro-capacity-aware-fine','wgsl-macro-gpu-initial-fine','wgsl-macro-gpu-capacity-aware-fine'):return c.get('verifyInitializer',0)==0 and c.get('fineSteps')==4 and c.get('eddyCells')==8 and c.get('curlStrength')==64
    if a=='wgsl-macro-true-coherent-fine':return c.get('fineSteps')==12 and c.get('affinityBase')==128 and c.get('curlStrength')==128
    if a=='wgsl-macro-coherent-fast-initial':return c.get('eddyCells')==16 and c.get('curlStrength')==128
    return False

def shortlist(data):
    result=copy.deepcopy(data);scenes=[]
    for scene in result['scenes']:
        if not scene['id'].startswith(('mini-','gallery-','native-','dynamic-')):continue
        chosen=[v for v in scene['variants'] if select_variant(v)]
        if len(chosen)<2:continue
        scene['variants']=chosen;scenes.append(scene)
    result['scenes']=scenes
    result['title']='Короткое сравнение растекания'
    result['note']='Выбранные мазки, исходник и несколько основных кандидатов. Художественный выбор ещё открыт. Укрупнённый шаг меняет картинку; точные оптимизации помечены отдельно. Время относится к стенду Mini1024.'
    result['relatedLinks']=[{'href':'index.html','label':'Все исследованные варианты'},{'href':'report.html','label':'Проблемы, исправления и непроверенное'},{'href':'eddy/index.html','label':'Подбор формы вихрей'}]
    return catalog_variants(result)

def main():
    p=argparse.ArgumentParser();p.add_argument('comparison',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    data=shortlist(json.loads(a.comparison.read_text()));assert data['scenes']
    template=Path(__file__).with_name('compare.html').read_text();marker='/*DATA*/{"scenes":[]}'
    assert template.count(marker)==1
    a.output.write_text(template.replace(marker,json.dumps(data,ensure_ascii=False).replace('<','\\u003c')))
    a.output.with_suffix('.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
    print(json.dumps({'scenes':len(data['scenes']),'variants':sum(len(s['variants']) for s in data['scenes'])}))
if __name__=='__main__':main()
