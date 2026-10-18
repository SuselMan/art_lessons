"""Lossless projection of viewer-facing fields, not of scientific evidence.

Call only AFTER full evidence validation. The certified object must be retained
separately; the browser needs no full shader maps, plane hashes or ledger matrices.
"""
import copy


def selected(value, names):
    return {k: copy.deepcopy(value[k]) for k in names if k in value}


def compact_ui_payload(data):
    out = selected(data, ('title', 'note', 'relatedLinks'))
    if 'variantCatalog' in data:
        out['variantCatalog'] = [selected(row, ('key', 'label')) for row in data['variantCatalog']]
    out['scenes'] = []
    for scene in data['scenes']:
        small = selected(scene, ('id', 'title', 'note'))
        small['variants'] = []
        for variant in scene['variants']:
            v = selected(variant, ('id', 'comparisonKey', 'label', 'image', 'imageSHA256',
                                   'timeMs', 'timingMode', 'comparable', 'sameInputVerified',
                                   'baselineMs', 'gainText', 'resultText', 'note', 'functionalError',
                                   'earlierComparison'))
            if 'gridResolution' in variant:
                v['gridResolution'] = selected(variant['gridResolution'], ('transportGrid', 'localFineGrid', 'fineSteps', 'outputSize'))
            for key, names in (('nativeTimed', ('contract', 'changePercent', 'baselineMs', 'comparison', 'outputMatchesOriginal')),
                               ('nativeCacheTiming', ('changePercent',)), ('modelTiming', ('dt4ChangePercent',))):
                if key in variant:
                    v[key] = selected(variant[key], names)
            evidence = variant.get('evidence', {})
            tiny = selected(evidence, ('timingContract',))
            if isinstance(evidence.get('config'), dict) and 'physicalDt' in evidence['config']:
                tiny['config'] = {'physicalDt': copy.deepcopy(evidence['config']['physicalDt'])}
            if isinstance(evidence.get('timing'), dict):
                tiny['timing'] = selected(evidence['timing'], ('newTimeChangePercent',))
            if tiny:
                v['evidence'] = tiny
            small['variants'].append(v)
        out['scenes'].append(small)
    return out
