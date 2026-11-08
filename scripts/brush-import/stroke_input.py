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



def independent_drawing_angle_pair(value):
    def component(d,root):
        if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<120 or d.get('model')!='stamp':return False
        tip=d.get('tip');b=d.get('behavior')
        if not isinstance(tip,dict)or not isinstance(b,dict):return False
        if tip.get('kind')not in('round','bitmap','procedural')or any(k in tip for k in('animation','color','material','autoNoise','autoShape'))or 'profile'in tip and(not isinstance(tip['profile'],dict)or tip['profile'].get('kind')!='standard'):return False
        if 'imageSampling'in tip:
            sampling=tip['imageSampling']
            if d['version']<122 or tip['kind']!='bitmap'or 'profile'in tip or not isinstance(sampling,dict)or set(sampling)!={'kind','signal','sourceRect'}or sampling['kind']!='integer-pyramid'or sampling['signal']!='inverse-gray'or not isinstance(sampling['sourceRect'],dict):return False
            rect=sampling['sourceRect']
            if set(rect)!={'x','y','width','height'}or any(type(rect[k])is not int for k in rect)or rect['x']<0 or rect['y']<0 or rect['width']<1 or rect['height']<1 or rect['x']+rect['width']>2048 or rect['y']+rect['height']>2048:return False
        if any(k in d for k in('mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
        if set(b)-({'version','rendering','rotation','strokeInput','speedInput','spacing'}|({'dual'}if root else set())):return False
        rotation=b.get('rotation');policy=b.get('strokeInput')
        if not isinstance(rotation,dict)or set(rotation)!={'follow','random'}or type(rotation.get('follow'))not in(int,float)or rotation['follow']!=1 or rotation.get('random')!='none'or not isinstance(policy,dict)or set(policy)!={'version','initialDirection'}or type(policy.get('version'))is not int or policy['version']!=1 or policy.get('initialDirection')!='cursorHistory':return False
        if type(b.get('version'))is not int or b.get('version')!=2 or 'spacing'in b and not isinstance(b['spacing'],dict)or b.get('spacing',{}).get('dynamics'):return False
        render=b.get('rendering',{})
        return isinstance(render,dict)and render.get('blendMode')=='normal'and render.get('accumulation')in(('directOver',)if root else('directOver','alphaDarken'))and render.get('wetEdges',0)==0 and render.get('burntEdges',0)==0
    if not isinstance(value,dict)or not isinstance(value.get('behavior'),dict):return False
    dual=value['behavior'].get('dual')
    if not isinstance(dual,dict):return False
    child=dual.get('brush');images=isinstance(value.get('tip'),dict)and 'imageSampling'in value['tip']or isinstance(child,dict)and isinstance(child.get('tip'),dict)and 'imageSampling'in child['tip']
    if images and(type(value.get('version'))is not int or value['version']<122 or not isinstance(child,dict)or type(child.get('version'))is not int or child['version']<122):return False
    return dual.get('sampling')=='independent'and component(value,True)and component(child,False)

def validate_policy(brush, depth=0, parent=None):
    """Portable metadata validation mirrors shared strokeInput; independent children are not enabled."""
    behavior = brush.get('behavior', {})
    if not isinstance(behavior, dict) or 'strokeInput' not in behavior:
        return
    if depth > 0 and not(depth==1 and independent_drawing_angle_pair(parent) and parent['behavior']['dual']['brush']is brush):
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
