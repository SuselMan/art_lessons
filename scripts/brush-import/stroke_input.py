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
    from child_absolute_size187 import independent_child_absolute_size187_scope
    absolute187=independent_child_absolute_size187_scope(value)
    marker_behavior=value.get('behavior')if isinstance(value,dict)else None
    marker_dual=marker_behavior.get('dual')if isinstance(marker_behavior,dict)else None
    marker_child=marker_dual.get('brush')if isinstance(marker_dual,dict)else None
    if isinstance(value,dict)and(value.get('version')==187 or isinstance(marker_child,dict)and marker_child.get('version')==187)and not absolute187:return False
    material=isinstance(value,dict)and isinstance(value.get('tip'),dict)and'material'in value['tip']
    child=value.get('behavior',{}).get('dual',{}).get('brush',{})if isinstance(value,dict)and isinstance(value.get('behavior'),dict)and isinstance(value['behavior'].get('dual'),dict)else{}
    rt=value.get('tip',{})if isinstance(value,dict)else{};ct=child.get('tip',{})if isinstance(child,dict)else{}
    ra=rt.get('animation',{})if isinstance(rt,dict)else{};ca=ct.get('animation',{})if isinstance(ct,dict)else{};mat=rt.get('material',{})if isinstance(rt,dict)else{}
    animated130=(isinstance(value,dict)and isinstance(child,dict)and type(value.get('version'))is int and value['version']>=130 and type(child.get('version'))is int and child['version']>=130 and isinstance(ra,dict)and isinstance(ca,dict)and set(ra)=={'mode','frames'}and set(ca)=={'mode','frames'}and ra['mode']==ca['mode']=='random'and isinstance(ra['frames'],list)and 2<=len(ra['frames'])<=256 and isinstance(ca['frames'],list)and 2<=len(ca['frames'])<=256 and rt.get('mask')==ra['frames'][0]and ct.get('mask')==ca['frames'][0]and isinstance(mat,dict)and isinstance(mat.get('grayFrames'),list)and len(mat['grayFrames'])==len(ra['frames']) and mat.get('gray')==mat['grayFrames'][0])
    def component(d,root):
        if not isinstance(d,dict)or type(d.get('version'))is not int or d['version']<120 or d.get('model')!='stamp':return False
        tip=d.get('tip');b=d.get('behavior')
        if not isinstance(tip,dict)or not isinstance(b,dict):return False
        if tip.get('kind')not in('round','bitmap','procedural')or any(k in tip and(k!='material'or not material or not root)and(k!='animation'or not animated130)for k in('animation','color','material','autoNoise','autoShape'))or 'profile'in tip and(not isinstance(tip['profile'],dict)or tip['profile'].get('kind')!='standard'):return False
        if 'imageSampling'in tip:
            sampling=tip['imageSampling']
            if d['version']<122 or tip['kind']!='bitmap'or 'profile'in tip or not isinstance(sampling,dict)or set(sampling)!={'kind','signal','sourceRect'}or sampling['kind']!='integer-pyramid'or sampling['signal']!='inverse-gray'or not isinstance(sampling['sourceRect'],dict):return False
            rect=sampling['sourceRect']
            if set(rect)!={'x','y','width','height'}or any(type(rect[k])is not int for k in rect)or rect['x']<0 or rect['y']<0 or rect['width']<1 or rect['height']<1 or rect['x']+rect['width']>2048 or rect['y']+rect['height']>2048:return False
        if material and(tip['kind']!='bitmap'or'profile'in tip or'alphaThreshold'in tip):return False
        if any(k in d and not(animated130 and root and k in('texture','scatter'))for k in('mixer','wet','texture','scatter','spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal')):return False
        if animated130 and root and ('scatter'in d and(not isinstance(d['scatter'],dict)or d['scatter'].get('count')!=1)or'texture'in d and(not isinstance(d['texture'],dict)or not isinstance(d['texture'].get('application'),dict)or d['texture']['application'].get('mode')!='subtract'or'material'in d['texture']or'eraseId'in d['texture'])):return False
        if set(b)-({'version','rendering','rotation','strokeInput','speedInput','spacing'}|({'modulations'}if absolute187 and not root else set())|({'dual'}|({'modulations','colorAdjustment','scatter'}if animated130 else set())if root else set())):return False
        rotation=b.get('rotation');policy=b.get('strokeInput')
        if not isinstance(rotation,dict)or set(rotation)!={'follow','random'}or type(rotation.get('follow'))not in(int,float)or rotation['follow']!=1 or rotation.get('random')!='none'or not isinstance(policy,dict)or set(policy)!={'version','initialDirection'}or type(policy.get('version'))is not int or policy['version']!=1 or policy.get('initialDirection')!='cursorHistory':return False
        if type(b.get('version'))is not int or b.get('version')!=2 or 'spacing'in b and not isinstance(b['spacing'],dict)or b.get('spacing',{}).get('dynamics'):return False
        render=b.get('rendering',{})
        return isinstance(render,dict)and render.get('blendMode')=='normal'and render.get('accumulation')in(('alphaDarken',)if material else('directOver',)if root else('directOver','alphaDarken'))and render.get('wetEdges',0)==0 and render.get('burntEdges',0)==0
    if not isinstance(value,dict)or not isinstance(value.get('behavior'),dict):return False
    dual=value['behavior'].get('dual')
    if not isinstance(dual,dict):return False
    child=dual.get('brush');images=isinstance(value.get('tip'),dict)and 'imageSampling'in value['tip']or isinstance(child,dict)and isinstance(child.get('tip'),dict)and 'imageSampling'in child['tip']
    if images and(type(value.get('version'))is not int or value['version']<122 or not isinstance(child,dict)or type(child.get('version'))is not int or child['version']<122):return False
    if material:
        m=value['tip']['material'];ct=child.get('tip',{})if isinstance(child,dict)else{};sampling=ct.get('imageSampling',{});rect=sampling.get('sourceRect',{})if isinstance(sampling,dict)else{}
        if(type(value.get('version'))is not int or value['version']<128 or not isinstance(child,dict)or type(child.get('version'))is not int or child['version']<128 or value.get('paperInteraction')!=0 or child.get('paperInteraction')!=0 or value['tip'].get('kind')!='bitmap'or'imageSampling'in value['tip']or'profile'in value['tip']or not isinstance(m,dict)or set(m)!=({'kind','gray','strength','grayFrames'}if animated130 else{'kind','gray','strength'})or m.get('kind')!='lightness'or not isinstance(m.get('gray'),str)or not re.fullmatch(r'asset:[a-f0-9]{64}',m['gray'])or type(m.get('strength'))not in(int,float)or not math.isfinite(m['strength'])or not 0<=m['strength']<=1 or not isinstance(rect,dict)or type(rect.get('width'))is not int or not 1<=rect['width']<=512 or rect.get('height')!=rect['width']):return False
    if material:
        bounds=value['tip'].get('maskBounds')
        if not isinstance(bounds,dict)or any(type(bounds.get(k))not in(int,float)or not math.isfinite(bounds[k])for k in('x','y','width','height'))or bounds['x']<0 or bounds['y']<0 or bounds['width']<=0 or bounds['height']<=0 or bounds['x']+bounds['width']>1 or bounds['y']+bounds['height']>1:return False
    return dual.get('sampling')=='independent'and component(value,True)and component(child,False)


