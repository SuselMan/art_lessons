"""Compare enlarged-step models; explicitly NOT an identical-picture optimization."""
import json
import math
from pathlib import Path
from statistics import median

MODELS={'wgsl-macro-coherent-physical-dt','wgsl-macro-physical-dt-fine'}

def key(row):
    config={k:v for k,v in row['config'].items() if k not in ('physicalDt','steps')}
    return row['algorithm'],row['fixture'],row['encoding'],json.dumps(config,sort_keys=True)

def read_model_timings(paths):
    groups={}
    for path in dict.fromkeys(Path(p).resolve() for p in paths):
        report=json.loads(path.read_text())
        if not report.get('pass') or not report.get('sourceStable') or report.get('errors') or not report.get('contextClosed'):
            raise ValueError('Untrusted model timing report')
        order={}
        for row in report['cases']:
            q,r=row['request'],row['result']
            if q['algorithm'] not in MODELS:continue
            if not row.get('pass') or not r.get('repeatExact') or any(q.get(k)!=r.get(k) for k in ('algorithm','fixture','config','encoding')):
                raise ValueError('Untrusted timing row')
            dt=r['config'].get('physicalDt')
            if dt not in (1,4) or r['config'].get('steps')!=256//dt or q.get('idleBetweenMs')!=5000 or q.get('profileGPU'):
                raise ValueError('Expected unprofiled dt1/dt4 with5s pauses')
            samples=r['samples'];hashes=r['hashes']
            if len(samples)!=3 or len(hashes)!=3 or len(set(hashes))!=1 or not all(r['fixtureSHA'].get(k) for k in ('rgba','water','paper')):
                raise ValueError('Missing complete input/output evidence')
            values=[]
            for sample in samples[1:]:
                v=sample['totalReadyMs']
                if sample.get('idleBeforeSampleMs',0)<4900 or isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<=0:
                    raise ValueError('Invalid paused timing sample')
                values.append(v)
            k=key(r);order.setdefault(k,[]).append(dt)
            g=groups.setdefault(k,{'fixtureSHA':r['fixtureSHA'],'hardware':r['hardware'],'arms':{}})
            if g['fixtureSHA']!=r['fixtureSHA'] or g['hardware']!=r['hardware']:raise ValueError('Input/hardware changed')
            arm=g['arms'].setdefault(dt,{'values':[],'outputSHA':hashes[0]})
            if arm['outputSHA']!=hashes[0]:raise ValueError('Output changed within same model')
            arm['values']+=values
        for sequence in order.values():
            if sequence not in ([1,4,4,1],[4,1,1,4]):raise ValueError('Expected one complete ABBA/BAAB block')
    for g in groups.values():
        if set(g['arms'])!={1,4}:raise ValueError('Missing model arm')
        for arm in g['arms'].values():
            v=arm['values'];arm.update(medianMs=median(v),minMs=min(v),maxMs=max(v),count=len(v))
    return groups

def apply_model_timing(scenes,paths):
    groups=read_model_timings(paths)
    for scene in scenes:
        for variant in scene['variants']:
            e=variant.get('evidence',{})
            if e.get('algorithm') not in MODELS:continue
            g=groups.get(key(e));dt=e['config'].get('physicalDt')
            if not g or dt not in g['arms']:continue
            arm=g['arms'][dt]
            if e.get('fixtureSHA')!=g['fixtureSHA'] or e.get('hardware')!=g['hardware'] or set(e.get('hashes',[]))!={arm['outputSHA']}:
                raise ValueError('Card does not match measured model')
            change=100*(g['arms'][4]['medianMs']/g['arms'][1]['medianMs']-1)
            evidence={'protocol':'ABBA/BAAB; four post5s samples per arm; totalReady, not full pen response','arms':g['arms'],'dt4ChangePercent':change,'picturesMayDiffer':True}
            variant['modelTiming']=evidence
            variant['timeMs']=arm['medianMs'];variant['timingMode']='после паузы';variant['comparable']=False
            variant['note']+='\nЧередование мелкого и крупного шага после5с паузы. Картинка может меняться: это сравнение моделей. '+json.dumps(evidence,ensure_ascii=False)
    return scenes
