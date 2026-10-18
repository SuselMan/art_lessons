"""CPU ingestion for the explicitly requested Curtis experiment, not old135.

Positive rows need three actual repeated full-state hashes. Wide optical floats
are neither clipped to opacity nor advertised as exactly mass-conserving.
"""
import copy
import hashlib
import json
import math
import statistics
import struct
import zlib
from pathlib import Path

STEPS = (16,64,256,1024)
PRIMARY = 'totalReadyMs: fresh CPU input → init/upload + actually signaled input fence + run + GPU G+D/dryliteral combine + full16MiB FLOAT CPU output. computeAndReadMs starts only AFTER input fence signals; diagnostic raw state/hash/PNG excluded'


def require(value,message):
    if not value:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(value):
    return isinstance(value,str) and len(value)==64 and all(c in '0123456789abcdef' for c in value)


def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)


def verify_build(directory, catalog, expected_ids):
    directory=Path(directory)
    raw=(directory/'manifest.json').read_bytes()
    manifest=json.loads(raw)
    sources={}
    for row in manifest['files']:
        name=row['file']
        require(not Path(name).is_absolute() and '..' not in Path(name).parts and name not in sources,'Unsafe/duplicate Curtis build member')
        actual=sha((directory/name).read_bytes())
        require(actual==row['sha256'],'Curtis build bytes changed')
        sources[name]=actual
    require(all(k in sources for k in ('index.html','entry.js','curtis-worker.js','curtis-fixtures.json','source-passport.json')),'Incomplete Curtis build')
    fixtures=json.loads((directory/'curtis-fixtures.json').read_text())['fixtures']
    require(len(fixtures)==len(expected_ids) and {i['id']for i in fixtures}==set(expected_ids),'Curtis build scene set differs')
    records={i['id']:i for i in catalog}
    for item in fixtures:
        frozen=records[item['id']]
        require(item['encoding']==frozen['encoding']=='optical-density' and item['sha']==frozen['sha']
                and item['binarySHA256']==frozen['binarySHA256'],'Curtis fixture identity mismatch')
        metadata_bytes=Path(frozen['metadata']).read_bytes()
        require(sha(metadata_bytes)==frozen['metadataSHA256'],'Frozen capture metadata changed')
        metadata=json.loads(metadata_bytes)
        scale=metadata.get('manifest',{}).get('pigmentScale',1)
        require(item['sourceScale']==scale and finite(scale) and 0<scale<=1,'Curtis source scale mismatch')
        payload=(directory/'fixtures'/(item['id']+'.bin')).read_bytes()
        require(len(payload)==1024*1024*6 and sha(payload)==item['binarySHA256'],'Curtis actual fixture bytes mismatch')
        n=1024*1024
        require({k:sha(payload[a:b])for k,a,b in [('rgba',0,n*4),('water',n*4,n*5),('paper',n*5,n*6)]}==item['sha'],'Curtis actual field bytes mismatch')
    return dict(buildManifestSHA256=sha(raw),sourceHashes=sources,fixtures={i['id']:i for i in fixtures})


