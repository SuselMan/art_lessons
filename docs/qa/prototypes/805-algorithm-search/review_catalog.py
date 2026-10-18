"""Stable comparison choices; missing scene results remain missing, never fake cards."""
import hashlib
import json
import logging
import math
import re
from pathlib import Path

_LOG = logging.getLogger(__name__)
_SPECIAL_ORDER = {'original': 0, 'native-lazy': 1, 'native-one-octave': 2,
                  'native-cache': 3, 'input': 4}
_SPECIAL_LABELS = {'original': 'Исходный алгоритм Mini',
                   'native-lazy': 'Исходный Mini — точная оптимизация шума',
                   'native-one-octave': 'Исходный Mini — одна октава шума',
                   'native-cache': 'Исходный Mini — кэш фронта', 'input': 'До растекания — исходный мазок'}


def _canonical(value):
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('Nonfinite catalog config')
        return int(value) if value.is_integer() else value
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value):
            raise ValueError('Nonstring config key')
        return {k: _canonical(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [_canonical(v) for v in value]
    if value is None or isinstance(value, (str, int, bool)):
        return value
    raise ValueError('Non-JSON catalog config')


def _is_input(variant):
    return variant.get('id') == 'input' or str(variant.get('id', '')).startswith('input-reference-')


def _image_sha(variant):
    declared = variant.get('imageSHA256')
    source = Path(variant.get('imageSource', ''))
    if source.is_absolute() and source.is_file():
        actual = hashlib.sha256(source.read_bytes()).hexdigest()
        if declared is not None and declared != actual:
            raise ValueError('Input image SHA mismatch')
        return actual
    return declared if isinstance(declared, str) and re.fullmatch('[a-f0-9]{64}', declared) else None


def _identity(variant):
    identifier = variant.get('id')
    if not isinstance(identifier, str) or not identifier:
        raise ValueError('Variant id missing')
    evidence = variant.get('evidence') or {}
    earlier = variant.get('earlierSource') or {}
    algorithm = evidence.get('algorithm') or earlier.get('algorithm')
    special = ('original' if identifier == 'original' else
               'native-lazy' if identifier in ('lazy', 'earlier-native-lazy') or algorithm == 'native-mini-lazy' else
               'native-one-octave' if identifier in ('one-octave', 'earlier-native-one-octave') or algorithm == 'native-mini-one-octave' else
               'native-cache' if identifier == 'native-feather-cache' else None)
    if special:
        return special, {'algorithm': 'special', 'config': 'not-applicable', 'encoding': 'not-applicable'}
    if algorithm:
        algorithm_source = 'evidence.algorithm' if evidence.get('algorithm') else 'earlierSource.algorithm'
    else:
        algorithm = re.sub(r'-\d+$', '', identifier)
        algorithm_source = 'id-trailing-number-stripped'
    if not isinstance(algorithm, str) or not algorithm:
        raise ValueError('Invalid algorithm identity')
    config_source = 'evidence.config' if 'config' in evidence else 'variant.config' if 'config' in variant else None
    config = evidence.get('config') if config_source == 'evidence.config' else variant.get('config')
    if config_source is None:
        # Only the explicitly serialized machine JSON line, never a label guess.
        match = re.search(r'^Параметры: ([^\n]*)$', variant.get('note', ''), re.MULTILINE)
        if match:
            try:
                config = json.loads(match.group(1))
            except json.JSONDecodeError as error:
                raise ValueError('Malformed machine config JSON') from error
            config_source = 'note-machine-JSON'
        else:
            config = {}
            config_source = 'missing-explicit-config'
    if not isinstance(config, dict):
        raise ValueError('Config must be object')
    config = _canonical(config)
    omitted = []
    if type(config.get('verifyInitializer')) in (int, float) and config['verifyInitializer'] == 0:
        del config['verifyInitializer']
        omitted.append('verifyInitializer')
    encoding = evidence.get('encoding') or variant.get('encoding') or 'unspecified'
    if not isinstance(encoding, str):
        raise ValueError('Invalid encoding')
    key = 'model:' + json.dumps([algorithm, config, encoding], ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
    provenance = {'algorithm': algorithm_source, 'config': config_source,
                  'encoding': 'evidence.encoding' if evidence.get('encoding') else 'variant.encoding' if variant.get('encoding') else 'unspecified'}
    if omitted:
        provenance['omittedDiagnosticDefaults'] = omitted
    return key, provenance


def catalog_variants(data):
    """Assign actual comparisonKey values and an ordered union, without padding variants."""
    scenes = data.get('scenes')
    if not isinstance(scenes, list) or len({s['id'] for s in scenes}) != len(scenes):
        raise ValueError('Invalid/duplicate scenes')
    catalog, assignments, counts, warnings, aliases = {}, [], [], [], []
    for scene in scenes:
        variants = scene.get('variants', [])
        seen, input_groups = {}, {}
        inputs = [v for v in variants if _is_input(v)]
        # Explicit input wins the shared scene-input slot; never substitute it for original.
        ordered_inputs = sorted(enumerate(inputs), key=lambda row: (row[1]['id'] != 'input', row[0]))
        input_keys = {}
        for _, variant in ordered_inputs:
            digest = _image_sha(variant)
            if digest is not None and digest in input_groups:
                key = input_groups[digest]
                aliases.append({'scene': scene['id'], 'variant': variant['id'], 'key': key, 'imageSHA256': digest})
            else:
                key = 'input' if not input_keys else 'input-' + variant['id']
                if key in input_keys.values():
                    raise ValueError('Ambiguous input source id')
                if digest is not None:
                    input_groups[digest] = key
            input_keys[id(variant)] = key
        for variant in variants:
            if _is_input(variant):
                key, provenance = input_keys[id(variant)], {'algorithm': 'special-input', 'config': 'not-applicable', 'encoding': 'not-applicable'}
            else:
                key, provenance = _identity(variant)
            if key in seen and not (_is_input(variant) and _is_input(seen[key]) and
                                    _image_sha(variant) is not None and _image_sha(variant) == _image_sha(seen[key])):
                # Explicit shader/program distinctions must be supplied as algorithm/config,
                # not invented from output bytes or a local row number.
                raise ValueError('Duplicate comparisonKey in scene ' + scene['id'] + ': ' + seen[key]['id'] + ' / ' + variant['id'] + '; provide explicit algorithm/config/program identity')
            seen[key] = variant
            label = _SPECIAL_LABELS.get(key, variant.get('label') or variant['id'])
            catalog.setdefault(key, {'key': key, 'label': label})
            assignments.append((variant, key, provenance))
            if provenance['algorithm'] == 'id-trailing-number-stripped' or provenance.get('config') == 'missing-explicit-config':
                warnings.append({'scene': scene['id'], 'variant': variant['id'], 'provenance': provenance})
        counts.append({'scene': scene['id'], 'actualVariants': len(variants), 'availableKeys': len(seen)})
    encounter = {key: i for i, key in enumerate(catalog)}
    union = sorted(catalog.values(), key=lambda entry: (_SPECIAL_ORDER.get(entry['key'], 5), encounter[entry['key']]))
    for row in counts:
        row['missingCount'] = len(union) - row['availableKeys']
    stats = {'sceneCount': len(scenes), 'catalogSize': len(union), 'actualVariants': len(assignments),
             'missingSlots': sum(row['missingCount'] for row in counts), 'scenes': counts,
             'fallbackWarnings': warnings, 'inputAliases': aliases}
    # Commit only after all identities have been checked; retain every actual card object.
    for variant, key, provenance in assignments:
        variant['comparisonKey'] = key
        variant['comparisonKeyProvenance'] = provenance
    data['variantCatalog'] = union
    data['variantCatalogStats'] = stats
    _LOG.info('Catalog %s choices / %s actual variants / %s missing scene slots', len(union), len(assignments), stats['missingSlots'])
    return data
