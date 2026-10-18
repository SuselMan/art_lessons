"""Native cache cards require matched native inputs and full output equality."""
import hashlib,json
from pathlib import Path

def apply_native_cache(scenes,pairs):
    for pair in pairs:
        paths={k:Path(pair[k]) for k in ('control','cache')}
        reports={k:json.loads(p.read_text()) for k,p in paths.items()}
        if not all(r.get('pass') is True for r in reports.values()):raise ValueError('Native cache report failed')
        controls={r['id']:r for r in reports['control']['cases']}
        for row in reports['cache']['cases']:
            scene=next((s for s in scenes if s['id']==row['id']),None)
            if scene is None:raise ValueError('Missing native cache scene')
            control=controls[row['id']]
            c=next(v for v in control['variants'] if v['id']=='original')
            v=next(v for v in row['variants'] if v['id']=='original')
            for r,x in ((row,v),(control,c)):
                if not r.get('pass') or not x.get('pass') or not x.get('repeatExact') or not x.get('sourceStable') or not x.get('contextClosed') or x.get('errors'):raise ValueError('Incomplete native cache arm')
            if v.get('expectedCanonicalCaptureExact') is not True or v['rawSHA']!=c['rawSHA'] or v['commonSHA']!=c['commonSHA'] or scene['commonInputSHA']!=v['commonSHA']:raise ValueError('Different native cache input')
            if any(h!=c['hashes'][0] for h in c['hashes']+v['hashes']) or v['png']['sha256']!=c['png']['sha256']:raise ValueError('Native cache pixels differ')
            original=next(x for x in scene['variants'] if x['id']=='original')
            if hashlib.sha256(Path(original['imageSource']).read_bytes()).hexdigest()!=v['png']['sha256']:raise ValueError('Existing native card differs')
            stats=v.get('nativeFeatherCache',{});samples=v['samples']
            if stats.get('sourceID')!='805-native-feather-cache16-v1' or stats.get('prefixShaderGuards',0)<2 or len(stats.get('sourceSHA',{}))<4 or any(len(h)!=64 for h in stats['sourceSHA'].values()):raise ValueError('Missing actual cache shader proof')
            if len(samples)!=3 or any(s.get('idleBeforeSampleMs',0)<4900 for s in samples[1:]) or any(s.get('glError')!=0 or s.get('nativeFeatherCache',{}).get('fillDraws')!=1 or s.get('nativeFeatherCache',{}).get('cacheHits',0)<1 for s in samples):raise ValueError('Cache fill not included in all samples')
            scene['variants'].append(dict(id='native-feather-cache',label='Исходный Mini — кэш фронта',imageSource=str(paths['cache'].parent/v['png']['file']),timeMs=v['warmMedianMs'],timingMode='после паузы',comparable=False,resultText='Те же пиксели в проверенной сцене; процент ускорения проверяется отдельно',note='Исходная модель Mini, с кэшем повторного вычисления фронта. Дополнительно 4 MiB GPU-памяти. Заполнение кэша включено во время. Полные поля пигмента, воды, покрытия и конечная картинка совпали на этой сцене. Последовательные серии ещё не доказывают процент ускорения.\n'+json.dumps(stats,ensure_ascii=False),evidence=dict(nativeFeatherCache=v,control=c,reports={k:str(p) for k,p in paths.items()})))
    return scenes

def apply_native_cache_timing(scenes,paths):
    from statistics import median
    for path in paths:
        report=json.loads(Path(path).read_text())
        if report.get('pass') is not True:raise ValueError('Native balanced report failed')
        groups={}
        for row in report['cases']:groups.setdefault(row['scene'],[]).append(row)
        for name,rows in groups.items():
            if len(rows)!=4 or [r['cacheEnabled'] for r in rows] not in ([False,True,True,False],[True,False,False,True]):raise ValueError('Native ABBA/BAAB order missing')
            scene=next(s for s in scenes if s['id']==name);original=next(v for v in scene['variants'] if v['id']=='original');cache=next(v for v in scene['variants'] if v['id']=='native-feather-cache');expected=cache['evidence']['nativeFeatherCache'];arms={False:[],True:[]};cold={False:[],True:[]};sources={}
            for row in rows:
                v=next(x for x in row['variants'] if x['id']=='original');enabled=row['cacheEnabled'];samples=v['samples']
                if not row.get('pass') or not v.get('pass') or not v.get('repeatExact') or not v.get('sourceStable') or not v.get('contextClosed') or v.get('errors') or len(samples)!=3:raise ValueError('Native balanced arm incomplete')
                if v['commonSHA']!=scene['commonInputSHA'] or v['rawSHA']!=expected['rawSHA'] or v['png']['sha256']!=expected['png']['sha256'] or any(h!=expected['hashes'][0] for h in v['hashes']):raise ValueError('Native balanced input/output mismatch')
                if enabled in sources and sources[enabled]!=v['sourceHashes']:raise ValueError('Native source changed within arm')
                sources[enabled]=v['sourceHashes']
                for sample in samples:
                    if sample.get('glError')!=0:raise ValueError('Native GL error')
                    if enabled and sample.get('nativeFeatherCache',{}).get('fillDraws')!=1:raise ValueError('Missing timed cache fill')
                if any(s.get('idleBeforeSampleMs',0)<4900 for s in samples[1:]):raise ValueError('Actual native pause too short')
                arms[enabled].extend(s['totalReadyMs'] for s in samples[1:]);cold[enabled].append(samples[0]['totalReadyMs'])
            stats={str(k):dict(medianMs=median(v),minMs=min(v),maxMs=max(v),samples=v,cold=cold[k]) for k,v in arms.items()};gain=100*(stats['True']['medianMs']/stats['False']['medianMs']-1)
            for variant,enabled in ((original,False),(cache,True)):
                variant['timeMs']=stats[str(enabled)]['medianMs'];variant['timingMode']='после паузы';variant['nativeCacheTiming']=dict(changePercent=gain,arms=stats,report=str(path),protocol='ABBA/BAAB; four actual post5s samples per arm; all native fields/PNG exact; cache fill included')
            cache['resultText']='Те же пиксели; подтверждено чередованием вариантов';cache['note']+='\nПодтверждённое чередование: '+json.dumps(cache['nativeCacheTiming'],ensure_ascii=False)
    return scenes
