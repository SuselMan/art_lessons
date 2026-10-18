"""Annotate review cards from exact old/new physical-device ABBA evidence."""
import argparse
import json
import math
from pathlib import Path
from statistics import median

PAIRS = {
    'wgsl-macro-coherent-physical-dt': 'wgsl-macro-gpu-initial-coherent-dt4',
    'wgsl-macro-physical-dt-fine': 'wgsl-macro-gpu-initial-fine',
    'wgsl-macro-coherent-safe-dither': 'wgsl-macro-coherent-fast-initial',
    'wgsl-macro-coherent-smooth-fine-paper': 'wgsl-macro-fast-coherent-smooth-fine-paper',
}
CANONICAL = {v: k for k, v in PAIRS.items()} | {k: k for k in PAIRS}
BOUNDARY = 'totalReady: подготовка и ожидание результата; без полного readback/PNG. Это не pure GPU и не полный отклик Mini.'


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def _key(r):
    config=dict(r.get('config', {}))
    if r['algorithm'] in ('wgsl-macro-gpu-initial-coherent-dt4','wgsl-macro-gpu-initial-fine') and config.get('verifyInitializer')==0:config.pop('verifyInitializer')
    return (CANONICAL[r['algorithm']], r['fixture'], _json(config), r.get('encoding'))


def _stats(values):
    return dict(medianMs=median(values), minMs=min(values), maxMs=max(values), count=len(values))


def _read(paths, idle=False, balanced=False):
    groups = {}
    for path in dict.fromkeys(Path(p).resolve() for p in paths):
        report = json.loads(path.read_text())
        if report.get('pass') is not True or report.get('sourceStable') is not True or report.get('errors'):
            raise ValueError(f'Untrusted timing report: {path.name}')
        if balanced and report.get('contextClosed') is not True:raise ValueError('Timing context not closed')
        order = {}
        for row in report['cases']:
            q, r = row['request'], row['result']
            if q['algorithm'] not in CANONICAL:
                continue
            hashes = r.get('hashes', [])
            if (row.get('pass') is not True or r.get('repeatExact') is not True or not hashes
                    or len(set(hashes)) != 1 or len(hashes) != len(r['samples'])
                    or not all(r.get('fixtureSHA', {}).get(k) for k in ('rgba', 'water', 'paper'))):
                raise ValueError('Missing exact input/output evidence')
            if any(r.get(k) != q.get(k) for k in ('algorithm', 'fixture', 'config', 'encoding')):
                raise ValueError('Request/result mismatch')
            carrier = row.get('carrier', {})
            if carrier and carrier.get('decodedSHA256') != hashes[0]:
                raise ValueError('Exported carrier hash mismatch')
            if not idle and (q.get('idleBetweenMs', 0) or q.get('profileGPU', False)):
                raise ValueError('Idle/profiled measurements cannot enter tight ABBA')
            if idle and not q.get('idleBetweenMs', 0):
                raise ValueError('Idle report must declare pause duration')
            if balanced and (q.get('idleBetweenMs')!=5000 or q.get('profileGPU') or r.get('config',{}).get('verifyInitializer',0)!=0 or len(r['samples'])!=3 or any(s.get('idleBeforeSampleMs',0)<4900 for s in r['samples'][1:])):raise ValueError('Expected unprofiled exact arms with actual5s pauses')
            values = [s['totalReadyMs'] for s in r['samples'][1:]]
            if not values or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in values):
                raise ValueError('Invalid warm totalReady samples')
            key = _key(r)
            g = groups.setdefault(key, dict(arms={}, fixtureSHA=r['fixtureSHA'], outputSHA=hashes[0], hardware=r.get('hardware'), reports=[]))
            if g['fixtureSHA'] != r['fixtureSHA'] or g['outputSHA'] != hashes[0] or g['hardware'] != r.get('hardware'):
                raise ValueError('Input/output/hardware differ within exact comparison')
            arm = g['arms'].setdefault(r['algorithm'], [])
            arm.extend(values)  # pool RAW warm samples, never medians of medians
            name = f'{path.parent.name}/{path.name}'
            if name not in g['reports']:
                g['reports'].append(name)
            order.setdefault(key, []).append(r['algorithm'])
            if idle:
                g.setdefault('pauseMs', set()).add(q['idleBetweenMs'])
                g.setdefault('profileGPU', set()).add(bool(q.get('profileGPU', False)))
        if not idle or balanced:
            for key, sequence in order.items():
                old, new = key[0], PAIRS[key[0]]
                if len(sequence) % 4 or any(sequence[i:i+4] not in ([old, new, new, old], [new, old, old, new]) for i in range(0, len(sequence), 4)):
                    raise ValueError('Expected complete ABBA arms per fixture/config/report')
    return groups


