"""Authored witnesses for disabled-by-default primary source input admission."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import convert
from krita_import import convert_krita
from stroke_input import validate_policy
from test_krita_size_strength import authored

PARAMS={'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':'<params id="drawingangle"/>'}
POLICY={'version':1,'initialDirection':'cursorHistory'}

class StrokeInputTests(unittest.TestCase):
    def brush(self, params=None, **flags):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'Arbitrary authored name.kpp';path.write_bytes(authored(PARAMS if params is None else params))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog,**flags)
            self.assertEqual(catalog.skipped,[]);return catalog.brushes[0]
    def test_legacy_drawingangle_curve_precedence(self):
        curved='0,0;0.5,0.1;1,1;'
        for custom in ('false','true'):
            identity=self.brush({**PARAMS,'CustomRotation':custom,'CurveRotation':'0,0;1,1;'})
            self.assertEqual(identity['descriptor']['behavior']['rotation']['follow'],1)
        absent=self.brush({**PARAMS,'CurveRotation':curved})
        disabled=self.brush({**PARAMS,'CustomRotation':'false','CurveRotation':curved})
        self.assertEqual(absent['descriptor']['behavior']['rotation']['follow'],1)
        self.assertEqual(disabled['descriptor']['behavior']['rotation']['follow'],1)
        for same in ('true','false'):
            active=self.brush({**PARAMS,'CustomRotation':'true','CurveRotation':curved,'RotationUseSameCurve':same})
            self.assertIn('absolute',active['descriptor']['behavior']['rotation']['composition'])
        override=self.brush({**PARAMS,'CustomRotation':'true','CurveRotation':curved,'RotationcommonCurve':'0,0;1,1;'})
        self.assertEqual(override['descriptor']['behavior']['rotation']['follow'],1)
        empty=self.brush({**PARAMS,'CustomRotation':'true','CurveRotation':curved,'RotationcommonCurve':''})
        self.assertEqual(empty['descriptor']['behavior']['rotation']['follow'],1)
        for key in ('CustomRotation','RotationUseSameCurve'):
            with tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'bad.kpp';path.write_bytes(authored({**PARAMS,key:'yes','CurveRotation':curved}))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertFalse(catalog.brushes);self.assertIn('noncanonical',str(catalog.skipped))

    def test_single_rotation_empty_and_legacy_curve_matrix(self):
        curved='0,0;0.5,0.1;1,1;'
        scenarios=(
            ({'CustomRotation':'true','CurveRotation':curved},'curved'),
            ({'CustomRotation':'false','CurveRotation':curved},'identity'),
            ({'CustomRotation':'true','CurveRotation':curved,'RotationcommonCurve':''},'identity'),
            ({'CustomRotation':'true','CurveRotation':curved,'RotationcommonCurve':'0,0;1,1;'},'identity'),
            ({'CustomRotation':'true','CurveRotation':curved,'RotationSensor':'<params id="SENSOR"><curve/></params>'},'identity'),
            ({'CustomRotation':'true','CurveRotation':curved,'RotationUseSameCurve':'false','RotationSensor':'<params id="SENSOR"><curve/></params>'},'reject'),
        )
        for sensor in ('fuzzy','drawingangle'):
            for patch,expected in scenarios:
                with self.subTest(sensor=sensor,patch=patch):
                    params={**PARAMS,'RotationSensor':f'<params id="{sensor}"/>',**patch}
                    params['RotationSensor']=params['RotationSensor'].replace('SENSOR',sensor)
                    if expected=='reject':
                        with tempfile.TemporaryDirectory() as tmp:
                            path=Path(tmp)/'bad.kpp';path.write_bytes(authored(params));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                            self.assertFalse(catalog.brushes);self.assertIn('empty individual Rotation',str(catalog.skipped))
                        continue
                    desc=self.brush(params)['descriptor'];behavior=desc['behavior']
                    if sensor=='drawingangle':
                        rotation=behavior['rotation']
                        self.assertEqual('absolute' in rotation.get('composition',{}),expected=='curved')
                    else:
                        curve=behavior['dynamics']['angle']['curve']
                        self.assertEqual(curve!=[[0,0],[1,1]],expected=='curved')

    def test_empty_common_curve_overrides_legacy_for_shared_controls(self):
        from krita_import import sensor_controls
        identity=[[0,0],[1,1]]
        for option,sensor in (('Rotation','ascension'),('Size','pressure'),('Opacity','pressure'),('Flow','pressure'),('Scatter','pressure')):
            base={option+'Sensor':f'<params id="{sensor}"/>','Custom'+option:'true','Curve'+option:'0,1;1,0;',option+'UseSameCurve':'true'}
            for common,same,expected_identity in ((None,'true',False),('','true',True),('0,0;1,1;','true',True),('','false',False)):
                with self.subTest(option=option,common=common,same=same):
                    params={**base,option+'UseSameCurve':same}
                    if common is not None:params[option+'commonCurve']=common
                    controls=sensor_controls(params,option,[],allow_time=True)
                    self.assertEqual(len(controls),1)
                    self.assertEqual(controls[0]['curve']==identity,expected_identity)
        rotation={**PARAMS,'RotationSensor':'<params id="ascension"/>','CustomRotation':'true','CurveRotation':'0,1;1,0;','RotationcommonCurve':''}
        angle=self.brush(rotation)['descriptor']['behavior']['dynamics']['angle']
        self.assertEqual(angle['curve'],identity)

    def test_noncanonical_shared_curve_flags_fail_closed(self):
        from krita_import import sensor_controls
        for option,sensor in (('Rotation','ascension'),('Size','pressure'),('Opacity','pressure'),('Flow','pressure'),('Scatter','pressure')):
            base={option+'Sensor':f'<params id="{sensor}"/>','Custom'+option:'true','Curve'+option:'0,1;1,0;'}
            for key in (option+'UseSameCurve','Custom'+option):
                for value in ('yes','no',' true ',''):
                    with self.subTest(option=option,key=key,value=value),self.assertRaisesRegex(ValueError,'noncanonical'):
                        sensor_controls({**base,key:value},option,[],allow_time=True)
            for value in ('true','false','1','0'):
                with self.subTest(option=option,value=value):
                    self.assertEqual(len(sensor_controls({**base,option+'UseSameCurve':value},option,[],allow_time=True)),1)
                    self.assertEqual(len(sensor_controls({**base,'Custom'+option:value},option,[],allow_time=True)),1)
            controls=sensor_controls({**base,'Custom'+option:'yes',option+'UseSameCurve':'true',option+'commonCurve':'0,0;1,1;'},option,[],allow_time=True)
            self.assertEqual(controls[0]['curve'],[[0,0],[1,1]])

    def test_noncanonical_ascension_flag_skips_kpp(self):
        params={**PARAMS,'RotationSensor':'<params id="ascension"/>','CustomRotation':'yes','CurveRotation':'0,1;1,0;'}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'bad.kpp';path.write_bytes(authored(params));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
            self.assertFalse(catalog.brushes);self.assertIn('noncanonical CustomRotation',str(catalog.skipped))

    def test_default_off_and_identity(self):
        old=self.brush();self.assertEqual(old,self.brush(stroke_input=False));new=self.brush(stroke_input=True)
        self.assertEqual(new['descriptor']['behavior']['strokeInput'],POLICY)
        self.assertEqual(new['descriptor']['version'],34);self.assertNotEqual(old['descriptor']['id'],new['descriptor']['id'])
        before=copy.deepcopy(old['descriptor']);after=copy.deepcopy(new['descriptor'])
        for d in (before,after):d.pop('id');d.pop('version')
        after['behavior'].pop('strokeInput');self.assertEqual(before,after)
    def test_checked_usecurve_identity_and_locked_gates(self):
        patches=[{'PressureRotation':'false'},{'RotationUseCurve':'false'},{'RotationValue':'.5'}, {'RotationcurveMode':'1'},
          {'RotationSensor':'<params id="drawingangle" lockedAngleMode="1"/>'},
          {'RotationSensor':'<params id="drawingangle"><curve>0,.2;1,1;</curve></params>'},
          {'RotationSensor':'<params id="sensorslist"><ChildSensor id="drawingangle"/><ChildSensor id="pressure"/></params>'}]
        for patch in patches:
            with self.subTest(patch=patch):
                p={**PARAMS,**patch};self.assertEqual(self.brush(p),self.brush(p,stroke_input=True))
    def test_fan_steps_default_and_offset_preserved(self):
        for step in (None,5,10,30,90):
            attr='' if step is None else f' fanCornersStep="{step}"'
            p={**PARAMS,'RotationSensor':f'<params id="drawingangle" fanCornersEnabled="1" angleOffset="91"{attr}/>'}
            d=self.brush(p,stroke_input=True)['descriptor']
            self.assertEqual(d['behavior']['strokeInput']['fanCorners'],{'stepDegrees':30 if step is None else step})
            self.assertEqual(d['tip']['angle'],self.brush(p)['descriptor']['tip']['angle'])
    def test_invalid_active_fan_not_clamped_and_stale_ignored(self):
        for step in ('0','-1','91','30.5','oops'):
            p={**PARAMS,'RotationSensor':f'<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="{step}"/>'}
            b=self.brush(p,stroke_input=True);self.assertNotIn('strokeInput',b['descriptor']['behavior'])
            self.assertTrue(any(n['feature']=='strokeInput' and n['status']=='unsupported' for n in b['compatibility']))
            self.assertEqual(b['descriptor'],self.brush(p)['descriptor'])
            p['RotationSensor']=p['RotationSensor'].replace('fanCornersEnabled="1"','fanCornersEnabled="0"')
            self.assertEqual(self.brush(p,stroke_input=True)['descriptor']['behavior']['strokeInput'],POLICY)
    def test_use_same_curve_and_existing_lowering_both_required(self):
        p={**PARAMS,'RotationUseSameCurve':'false','RotationcommonCurve':'0,.2;1,1;'}
        b=self.brush(p,stroke_input=True);self.assertEqual(b['descriptor']['behavior']['strokeInput'],POLICY)
        p.update(RotationcommonCurve='0,0;1,1;',RotationSensor='<params id="drawingangle"><curve>0,.2;1,1;</curve></params>')
        curved=self.brush(p,stroke_input=True)['descriptor']
        self.assertEqual(curved['version'],61)
        self.assertEqual(curved['behavior']['strokeInput'],POLICY)
        self.assertIn('absolute',curved['behavior']['rotation']['composition'])
    def test_checked_pair120_and_malformed_child_keeps_unsupported_gap(self):
        for childsensor in ('<params id="drawingangle"/>','<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="91"/>'):
            p={**PARAMS,'MaskingBrush/Enabled':'true','MaskingBrush/Preset/brush_definition':'<Brush type="auto_brush"><MaskGenerator type="circle" diameter="30" ratio="1"/></Brush>','MaskingBrush/Preset/PressureRotation':'true','MaskingBrush/Preset/RotationSensor':childsensor}
            b=self.brush(p,stroke_input=True);self.assertEqual(b['descriptor']['behavior']['strokeInput'],POLICY)
            if childsensor=='<params id="drawingangle"/>':
                self.assertEqual(b['descriptor']['version'],120)
                self.assertEqual(b['descriptor']['behavior']['dual']['brush']['behavior']['strokeInput'],POLICY)
                self.assertTrue(any(n['feature']=='masking.strokeInput'and n['status']=='supported'for n in b['compatibility']))
            else:
                self.assertNotIn('strokeInput',b['descriptor']['behavior']['dual']['brush']['behavior'])
                self.assertTrue(any(n['feature']=='masking.strokeInput'and n['status']=='unsupported'for n in b['compatibility']))
            p['MaskingBrush/Enabled']='false';b=self.brush(p,stroke_input=True)
            self.assertFalse(any(n['feature']=='masking.strokeInput' for n in b['compatibility']))
    def test_portable_primary_valid_and_invalid_atomic(self):
        brush=self.brush(stroke_input=True)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'bundle.grafetto-brushes.json'
            envelope={'library':{'schemaVersion':1,'brushes':[brush],'assets':[],'skipped':[]},'assets':{}}
            path.write_text(json.dumps(envelope));convert.portable_bundle(path,convert.Catalog(root/'valid'))
            mutations=[lambda d:d['behavior']['strokeInput'].update(version=True),lambda d:d['behavior']['strokeInput'].update(extra=1),lambda d:d['behavior']['strokeInput'].update(initialDirection='unknown')]
            for step in (0,91,5.5,True):mutations.append(lambda d,step=step:d['behavior']['strokeInput'].update(fanCorners={'stepDegrees':step}))
            mutations.append(lambda d:d['behavior'].update(dual={'brush':copy.deepcopy(d),'blendMode':'multiply','sampling':'independent'}))
            for i,mutate in enumerate(mutations):
                bad=copy.deepcopy(envelope);mutate(bad['library']['brushes'][0]['descriptor']);path.write_text(json.dumps(bad));catalog=convert.Catalog(root/str(i))
                with self.assertRaises(ValueError):convert.portable_bundle(path,catalog)
                self.assertEqual(catalog.brushes,[]);self.assertEqual(list(catalog.output.iterdir()),[])
            with self.assertRaises(ValueError):validate_policy(brush['descriptor'],depth=1)
    def test_independent_sequential_and_input_flags_compose(self):
        from test_sequential_xy import PARAMS as XY_PARAMS, POLICY as XY_POLICY
        p={**XY_PARAMS,**PARAMS}
        source=self.brush(p)
        self.assertNotIn('strokeInput',source['descriptor']['behavior'])
        self.assertNotIn('sequentialRandom',source['descriptor']['behavior'])
        both=self.brush(p,stroke_input=True,sequential_xy=True)['descriptor']
        self.assertEqual(both['version'],34)
        self.assertEqual(both['behavior']['strokeInput'],POLICY)
        self.assertEqual(both['behavior']['sequentialRandom'],XY_POLICY)
        self.assertNotIn('sequentialRandom',self.brush(p,stroke_input=True)['descriptor']['behavior'])
        self.assertNotIn('strokeInput',self.brush(p,sequential_xy=True)['descriptor']['behavior'])

    def test_opt_in_boolean_only(self):
        for flag in (1,None,'false'):
            with self.assertRaises(ValueError):convert_krita(Path('/not-read.kpp'),None,stroke_input=flag)

if __name__=='__main__':unittest.main()
