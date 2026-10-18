"""Attach archived model cards only after matching common input AND native PNG bytes.

imageRoot is the archived images directory (not the current output directory).
Current originals must have an absolute imageSource. This helper never copies files.
"""
import copy
import hashlib
import json
import re
from pathlib import Path

_NATIVE = {'lazy': ('native-mini-lazy', 'Исходный Mini — точная оптимизация шума'),
           'one-octave': ('native-mini-one-octave', 'Исходный Mini — одна октава шума')}


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _common(value):
    if not isinstance(value, dict) or set(value) != {'rgba', 'water', 'paper'} or any(
            not isinstance(x, str) or not re.fullmatch('[a-f0-9]{64}', x) for x in value.values()):
        raise ValueError('Missing/invalid commonInputSHA')
    return value


def _archived_image(variant, root):
    name = variant.get('image')
    if not isinstance(name, str) or not name:
        raise ValueError('Missing archived image')
    rel = Path(name)
    if rel.is_absolute() or '..' in rel.parts:
        raise ValueError('Archived image escapes imageRoot')
    if rel.parts[0] == 'images':
        rel = Path(*rel.parts[1:])
    result = (root / rel).resolve()
    if not result.is_relative_to(root) or not result.is_file():
        raise ValueError('Missing/outside archived image')
    digest = _sha(result)
    declared = variant.get('imageSHA256')
    if declared is not None and declared != digest:
        raise ValueError('Archived PNG SHA mismatch')
    return result, digest


def _identity(variant, digest):
    evidence = variant.get('evidence', {})
    old_id = variant.get('earlierSource', {}).get('variantId', variant.get('id'))
    native = _NATIVE.get(old_id)
    algorithm = evidence.get('algorithm') or (native[0] if native else old_id)
    if not isinstance(algorithm, str) or not algorithm:
        raise ValueError('Missing model identity')
    config = json.dumps(evidence.get('config', {}), sort_keys=True, separators=(',', ':'), allow_nan=False)
    encoding = evidence.get('encoding') or ('native-material' if native else 'unspecified')
    return algorithm, config, encoding, digest


def merge_earlier(scenes, comparisonPath, imageRoot):
    """Mutate/return scenes atomically; keep distinct models even with identical PNGs."""
    comparison = Path(comparisonPath)
    root = Path(imageRoot).resolve()
    old = json.loads(comparison.read_text())
    earlier = old.get('scenes')
    if not isinstance(earlier, list) or not root.is_dir():
        raise ValueError('Invalid earlier comparison/imageRoot')
    current = {s['id']: s for s in scenes}
    if len(current) != len(scenes) or len({s['id'] for s in earlier}) != len(earlier):
        raise ValueError('Duplicate scene id')
    pending = []
    comparison_sha = _sha(comparison)
    for source_scene in earlier:
        scene = current.get(source_scene['id'])
        if scene is None:
            raise ValueError('Missing matching earlier scene: ' + source_scene['id'])
        if _common(scene.get('commonInputSHA')) != _common(source_scene.get('commonInputSHA')):
            raise ValueError('Different commonInputSHA: ' + source_scene['id'])
        originals = [v for v in scene['variants'] if v.get('id') == 'original']
        old_originals = [v for v in source_scene['variants'] if v.get('id') == 'original']
        if len(originals) != 1 or len(old_originals) != 1:
            raise ValueError('Exactly one original required')
        actual = Path(originals[0].get('imageSource', ''))
        if not actual.is_absolute() or not actual.is_file():
            raise ValueError('Current original needs actual absolute imageSource')
        _, original_sha = _archived_image(old_originals[0], root)
        if _sha(actual) != original_sha:
            raise ValueError('Different original PNG bytes: ' + scene['id'])
        seen = set()
        ids = {v['id'] for v in scene['variants']}
        for variant in scene['variants']:
            file = Path(variant.get('imageSource', ''))
            # Unknown current image bytes can never justify dropping an old card.
            if file.is_absolute() and file.is_file():
                seen.add(_identity(variant, _sha(file)))
        additions = []
        for variant in source_scene['variants']:
            old_id = variant.get('id')
            if old_id == 'original':
                continue
            if not isinstance(old_id, str) or not old_id:
                raise ValueError('Missing earlier variant id')
            image, digest = _archived_image(variant, root)
            identity = _identity(variant, digest)
            if identity in seen:
                continue
            item = copy.deepcopy(variant)
            native = _NATIVE.get(old_id)
            item['id'] = 'earlier-' + ('native-' + old_id if native else old_id)
            if item['id'] in ids:
                # A second config/image of one model is a distinct card, not a duplicate.
                suffix = hashlib.sha256(json.dumps(identity).encode()).hexdigest()[:12]
                item['id'] += '-' + suffix
                if item['id'] in ids:
                    raise ValueError('Conflicting earlier card id')
            item['imageSource'] = str(image)
            item['imageSHA256'] = digest
            item['earlierComparison'] = True
            item['timingMode'] = 'в серии'
            if native:
                item['label'] = native[1]
                item['family'] = 'native'
            item['earlierSource'] = {'variantId': old_id, 'comparisonSHA256': comparison_sha,
                                     'originalPNG_SHA256': original_sha, 'imageSHA256': digest,
                                     'algorithm': identity[0], 'encoding': identity[2]}
            additions.append(item)
            seen.add(identity)
            ids.add(item['id'])
        pending.append((scene, additions))
    for scene, additions in pending:
        scene['variants'].extend(additions)
    return scenes