def normalize_row(report,row,build,directory,*,_single_execution=False):
    require(report.get('pass') is True and report.get('sourceStable') is True and report.get('contextClosed') is True
            and report.get('errors')==[],'Curtis report is not closed successful evidence')
    require(report.get('sourceHashes')==build['sourceHashes'] and report.get('buildManifestSHA')==build['buildManifestSHA256'],'Curtis report build mismatch')
    require(row.get('pass') is True,'Failed Curtis row')
    request,r=row['request'],row['result']
    item=build['fixtures'].get(request['fixture'])
    require(item is not None and request['steps'] in (0,*STEPS),'Unknown Curtis input/checkpoint')
    steps=request['steps'];repeats=request['repeats']
    require(type(steps) is int and type(repeats) is int,'Curtis checkpoint/repeat must be integers')
    require(repeats==1 if _single_execution else (repeats==3 if steps else repeats in (1,2,3)),'Positive Curtis checkpoints need three actual repeats')
    require(r.get('fixture')==item['id'] and r.get('steps')==steps and r.get('repeats')==repeats,'Curtis actual request mismatch')
    require(r.get('inputSHA')==item['sha'] and r.get('inputBinarySHA')==item['binarySHA256']
            and r.get('encoding')==item['encoding'] and r.get('sourceScale')==item['sourceScale'],'Curtis actual frozen input mismatch')
    for gate in (report.get('ready',{}).get('float32Gate',{}),r.get('float32Gate',{})):
        require(gate.get('passed') is True and gate.get('bitExact') is True and gate.get('rgbaFloat') is True
                and gate.get('glError')==0 and gate.get('highpBits',0)>=23,'Actual float32 storage/read gate absent')
    require(r.get('inputUnchanged') is True and r.get('inputSHAAfter')==item['sha'],'Curtis input changed during execution')
    meta=r.get('metadata',{})
    require(meta.get('format')=='RGBA32F/FLOAT' and meta.get('backend')=='WebGL2 GLSL300 explicit highp output' and meta.get('size')==meta.get('grid')==1024
            and meta.get('fixedInitialDomain') is True and meta.get('waterMode')=='dynamic','Curtis format/grid/domain mismatch')
    draw=meta.get('floatGate',{});values=draw.get('actualRead',[])
    require(draw.get('halfFallback') is False and len(values)==4 and all(finite(v)for v in values)
            and abs(values[0]-1.000244140625)<=1e-7 and abs(values[1]-.12345679)<=1e-7
            and values[2:]==[-.25,4],'Actual float32 render precision gate failed')
    metrics=r.get('metrics',{})
    for key in ('nonfinite','negative','dryChanged','outsideMaterial','outsideWater'):
        require(metrics.get(key)==0,'Curtis material guard failed: '+key)
    for key in ('initial','final','ratios'):
        require(isinstance(metrics.get(key),list) and len(metrics[key])==4,'Curtis four-channel ledger missing')
    require(all(finite(v) and v>=0 for k in ('initial','final')for v in metrics[k])
            and all(v is None or finite(v) for v in metrics['ratios']),'Curtis invalid float ledger')
    require(all(metrics['ratios'][c] == (metrics['final'][c]/metrics['initial'][c] if metrics['initial'][c] else None) for c in range(4)), 'Curtis ledger ratios inconsistent')
    if steps==0:
        require(finite(metrics.get('maxIdentityError')) and metrics['maxIdentityError']<=1e-6
                and metrics.get('zeroEncodedMismatch')==metrics.get('identityDisplayChanged')==0,'Curtis zero-step identity failed')
    else:
        require(meta.get('auditPreClamp') is True and metrics.get('preClampNegative')==0
                and metrics.get('preClampScope') not in (None,'not sampled'),'Curtis negative preclamp checkpoint is not accepted')
    hashes,states,samples=r.get('hashes',[]),r.get('stateHashes',[]),r.get('samples',[])
    require(r.get('repeatExact') is True and len(hashes)==len(states)==len(samples)==repeats
            and digest(r.get('outputSHA')) and all(h==r['outputSHA']for h in hashes),'Curtis actual repeated output hashes missing')
    require(all(set(s)=={'G','D','W'} and all(digest(v)for v in s.values()) and s==states[0]for s in states),'Curtis repeated full float state differs')
    for sample in samples:
        require(sample.get('primaryScope')==PRIMARY and sample.get('outputReadBytes')==1024*1024*16,'Curtis primary timer boundary changed')
        require(all(finite(sample.get(k)) and sample[k]>=0 for k in ('initSubmitMs','initReadyMs','initFenceWaitMs','computeAndReadMs','runSubmitMs','outputCombineAndReadMs','totalReadyMs','diagnosticRawReadMs'))
                and sample['totalReadyMs']>0,'Invalid Curtis timing sample')
        fence=sample.get('initFence',{})
        require(fence.get('api')=='WebGL2 fenceSync/clientWaitSync' and fence.get('flushed') is True and fence.get('timeoutNs')==0 and fence.get('requestedPollDelayMs')==1 and type(fence.get('polls')) is int and fence['polls']>=1 and (fence.get('terminalStatus'),fence.get('glStatus')) in (('ALREADY_SIGNALED',37146),('CONDITION_SATISFIED',37148)), 'Curtis GPU input readiness fence missing/failed')
        require(abs(sample['totalReadyMs']-sample['initReadyMs']-sample['computeAndReadMs'])<.01 and sample['initReadyMs']>=sample['initSubmitMs'] and sample['computeAndReadMs']>=sample['runSubmitMs'],'Curtis prepared-input timing arithmetic inconsistent')
    path=(Path(directory)/row['png']['file']).resolve();payload=path.read_bytes()
    require(sha(payload)==row['png']['sha256']==r.get('pngSHA') and payload[:8]==b'\x89PNG\r\n\x1a\n'
            and payload[12:16]==b'IHDR' and struct.unpack('>II',payload[16:24])==(1024,1024),'Curtis actual PNG mismatch')
    validate_png(payload)
    if steps==0:
        return dict(sceneId=item['id'],zeroStep=True,buildManifestSHA256=build['buildManifestSHA256'],inputSHA=item['sha'],metrics=copy.deepcopy(metrics))
    median=statistics.median(s['computeAndReadMs']for s in (samples[1:] or samples))
    preparation=statistics.median(s['initReadyMs']for s in (samples[1:] or samples))
    total=statistics.median(s['totalReadyMs']for s in (samples[1:] or samples))
    drift=', '.join(k+': '+('нет начального материала' if v is None else f'{(v-1)*100:+.4f}%')for k,v in zip(('R','G','B','доза'),metrics['ratios']))
    variant=dict(id='curtis-'+str(steps),comparisonKey='requested:curtis-virtual-pipes-f32:'+str(steps),
                 label=f'Виртуальные потоки · {steps} шагов · промежуточное состояние',imageSource=str(path),imageSHA256=sha(payload),
                 timeMs=median,timingMode='в серии',comparable=False,resultText=f'перенос + чтение; подготовка {preparation:.1f} мс · промежуточное состояние',
                 gridResolution=dict(transportGrid=1024,outputSize=1024),
                 note='Широкие float32 RGB — оптическая плотность, A — отдельный маркер дозы, не прозрачность. Верхнего ограничения RGB по A нет. Показано время шагов и полного чтения G+D (16 MiB) после подтверждённой GPU-готовности входа. Подготовка включает init/upload и ожидание fence. Полный интервал: '+f'{total:.1f} мс'+'. proof-чтения G/D/W и PNG вне интервала. С native напрямую не сравнивается. Изменение сумм: '+drift+'. Это измеренный дрейф, не доказательство точного сохранения массы. Отрицательные значения проверены до ограничения только на последнем шаге; история предыдущих ограничений не доказана.',
                 evidence=dict(origin='explicitly-requested-curtis-experiment',sourceHashes=copy.deepcopy(build['sourceHashes']),buildManifestSHA256=build['buildManifestSHA256'],inputSHA=copy.deepcopy(item['sha']),inputBinarySHA=item['binarySHA256'],sourceScale=item['sourceScale'],metadata=copy.deepcopy(meta),metrics=copy.deepcopy(metrics),samples=copy.deepcopy(samples),stateHashes=copy.deepcopy(states),hashes=copy.deepcopy(hashes),repeatCount=repeats))
    return dict(sceneId=item['id'],zeroStep=False,variant=variant)




