"""Explicit offline source binding for the mapped compiler.

Version2 binds the distinct compiler profile/build to sensor and radial sources.
Importer selection requires an explicit trusted provider; soft author/material
integration and editor activation remain separate gates. Never reinterpret these coefficients as the old3.4 profile.
"""
import copy
import math
import re
import struct
from native_curve_compile import _number
from native_curve_arm_v3 import MappedCurveProvider, PROFILE, compile_curves_arm_v3
from source_stamp_data import (MAX_SOURCE_STAMP_BUDGET, required_source_curves,
                               source_stamp_budget, validate_source_stamp_shape, mapped_soft_frontier_retired, texture_pressure_source_curve)


def _raw(data):
    if type(data) is not dict:
        raise ValueError('Invalid mapped source stamp')
    raw = copy.deepcopy({key: value for key, value in data.items() if key != 'compiled'})
    # Reconstruct historical spelling only in a private validation copy. The
    # returned original raw spelling and all source/curve bytes stay unchanged.
    if mapped_soft_frontier_retired(data):
        historical=copy.deepcopy(raw)
        historical['unsupported'].insert(0,'soft-auto-raster-author-unavailable')
        validate_source_stamp_shape({'sourceStamp': historical})
    else:
        validate_source_stamp_shape({'sourceStamp': raw})
    return raw


def _sources(raw):
    sensors = required_source_curves(raw)
    source = raw.get('source', {})
    radial = source['softnessCurve'] if source.get('kind') == 'softAuto' else None
    # Radial identity has an R+2 table and must NOT use the sensor identity bypass.
    return sensors, radial


def _entry_budget(source):
    return (64 + len(source['text'].encode('utf-8')) + 32 * len(source['points'])
            + 32 * max(1, len(source['points']) - 1))


def compile_mapped_source_stamp(data, provider, *, texture_strength=False):
    if type(provider) is not MappedCurveProvider:
        raise ValueError('An explicit trusted mapped provider is required')
    raw = _raw(data)
    sensors, radial = _sources(raw)
    texture = texture_pressure_source_curve(raw) if texture_strength else None
    if texture_strength and texture is None: raise ValueError('Unsupported mapped texture pressure DATA')
    sources = sensors + ([] if radial is None else [radial]) + ([] if texture is None else [texture])
    if len(sources) > 64 or sum(len(source['points']) for source in sources) > 4096:
        raise ValueError('Mapped source compiler work budget exceeded')
    if source_stamp_budget(raw) + sum(map(_entry_budget, sources)) > MAX_SOURCE_STAMP_BUDGET:
        raise ValueError('Mapped compiled source aggregate budget exceeded')
    coefficients = compile_curves_arm_v3(
        [[[point['x'], point['y'], point['corner']] for point in source['points']]
        for source in sources], provider) if sources else []
    result = {'version': 2, 'reader': raw['reader'], 'profile': PROFILE,
              'buildId': provider.expected_build_id,
              'curves': [{'source': source, 'coefficients': pieces}
                         for source, pieces in zip(sensors, coefficients)]}
    if radial is not None:
        result['radialCurve'] = {'source': radial, 'coefficients': coefficients[len(sensors)]}
    if texture is not None:
        result['version']=3
        result['textureStrength']={'kind':'texture-pressure-curve-v1','curve':{'source':texture,'coefficients':coefficients[-1]}}
    return result


def _same(a, b):
    """Coefficient identity includes the sign of zero; no epsilon or relabel."""
    if type(b) is bool:
        return type(a) is bool and a == b
    if type(b) in (int, float):
        try:
            return (type(a) in (int, float) and math.isfinite(a)
                    and struct.pack('>d', a) == struct.pack('>d', b))
        except (OverflowError, struct.error):
            return False
    if type(b) is dict:
        return type(a) is dict and set(a) == set(b) and all(_same(a[k], v) for k, v in b.items())
    if type(b) is list:
        return type(a) is list and len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def validate_mapped_source_stamp_shape(data, compiled):
    # Check structural work/size bounds before invoking a trusted child.
    raw = _raw(data)
    sensors, radial = _sources(raw)
    texture=texture_pressure_source_curve(raw) if type(compiled) is dict and compiled.get('version')==3 else None
    if type(compiled) is not dict or set(compiled) != ({'version', 'reader', 'profile', 'buildId', 'curves'}
            | ({'radialCurve'} if radial is not None else set()) | ({'textureStrength'} if texture is not None else set())):
        raise ValueError('Invalid mapped source dictionary')
    if (type(compiled['version']) is not int or compiled['version'] != (3 if texture is not None else 2)
            or compiled['profile'] != PROFILE
            or type(compiled['buildId']) is not str or not re.fullmatch(r'[0-9a-f]{64}',compiled['buildId']) or compiled['reader'] != raw['reader']
            or type(compiled['curves']) is not list or len(compiled['curves']) != len(sensors)):
        raise ValueError('Mapped source profile/build binding differs')
    texture_entries=[]
    if texture is not None:
        slot=compiled['textureStrength']
        if type(slot) is not dict or set(slot)!={'kind','curve'} or slot['kind']!='texture-pressure-curve-v1':
            raise ValueError('Invalid mapped texture dictionary')
        texture_entries=[slot['curve']]
    entries = compiled['curves'] + ([] if radial is None else [compiled['radialCurve']]) + texture_entries
    for entry, source in zip(entries, sensors + ([] if radial is None else [radial]) + ([] if texture is None else [texture])):
        if type(entry) is not dict or set(entry) != {'source', 'coefficients'} or not _same(entry['source'], source):
            raise ValueError('Mapped curve differs from raw source binding')
        pieces = entry['coefficients']
        if (type(pieces) is not list or len(pieces) != len(source['points']) - 1
                or any(type(piece) is not list or len(piece) != 4
                       or any(not _number(v) for v in piece) for piece in pieces)):
            raise ValueError('Invalid mapped source coefficients')
    sources=sensors+([] if radial is None else [radial])+([] if texture is None else [texture])
    if len(sources)>64 or sum(len(source['points']) for source in sources)>4096:
        raise ValueError('Mapped source compiler work budget exceeded')
    for source in sources:
        if not 2<=len(source['points'])<=9 or source['points'][0]['corner'] or source['points'][-1]['corner']:
            raise ValueError('Unsupported mapped source curve grammar')
    if source_stamp_budget(raw)+sum(map(_entry_budget,sources))>MAX_SOURCE_STAMP_BUDGET:
        raise ValueError('Mapped compiled source aggregate budget exceeded')


def verify_mapped_source_stamp(data, compiled, provider):
    validate_mapped_source_stamp_shape(data,compiled)
    if type(provider) is not MappedCurveProvider or compiled['buildId']!=provider.expected_build_id:
        raise ValueError('Mapped source profile/build binding differs')
    expected = compile_mapped_source_stamp(data, provider, texture_strength=compiled['version']==3)
    if not _same(compiled, expected):
        raise ValueError('Mapped source coefficients differ from trusted compiler')