def validate_independent_pair_assets(brush,asset_sizes):
    if not independent_drawing_angle_pair(brush)or'material'not in brush['tip']:return
    t=brush['tip'];child=brush['behavior']['dual']['brush'];ct=child['tip'];alpha=asset_sizes.get(t.get('mask'),0);gray=asset_sizes.get(t['material']['gray'],0);mask=asset_sizes.get(ct.get('mask'),0);rect=ct['imageSampling']['sourceRect']
    if not 2<=alpha<=512 or alpha!=gray or not 2<=mask<=512 or rect['x']+rect['width']>mask or rect['y']+rect['height']>mask:raise ValueError('Lightness DrawingAngle128 paired source dimensions differ or exceed512')
    if 'animation'in t:
        if any(asset_sizes.get(a)!=alpha or asset_sizes.get(g)!=alpha for a,g in zip(t['animation']['frames'],t['material']['grayFrames']))or any(asset_sizes.get(a)!=mask for a in ct['animation']['frames']):raise ValueError('Animated Lightness DrawingAngle130 frame dimensions differ')


def validate_policy(brush, depth=0, parent=None):
    """Portable metadata validation mirrors shared strokeInput; independent children are not enabled."""
    if brush.get('version')==187:
        from child_absolute_size187 import independent_child_absolute_size187_scope
        whole=brush if depth==0 else parent
        if not independent_child_absolute_size187_scope(whole)or not independent_drawing_angle_pair(whole):raise ValueError('Invalid portable child absolute Size187 scope')
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