def validate_executions(report,row,build,directory):
    executions=row.get('executionRequests',[]);scope=row.get('executionScope',{});context=report.get('operatorContext',{})
    require(len(executions)==3 and set(context)=={'browserContextId','targetId','sessionId'} and all(isinstance(v,str) and v for v in context.values()),'Curtis actual three-request/context proof missing')
    require(all(scope.get(k)==v for k,v in context.items()) and scope.get('candidateLifetime')=='fresh candidate for each single-repeat request' and scope.get('workerBinding')=='Frozen entry creates one worker and routes every request through that same worker; responses carry distinct request IDs','Curtis execution lifetime/same-worker binding mismatch')
    ids=set();actual=[]
    for e in executions:
        require(e.get('operatorContext')==context,'Curtis request changed owned context')
        request_raw=e.get('requestJSON','');response_raw=e.get('responseJSON','')
        require(sha(request_raw.encode())==e.get('requestSHA256') and sha(response_raw.encode())==e.get('responseSHA256'),'Curtis request/response provenance SHA mismatch')
        request=json.loads(request_raw);result=json.loads(response_raw)
        require(request==e.get('request')==dict(fixture=row['request']['fixture'],steps=row['request']['steps'],repeats=1) and result==e.get('result'),'Curtis provenance JSON differs from actual response')
        require(type(result.get('id')) is int and result['id']==e.get('actualResponseId') and result['id']not in ids,'Curtis actual response IDs reused')
        ids.add(result['id'])
        normalize_row(report,dict(request=request,result=result,png=row['png'],**{'pass':True}),build,directory,_single_execution=True)
        actual.append(result)
    aggregate=row['result']
    for key in ('samples','hashes','stateHashes'):
        require(aggregate.get(key)==sum((r[key]for r in actual),[]),'Curtis aggregate is not three actual responses: '+key)
    for key in ('outputSHA','pngSHA','metadata'):
        require(all(r.get(key)==aggregate.get(key) for r in actual),'Curtis request outputs/model differ: '+key)


