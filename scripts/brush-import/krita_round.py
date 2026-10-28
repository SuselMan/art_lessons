"""Narrow round-marker settings adapter; no Krita implementation is copied.

Reference: Krita bd6e8d0 roundmarker/KisRoundMarkerOpOptionData.cpp defaults,
kis_roundmarkerop.cpp Size/Spacing and indirect max-alpha marker deposition.
Unsupported active settings fail instead of becoming ordinary OVER stamps.
"""
import math
from pathlib import PurePosixPath
from brush_contract import descriptor, finalize_identity, compatibility


def roundmarker_preset(data, root, params, name):
    allowed = {
        'CompositeOp', 'EraserMode', 'Krita/erase', 'FlowValue', 'OpacityValue',
        'PaintOpSettings/updateSpacingBetweenDabs', 'PressureSize', 'PressureSpacing',
        'PressureOpacity', 'PressureFlow', 'SizeSensor', 'SizeUseCurve',
        'SizeUseSameCurve', 'SizeValue', 'SizecurveMode', 'Spacing/Isotropic',
        'SpacingSensor', 'SpacingUseCurve', 'SpacingUseSameCurve', 'SpacingValue',
        'SpacingcurveMode', 'autoSpacingCoeff', 'diameter', 'paintop', 'spacing',
        'useAutoSpacing',
    }
    unknown = sorted(set(params) - allowed)
    if unknown:
        raise ValueError('Unsupported round-marker parameters: ' + ', '.join(unknown))
    is_enabled = lambda value: str(value).lower() in ('true', '1')
    active = sorted(key for key, value in params.items() if key.startswith('Pressure') and is_enabled(value))
    if active:
        raise ValueError('Unsupported active round-marker sensors: ' + ', '.join(active))
    if params.get('paintop', 'roundmarker') != 'roundmarker':
        raise ValueError('Conflicting round-marker engine parameter')
    if params.get('CompositeOp', 'normal') != 'normal' or any(is_enabled(params.get(key)) for key in ('EraserMode', 'Krita/erase')):
        raise ValueError('Round-marker supports only normal non-eraser compositing')

    def value(key, default, low, high):
        try:
            result = float(params.get(key, default))
        except (TypeError, ValueError):
            raise ValueError('Invalid round-marker ' + key) from None
        if not math.isfinite(result) or not low <= result <= high:
            raise ValueError('Round-marker ' + key + ' outside bounded range')
        return result

    diameter = value('diameter', 30, .01, 10000)
    spacing = value('spacing', .02, 0, 100)
    opacity = value('OpacityValue', 1, 0, 1)
    if value('FlowValue', 1, 0, 1) != 1:
        raise ValueError('Round-marker requires unit constant flow')
    auto = is_enabled(params.get('useAutoSpacing'))
    coefficient = value('autoSpacingCoeff', 1, 0, 100) if auto else spacing
    if auto and 0 < coefficient < .001:
        raise ValueError('Round-marker auto-spacing coefficient below supported .001')
    # Native effectiveSpacing forces isotropic axes; a zero auto law is
    # equivalent to zero diameter law before its common .5px minimum step.
    profile = {'mode': 'kritaAuto' if auto and coefficient else 'diameter',
               'coefficient': coefficient, 'isotropic': True}
    d = descriptor(data, '')
    d.update(version=28, opacity=opacity, spacing=max(.000001, min(2, spacing)))
    d['tip'] = {'kind': 'procedural', 'profile': {'kind': 'circleBand', 'antialias': True},
                'hardness': 1, 'aspect': 1, 'angle': 0, 'rotation': 'fixed'}
    d['behavior'] = {'version': 2, 'spacing': profile,
                     'rendering': {'mode': 'buildUp', 'accumulation': 'maxAlpha',
                                   'blendMode': 'normal', 'wetEdges': 0, 'burntEdges': 0,
                                   'burntEdgesMode': 'multiply'}}
    notes = [compatibility('roundMarker', 'Native circular band and max-alpha stroke primitive selected; constant diameter/spacing and global opacity retained. Device/source pixel equivalence still requires comparison.')]
    return {'descriptor': finalize_identity(d, data),
            'name': root.get('name') or PurePosixPath(name).stem,
            'source': PurePosixPath(name).name,
            'sourceDefaults': {'sizePx': diameter, 'opacity': opacity, 'flow': 1},
            'warnings': [note['feature'] + ': ' + note['detail'] for note in notes],
            'compatibility': notes}
