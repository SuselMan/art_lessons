"""Authored spacing-option parsing and independent native-law arithmetic."""
import copy
import json
import math
from pathlib import Path
import tempfile
import unittest
import convert
from krita_import import convert_krita
from test_krita import kpp


class PressureSpacingTests(unittest.TestCase):
    def brush(self,extra=None,definition=None):
        definition=definition or '<Brush type="auto_brush" spacing=".06"><MaskGenerator type="circle" ratio="1" diameter="60"/></Brush>'
        params=extra or {};saved=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in params.items())
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition,resources=saved))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c);self.assertEqual(c.skipped,[]);return c.brushes[0]

    def test_checked_defaults_pressure_identity_missing_strength_and_disabled_constant(self):
        b=self.brush({'PressureSpacing':'true'});profile=b['descriptor']['behavior']['spacing']
        self.assertEqual(profile,{'mode':'diameter','coefficient':.06,'dynamics':[{'control':'pressure','minimum':0,'jitter':0,'curve':[[0,0],[1,1]]}]})
        constant=self.brush({'PressureSpacing':'true','SpacingUseCurve':'false','SpacingValue':'.5'})['descriptor']['behavior']['spacing']
        self.assertEqual(constant,{'mode':'diameter','coefficient':.03})
        self.assertFalse(any(x['feature']=='activeDynamics' and 'PressureSpacing' in x['detail'] for x in b['compatibility']))

    def test_decreasing_native47_curve_and_update_false_does_not_disable(self):
        b=self.brush({'PressureSpacing':'true','SpacingValue':'1','SpacingSensor':'<params id="pressure"><curve>0,1;1,0;</curve></params>','PaintOpSettings/updateSpacingBetweenDabs':'false','Spacing/Isotropic':'false'})
        p=b['descriptor']['behavior']['spacing'];samples=p['dynamics'][0]['curve']['samples']
        self.assertEqual(samples[0],1);self.assertEqual(samples[-1],0);self.assertNotIn('isotropic',p)
        # Independent source law: fixedD48*.06*(1-pressure), then .5floor.
        self.assertEqual(max(.5,48*p['coefficient']*samples[-1]),.5)
        self.assertAlmostEqual(max(.5,48*p['coefficient']*.25),.72)
        self.assertAlmostEqual(max(.5,48*p['coefficient']),2.88)

    def test_auto_strength_scales_outside_sqrt_and_isotropic_is_explicit(self):
        definition='<Brush type="auto_brush" useAutoSpacing="1" autoSpacingCoeff=".8"><MaskGenerator type="circle" ratio="1" diameter="60"/></Brush>'
        p=self.brush({'PressureSpacing':'true','SpacingValue':'.5','Spacing/Isotropic':'true'},definition)['descriptor']['behavior']['spacing']
        self.assertAlmostEqual(p['coefficient'],.4);self.assertTrue(p['isotropic'])
        # At pressure.5 E=.25 afterstrength: .8*sqrt100*.25=2, notsqrt25*.8=4.
        self.assertEqual(p['coefficient']*math.sqrt(100)*.5,2)
        old=self.brush({},definition)['descriptor']['behavior']['spacing']
        self.assertEqual(old,{'mode':'kritaAuto','coefficient':.8})

    def test_zero_fixed_and_auto_strength_use_legitimate_zero_diameter_profile(self):
        fixed='<Brush type="auto_brush" spacing="0"><MaskGenerator type="circle" ratio="1"/></Brush>'
        self.assertEqual(self.brush({},fixed)['descriptor']['behavior']['spacing'],{'mode':'diameter','coefficient':0})
        auto='<Brush type="auto_brush" useAutoSpacing="1" autoSpacingCoeff=".8"><MaskGenerator type="circle" ratio="1"/></Brush>'
        self.assertEqual(self.brush({'PressureSpacing':'true','SpacingValue':'0'},auto)['descriptor']['behavior']['spacing'],{'mode':'diameter','coefficient':0})
        self.assertEqual(self.brush({},auto.replace('Coeff=".8"','Coeff="0"'))['descriptor']['behavior']['spacing'],{'mode':'diameter','coefficient':0})

    def test_disabled_pressure_option_keeps_source_axes_without_inactive_controls(self):
        b=self.brush({'PressureSpacing':'false','SpacingValue':'.2','SpacingSensor':'<params id="pressure"><curve>0,1;1,0;</curve></params>'})
        self.assertEqual(b['descriptor']['behavior']['spacing'],{'mode':'diameter','coefficient':.06});self.assertEqual(b['descriptor']['spacing'],.06)
        b=self.brush({'PressureSpacing':'true','SpacingcurveMode':'1','SpacingSensor':'<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="declination"/></params>'})
        self.assertNotIn('dynamics',b['descriptor']['behavior']['spacing'])
        self.assertTrue(any(x['feature']=='SpacingSensorCombination' and x['status']=='unsupported' for x in b['compatibility']))

    def test_portable_spacing_rejects_bad_dynamics_and_zero_auto_atomically(self):
        b=self.brush({'PressureSpacing':'true'})
        bundle={'library':{'schemaVersion':1,'brushes':[b],'assets':[],'skipped':[]},'assets':{}}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.grafetto-brushes.json';path.write_text(json.dumps(bundle))
            convert.portable_bundle(path,convert.Catalog(Path(tmp)/'good'))
            for i,profile in enumerate([{'mode':'kritaAuto','coefficient':0},{'mode':'diameter','coefficient':-.1},{'mode':'diameter','coefficient':.1,'isotropic':'true'},{'mode':'diameter','coefficient':.1,'dynamics':[{}]*5}]):
                bad=copy.deepcopy(bundle);bad['library']['brushes'][0]['descriptor']['behavior']['spacing']=profile
                path.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/str(i))
                with self.assertRaises(ValueError):convert.portable_bundle(path,out)
                self.assertEqual(list(out.output.iterdir()),[])


if __name__=='__main__':unittest.main()