def read_closed_reports(report_paths, build, expected_ids):
    """Exactly one independently closed five-checkpoint report per input.

    No prefix salvage: even successful rows from an unclosed process are rejected.
    All reports bind the same verified immutable build and frozen input records.
    """
    expected=set(expected_ids);seen=set();rows=[];provenance=[]
    require(len(expected)==len(expected_ids), 'Duplicate requested Curtis scene')
    for report_path in report_paths:
        path=Path(report_path).resolve();payload=path.read_bytes();report=json.loads(payload)
        require(report.get('pass') is True and report.get('sourceStable') is True
                and report.get('contextClosed') is True and report.get('errors')==[],
                'Curtis per-fixture report is not closed successful evidence')
        cases=report.get('cases',[])
        require(len(cases)==5, 'Curtis fixture needs zero and four checkpoints')
        fixtures={c.get('request',{}).get('fixture') for c in cases}
        require(len(fixtures)==1, 'Curtis report mixes fixture inputs')
        scene=next(iter(fixtures))
        require(scene in expected and scene not in seen, 'Unexpected/duplicate Curtis fixture report')
        require(sorted(c.get('request',{}).get('steps',-1) for c in cases)==[0,*STEPS]
                and all(c.get('request',{}).get('repeats')==3 for c in cases),
                'Curtis fixture checkpoints/repeats incomplete')
        for c in cases:
            validate_executions(report,c,build,path.parent)
        normalized=[normalize_row(report,c,build,path.parent) for c in cases]
        rows.extend(normalized);seen.add(scene)
        provenance.append(dict(sceneId=scene,reportSHA256=sha(payload),buildManifestSHA256=build['buildManifestSHA256']))
    require(seen==expected, 'Missing closed Curtis fixture reports; publication withheld')
    return dict(rows=rows,reports=provenance)


def append_complete_curtis(native_data,rows):
    """All seven inputs × four checkpoints, never a placeholder or partial card."""
    from review_native_scope import KEEP_KEYS
    require([c['key']for c in native_data['variantCatalog']]==list(KEEP_KEYS),'Curtis append needs exact native-only base')
    out=copy.deepcopy(native_data);ids={s['id']for s in out['scenes']};found={};controls=set()
    require(len(ids)==len(out['scenes']),'Duplicate native source scene')
    for row in rows:
        require(row['sceneId']in ids,'Curtis scene outside current native scope')
        if row['zeroStep']:
            require(row['sceneId']not in controls,'Duplicate Curtis zero control');controls.add(row['sceneId']);continue
        key=(row['sceneId'],row['variant']['comparisonKey']);require(key not in found,'Duplicate Curtis checkpoint');found[key]=row['variant']
    require(controls==ids,'All source zero-step controls required')
    expected=['requested:curtis-virtual-pipes-f32:'+str(s)for s in STEPS]
    require(set(found)=={(i,k)for i in ids for k in expected},'Incomplete Curtis checkpoints; no holes allowed')
    for scene in out['scenes']:scene['variants'] += [copy.deepcopy(found[scene['id'],k])for k in expected]
    first=out['scenes'][0]
    out['variantCatalog'] += [dict(key=k,label=next(v['label']for v in first['variants']if v['comparisonKey']==k))for k in expected]
    out['title']=f'Наше растекание, три оптимизации и эксперимент с водой · {len(ids)} мазков'
    out['note']='Наш родной расчёт, три его оптимизации, исходный материал и четыре промежуточных состояния эксперимента с виртуальными потоками воды. Все варианты рассчитаны на каждом показанном мазке. 16/64/256/1024 шагов — checkpoints, не полностью высохшие цели. Общая OD-визуализация и исходный масштаб неизменны; универсальный выигрыш скорости между разными границами замера не вычисляется.'
    out['fixedMatrixCoverage']=dict(complete=True,scope='native-plus-requested-curtis-v1',scenes=len(ids),choices=9,cells=len(ids)*9,qualification='Explicit new scope only; old135 matrix remains stopped.')
    return out


def validate_png(payload):
    require(len(payload)<32*1024*1024 and payload[:8]==b'\x89PNG\r\n\x1a\n','Invalid PNG signature/size')
    at=8;parts=[];bpp=None;ended=False
    while at<len(payload):
        require(at+12<=len(payload),'Truncated PNG chunk')
        length=struct.unpack('>I',payload[at:at+4])[0];kind=payload[at+4:at+8]
        require(at+12+length<=len(payload),'Truncated PNG data')
        chunk=payload[at+8:at+8+length];crc=struct.unpack('>I',payload[at+8+length:at+12+length])[0]
        require(zlib.crc32(kind+chunk)&0xffffffff==crc,'PNG CRC mismatch')
        if kind==b'IHDR':
            require(len(chunk)==13 and struct.unpack('>II',chunk[:8])==(1024,1024) and chunk[8]==8 and chunk[9]in(2,6) and chunk[10:]==b'\x00\x00\x00','Unsupported PNG dimensions/format')
            bpp=3 if chunk[9]==2 else 4
        if kind==b'IDAT':parts.append(chunk)
        at+=12+length
        if kind==b'IEND':ended=True;break
    require(ended and at==len(payload) and bpp is not None and parts,'Incomplete PNG')
    expected=(1024*bpp+1)*1024;decoder=zlib.decompressobj();raw=decoder.decompress(b''.join(parts),expected+1)
    require(len(raw)==expected and decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail,'PNG scanline data invalid')
    require(all(raw[y*(1024*bpp+1)]<=4 for y in range(1024)),'Invalid PNG scanline filter')
