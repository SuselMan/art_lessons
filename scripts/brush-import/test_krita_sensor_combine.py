import unittest
from krita_import import sensor_controls
from convert import validate_portable_dynamics

class SensorCombineTests(unittest.TestCase):
    def controls(self,mode=0,ids=('pressure','declination'),extra=None):
        p={'SizecurveMode':str(mode),'SizeUseSameCurve':'false','SizeSensor':'<params id="sensorslist">'+''.join('<ChildSensor id="'+i+'"/>'for i in ids)+'</params>'}
        p.update(extra or {});notes=[];return sensor_controls(p,'Size',notes),notes
    def test_modes_preserve_independent_controllers(self):
        for mode,name in [(1,'sum'),(2,'max'),(3,'min'),(4,'difference')]:
            controls,notes=self.controls(mode);c=controls[0]['combine'];self.assertEqual(c['mode'],name);self.assertEqual([x['control']for x in c['scaling']],['pressure','tiltElevation']);validate_portable_dynamics(controls)
            self.assertFalse(any(n['status']=='unsupported'for n in notes))
    def test_additive_groups_and_keyed_source(self):
        controls,_=self.controls(0,('pressure','fuzzy','fuzzystroke','ascension'));c=controls[0]['combine'];self.assertEqual(len(c['scaling']),1);self.assertEqual([x['control']for x in c['additive']],['random','strokeRandom','tiltDirection']);self.assertEqual(c['additive'][1]['randomSource']['key'],'SizeFuzzyStroke');validate_portable_dynamics(controls)
    def test_legacy_product_is_unchanged(self):
        controls,_=self.controls();self.assertEqual([x['control']for x in controls],['pressure','tiltElevation'])
    def test_nonunit_constant_does_not_use_wrong_clamp_order(self):
        controls,notes=self.controls(1,extra={'SizeValue':'.5'});self.assertEqual(controls[0]['combine']['constant'],.5);self.assertFalse(any(n['status']=='unsupported'for n in notes));validate_portable_dynamics(controls)
    def test_bounded_validation(self):
        controls,_=self.controls(2);c=controls[0]
        for children in [[],[c],c['combine']['scaling']*9]:
            bad={**c,'combine':{**c['combine'],'scaling':children}}
            with self.assertRaises(ValueError):validate_portable_dynamics([bad])