def apply_timing(scenes, report_paths, idle_report_paths=()):
    """Mutate/return scenes; old cards keep old times, new cards get new times."""
    tight, idle = _read(report_paths), _read(idle_report_paths, idle=True)
    for scene in scenes:
        for variant in scene['variants']:
            evidence = variant.get('evidence', {})
            if evidence.get('algorithm') not in CANONICAL or not evidence.get('fixture'):
                continue  # original Mini and unrelated models NEVER inherit this gain
            key, algorithm = _key(evidence), evidence['algorithm']
            blocks = []
            group = tight.get(key)
            if group and evidence.get('repeatExact') is True and evidence.get('fixtureSHA') == group['fixtureSHA'] and evidence.get('hardware') == group['hardware'] and evidence.get('hashes') and set(evidence['hashes']) == {group['outputSHA']}:
                old, new = key[0], PAIRS[key[0]]
                if old not in group['arms'] or new not in group['arms']:
                    raise ValueError('Incomplete exact pair')
                stats = {a: _stats(v) for a, v in group['arms'].items()}
                change = 100 * (stats[new]['medianMs'] / stats[old]['medianMs'] - 1) if stats[old]['medianMs'] else None
                timing = dict(boundary=BOUNDARY, protocol='tight ABBA; pooled samples[1:] of every arm', arms=stats,
                              oldAlgorithm=old, newAlgorithm=new, exactOutputSHA=group['outputSHA'], fixtureSHA=group['fixtureSHA'],
                              reports=group['reports'], displayedAlgorithm=algorithm, newTimeChangePercent=change)
                evidence['timing'] = timing
                variant['timeMs'] = stats[algorithm]['medianMs']
                # Keep comparable=False: there is NO speedup comparison to original Mini.
                variant['comparable'] = False
                short = f'ABBA: время {change:+.0f}% к прежнему точному варианту' if change is not None else 'ABBA: точное сравнение без процента'
                result = variant.get('resultText', '').split(' · ABBA:', 1)[0]
                if result.startswith('ABBA:'):
                    result = ''
                if algorithm == new:
                    variant['gainText'] = short
                    variant['resultText'] = result + (' · ' if result else '') + short
                blocks.append(f"ABBA: до {stats[old]['medianMs']:.1f} мс, после {stats[new]['medianMs']:.1f} мс; одинаковые полные RGBA-байты. {BOUNDARY}")
            ig = idle.get(key)
            if ig and evidence.get('repeatExact') is True and algorithm in ig['arms'] and evidence.get('fixtureSHA') == ig['fixtureSHA'] and evidence.get('hashes') and set(evidence['hashes']) == {ig['outputSHA']} and evidence.get('hardware') == ig['hardware']:
                stats = _stats(ig['arms'][algorithm])
                evidence['idleTiming'] = dict(**stats, pauseMs=sorted(ig['pauseMs']), profileGPU=sorted(ig['profileGPU']), reports=ig['reports'],
                    qualification='Отдельный режим с паузами; наличие GPU-профилирования указано отдельно. Не смешан с tight ABBA, не сравнение с Mini.')
                blocks.append(f"После паузы отдельно: медиана {stats['medianMs']:.1f} мс, диапазон {stats['minMs']:.1f}–{stats['maxMs']:.1f} мс; иной режим, не смешан с ABBA.")
            if blocks:
                variant['note'] = variant.get('note', '').split('\n\nЗамер времени: ', 1)[0] + '\n\nЗамер времени: ' + ' '.join(blocks)
    return scenes


def apply_paused_exact_timing(scenes, paths):
    """Latest complete paused ABBA; same complete pixels, different preparation backend."""
    groups=_read(paths,idle=True,balanced=True)
    for scene in scenes:
        for variant in scene['variants']:
            e=variant.get('evidence',{})
            if e.get('algorithm') not in CANONICAL:continue
            k=_key(e);g=groups.get(k);algorithm=e['algorithm']
            if not g:continue
            if e.get('fixtureSHA')!=g['fixtureSHA'] or e.get('hardware')!=g['hardware'] or set(e.get('hashes',[]))!={g['outputSHA']}:raise ValueError('Card differs from exact paused arms')
            old,new=k[0],PAIRS[k[0]]
            if set(g['arms'])!={old,new}:raise ValueError('Incomplete paused exact pair')
            stats={a:_stats(v) for a,v in g['arms'].items()};change=100*(stats[new]['medianMs']/stats[old]['medianMs']-1)
            timing=dict(boundary=BOUNDARY,protocol='paused ABBA/BAAB; four actual post5s samples per arm',arms=stats,oldAlgorithm=old,newAlgorithm=new,exactOutputSHA=g['outputSHA'],fixtureSHA=g['fixtureSHA'],reports=g['reports'],displayedAlgorithm=algorithm,newTimeChangePercent=change)
            e['timing']=timing;variant['timeMs']=stats[algorithm]['medianMs'];variant['timingMode']='после паузы';variant['comparable']=False
            # Older changed-physics timings remain in details, but must not label
            # a headline that now comes from a different exact-comparison series.
            if 'modelTiming' in variant:variant['previousModelTiming']=variant.pop('modelTiming')
            if algorithm==new:variant['gainText']='Точная подготовка на GPU'
            variant['note']+='\nОтдельное точное сравнение подготовки после5с паузы: '+json.dumps(timing,ensure_ascii=False)
    return scenes


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cards', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--report', action='append', default=[])
    parser.add_argument('--idle-report', action='append', default=[])
    args = parser.parse_args()
    data = json.loads(args.cards.read_text())
    apply_timing(data['scenes'], args.report, args.idle_report)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2))
