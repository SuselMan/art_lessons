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
        self.assertNotIn('strokeInput',self.brush(p,stroke_input=True)['descriptor']['behavior'])
    def test_enabled_child_never_emits_policy_and_reports_gap(self):
        for childsensor in ('<params id="drawingangle"/>','<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="91"/>'):
            p={**PARAMS,'MaskingBrush/Enabled':'true','MaskingBrush/Preset/brush_definition':'<Brush type="auto_brush"><MaskGenerator type="circle" diameter="30" ratio="1"/></Brush>','MaskingBrush/Preset/PressureRotation':'true','MaskingBrush/Preset/RotationSensor':childsensor}
            b=self.brush(p,stroke_input=True);self.assertEqual(b['descriptor']['behavior']['strokeInput'],POLICY)
            self.assertNotIn('strokeInput',b['descriptor']['behavior']['dual']['brush']['behavior'])
            self.assertTrue(any(n['feature']=='masking.strokeInput' and n['status']=='unsupported' for n in b['compatibility']))
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
