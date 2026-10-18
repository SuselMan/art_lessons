"""Curate by algorithm lineage, never by appearance or ownership of source code."""
import copy

NATIVE_KEYS = ('original', 'native-lazy', 'native-one-octave', 'native-cache')
KEEP_KEYS = (*NATIVE_KEYS, 'input')
LABELS = {
    'original': 'Наш исходный расчёт',
    'native-lazy': 'Наш расчёт · отложенный шум',
    'native-one-octave': 'Наш расчёт · одна октава шума',
    'native-cache': 'Наш расчёт · кэш фронта',
    'input': 'Исходный материал · без растекания',
}


def classify_catalog(plan):
    rows = []
    seen = set()
    for choice in plan['choices']:
        key, kind = choice['key'], choice['kind']
        if key in seen:
            raise ValueError('Duplicate catalogue key')
        seen.add(key)
        if kind == 'native-mini':
            if key not in NATIVE_KEYS or choice.get('model') != 'front8-detail-flow-v4':
                raise ValueError('Unreviewed native lineage')
            origin = 'native-core'
            reason = 'PencilEngine + actual createNativePuddleTarget; native/prefix shader transforms only.'
            refs = ['docs/qa/prototypes/mini-worker/runtime.ts:12', 'docs/qa/prototypes/mini-worker/runtime.ts:22',
                    'docs/qa/prototypes/mini-worker/build.cjs:14', 'docs/qa/prototypes/mini-worker/build.cjs:18']
        elif kind == 'input-reference' and key == 'input':
            origin, reason, refs = 'input-reference', 'Same frozen material; no algorithm.', []
        elif kind == 'worker-factory':
            origin = 'independent-model'
            reason = 'Separate common-input transport model. Exact/fused optimizations are relative to that new model, not native Grafetto.'
            refs = ['docs/qa/prototypes/805-algorithm-search/webgpu/index.ts',
                    'docs/qa/prototypes/805-algorithm-search/alternatives/index.ts']
        else:
            raise ValueError('Unreviewed catalogue origin')
        rows.append(dict(key=key, algorithm=choice.get('algorithm'), origin=origin,
                         keep=origin in ('native-core','input-reference'), reason=reason, sourceRefs=refs))
    if {r['key'] for r in rows if r['keep']} != set(KEEP_KEYS):
        raise ValueError('Native scope requires four native variants and one input reference')
    return rows


def native_scope(certified, plan):
    """Keep actual certified native rows; never pad a missing choice or create a result."""
    classification = classify_catalog(plan)
    if certified.get('fixedMatrixCoverage', {}).get('complete') is not True:
        raise ValueError('Only a fully certified per-card source can be curated')
    out = copy.deepcopy(certified)
    for scene in out['scenes']:
        found = {}
        for variant in scene['variants']:
            key = variant.get('comparisonKey')
            if key in KEEP_KEYS:
                if key in found or variant.get('evidence', {}).get('fixedMatrix') is not True:
                    raise ValueError('Duplicate or uncertified native result')
                found[key] = variant
        if set(found) != set(KEEP_KEYS):
            raise ValueError('No holes or historical native fallback allowed')
        scene['variants'] = [found[k] for k in KEEP_KEYS]
        for v in scene['variants']:
            v['label'] = LABELS[v['comparisonKey']]
            if v['comparisonKey'] == 'input':
                v['resultText'] = 'Исходный материал; расчёт не выполнялся'
                v['timeMs'] = None
    out['variantCatalog'] = [dict(key=k,label=LABELS[k]) for k in KEEP_KEYS]
    out.pop('variantCatalogStats', None)
    count = len(out['scenes'])
    out['title'] = f'Наше растекание и три оптимизации · {count} мазков'
    out['note'] = ('Только наш родной расчёт, три его оптимизации и исходный материал: по пять позиций для каждого мазка, без пропусков. '
                   'Самостоятельные исследовательские модели убраны из сравнения. Новый эксперимент с виртуальными потоками воды ещё не добавлен — сначала проверяем его на этих же мазках. '
                   'Все картинки используют общий вывод материала, а не финальный композитор Grafetto. Удерживайте картинку для сравнения с нашим исходным расчётом; кнопка «Увеличить» открывает детали.')
    out['relatedLinks'] = [dict(href='report.html',label='Что сравниваем и как измеряем время')]
    out['fixedMatrixCoverage'] = dict(complete=True,scope='native-core-only-v1',scenes=count,choices=5,cells=count*5,
                                    qualification='Only the retained native lineage; not the abandoned 135×30 plan.')
    out['lineageClassification'] = classification
    return out
