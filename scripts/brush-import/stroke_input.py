"""Disabled-by-default source input capability; never guesses native angle/history."""
import math
import re


def _enabled(value):
    return str(value).lower() in ('true', '1')


def source_policy(params, parse_xml, transfer):
    """Only a checked, unlocked, single identity DrawingAngle source.

    None means this class is outside the capability. Malformed active fan data
    raises so the caller can retain legacy behavior with an explicit warning.
    """
    if not _enabled(params.get('PressureRotation')) or not _enabled(params.get('RotationUseCurve', 'true')):
        return None
    root = parse_xml(params.get('RotationSensor', '<params id="pressure"/>'))
    nodes = list(root.findall('ChildSensor')) if root.get('id') == 'sensorslist' else [root]
    if len(nodes) != 1 or nodes[0].get('id') != 'drawingangle':
        return None
    node = nodes[0]
    try:
        locked = int(node.get('lockedAngleMode', '0')) != 0
        fan = int(node.get('fanCornersEnabled', '0')) != 0
        offset = float(node.get('angleOffset', '0'))
        strength = float(params.get('RotationValue', '1'))
        mode = int(params.get('RotationcurveMode', '0'))
    except (TypeError, ValueError, OverflowError) as error:
        raise ValueError('Invalid active DrawingAngle input settings') from error
    if locked or mode != 0 or strength != 1 or not math.isfinite(offset) or not -360 <= offset <= 360:
        return None
    curve = (params.get('RotationcommonCurve') if _enabled(params.get('RotationUseSameCurve', 'true')) else None) or node.findtext('curve') or '0,0;1,1;'
    if transfer(curve) != [[0, 0], [1, 1]]:
        return None
    policy = {'version': 1, 'initialDirection': 'cursorHistory'}
    if fan:
        raw = node.get('fanCornersStep', '30').strip()
        if not re.fullmatch(r'[+-]?\d+', raw) or not 5 <= int(raw) <= 90:
            raise ValueError('Active fan step outside supported integer 5..90 degrees; not clamped')
        policy['fanCorners'] = {'stepDegrees': int(raw)}
    return policy


def validate_policy(brush, depth=0):
    """Portable metadata validation mirrors shared strokeInput; independent children are not enabled."""
    behavior = brush.get('behavior', {})
    if not isinstance(behavior, dict) or 'strokeInput' not in behavior:
        return
    if depth > 0:
        raise ValueError('Independent child stroke input policy is unsupported')
    policy = behavior['strokeInput']
    if (type(behavior.get('version')) is not int or behavior['version'] != 2
            or not isinstance(policy, dict) or set(policy) - {'version', 'initialDirection', 'fanCorners'}
            or type(policy.get('version')) is not int or policy['version'] != 1
            or policy.get('initialDirection') != 'cursorHistory'):
        raise ValueError('Invalid portable stroke input policy')
    if 'fanCorners' in policy:
        fan = policy['fanCorners']
        if (not isinstance(fan, dict) or set(fan) != {'stepDegrees'}
                or type(fan.get('stepDegrees')) is not int or not 5 <= fan['stepDegrees'] <= 90):
            raise ValueError('Invalid portable fan corner step')
