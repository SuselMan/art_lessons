"""Independent authored additive rotation witnesses, no named preset hacks."""
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp


class RotationImportTests(unittest.TestCase):
    def brush(self,tmp,strength='1',sensor='<params id="ascension"><curve>0,0;1,1;</curve></params>',extra=None):
        params={'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':sensor,'RotationValue':strength,**(extra or {})}
        text=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in params.items())
        path=Path(tmp)/'Unrelated.kpp';path.write_bytes(kpp(resources=text))
        c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c);self.assertEqual(c.skipped,[]);return c.brushes[0]

    def test_positive_negative_and_zero_strength_endpoints_cardinals(self):
        for strength in [1,-1,0,.5]:
            with self.subTest(strength=strength),tempfile.TemporaryDirectory() as tmp:
                b=self.brush(tmp,str(strength));d=b['descriptor']['behavior']['dynamics']['angle']
                self.assertEqual((d['control'],d['minimum'],d['jitter']),('tiltDirection',0,0))
                self.assertEqual(d['curve'],[[0,.5+.5*strength],[1,.5-.5*strength]])
                for u in [0,.25,.5,.75,1]:
                    response=.5+strength*(.5-u)
                    # Shader emits(response-1)turns; native emits
                    # (1-strength*(2u-1))/2 turns. Difference is one turn.
                    self.assertAlmostEqual((1-strength*(2*u-1))/2-(response-1),1)
                self.assertFalse(any(x['feature']=='activeDynamics' and 'PressureRotation' in x['detail'] for x in b['compatibility']))

    def test_native_cubic_precedes_strength_and_common_curve_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            sensor='<params id="ascension"><curve>0,0;0.5,0.2;1,1;</curve></params>'
            b=self.brush(tmp,'.5',sensor)
            curve=b['descriptor']['behavior']['dynamics']['angle']['curve']
            self.assertEqual(len(curve['samples']),256);self.assertEqual(curve['samples'][0],.75);self.assertEqual(curve['samples'][-1],.25)
            self.assertGreater(curve['samples'][128],.64)
            self.assertNotIn('preserveInputSign',curve)
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp,'1',extra={'RotationcommonCurve':'0,1;1,0;','RotationUseSameCurve':'true'})
            values=b['descriptor']['behavior']['dynamics']['angle']['curve']['samples']
            self.assertEqual(values[0],0);self.assertEqual(values[-1],1)
            self.assertAlmostEqual(values[128],128/255)

    def test_other_sensors_combinations_disabled_curve_and_outside_strength_stay_unsupported(self):
        cases=[('1','<params id="pressure"/>',{}),('1','<params id="fuzzy"/>',{}),
               ('1','<params id="sensorslist"><ChildSensor id="ascension"/><ChildSensor id="pressure"/></params>',{}),
               ('1','<params id="ascension"/>',{'RotationcurveMode':'1'}),
               ('1','<params id="ascension"/>',{'RotationUseCurve':'false'}),
               ('2','<params id="ascension"/>',{})]
        for strength,sensor,extra in cases:
            with self.subTest(sensor=sensor,extra=extra),tempfile.TemporaryDirectory() as tmp:
                b=self.brush(tmp,strength,sensor,extra)
                self.assertNotIn('angle',b['descriptor']['behavior'].get('dynamics',{}))
                self.assertTrue(any(x['status']=='unsupported' and 'PressureRotation' in x['detail'] for x in b['compatibility']))
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp,extra={'PressureRotation':'false'})
            self.assertNotIn('angle',b['descriptor']['behavior'].get('dynamics',{}))
            self.assertFalse(any('PressureRotation' in x['detail'] for x in b['compatibility']))


if __name__=='__main__':unittest.main()
