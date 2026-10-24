"""Missing native random options must survive as independent response inputs."""
from pathlib import Path
import tempfile
import unittest
import convert
from PIL import Image,PngImagePlugin
from krita_import import convert_krita

class RandomOptionTests(unittest.TestCase):
    def brush(self,params):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'Generic.kpp'
            text=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in params.items())
            definition='<Brush type="auto_brush"><MaskGenerator type="circle" ratio=".7"/></Brush>'
            meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset','<Preset name="Unrelated" paintopid="paintbrush"><param name="brush_definition"><![CDATA['+definition+']]></param>'+text+'</Preset>')
            Image.new('RGB',(2,2)).save(p,format='PNG',pnginfo=meta)
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(p,catalog)
            self.assertEqual(catalog.skipped,[]);return catalog.brushes[0]

    def test_pressure_and_fuzzy_responses_are_not_collapsed_into_pressure(self):
        sensor='<params id="sensorslist"><ChildSensor id="fuzzy"><curve>0,.2;1,1;</curve></ChildSensor><ChildSensor id="pressure"><curve>0,.2;1,1;</curve></ChildSensor></params>'
        b=self.brush({'SizeUseCurve':'true','SizeSensor':sensor,'SizeUseSameCurve':'false'})['descriptor']
        self.assertAlmostEqual(b['sizeByPressure']['samples'][0],.2)
        c=b['behavior']['modulations']['size'];self.assertEqual(len(c),1)
        self.assertEqual(b['behavior']['spacing']['mode'],'diameter')
        self.assertEqual(c[0]['control'],'random');self.assertAlmostEqual(c[0]['curve']['samples'][0],.2)

    def test_nonproduct_mode_does_not_discard_single_pressure_plus_additive_fuzzy(self):
        sensor='<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="pressure"><curve>0,0;1,1;</curve></ChildSensor></params>'
        for mode in ['0','1','2','3','4']:
            b=self.brush({'PressureSize':'true','SizeUseCurve':'true','SizeSensor':sensor,'SizeUseSameCurve':'false','SizecurveMode':mode})['descriptor']
            self.assertEqual(b['sizeByPressure'],[[0,0],[1,1]])
            self.assertEqual(b['behavior']['modulations']['size'][0]['control'],'random')

    def test_ratio_preserves_local_y_and_independent_random_curve(self):
        b=self.brush({'PressureRatio':'true','RatioValue':'.6','RatioSensor':'<params id="fuzzy"><curve>0,0;1,1;</curve></params>'})['descriptor']
        controls=b['behavior']['modulations']['roundness']
        self.assertEqual(controls[0]['control'],'random');self.assertEqual(controls[1]['curve'],[[0,.6],[1,.6]])

    def test_unit_strength_hsv_keeps_neutral_domain_and_rejects_unproved_strength(self):
        for option,target in [('h','hue'),('s','saturation'),('v','value')]:
            params={'Pressure'+option:'true',option+'Value':'1',option+'Sensor':'<params id="fuzzy"><curve>0,.48;1,.61;</curve></params>'}
            b=self.brush(params);c=b['descriptor']['behavior']['colorAdjustment'][target]
            self.assertEqual(c['control'],'random');self.assertAlmostEqual(c['curve']['samples'][0],.48)
            params[option+'Value']='.7';b=self.brush(params)
            self.assertNotIn('colorAdjustment',b['descriptor']['behavior'])
            self.assertTrue(any(x['feature']=='activeDynamics' and 'Pressure'+option in x['detail'] for x in b['compatibility']))

    def test_canonical_airbrush_key_overrides_legacy_alias(self):
        for params,expected in [({'PaintOpSettings/isAirbrushing':'true'},True),({'AirbrushOption/isAirbrushing':'true'},True),({'PaintOpSettings/isAirbrushing':'false','AirbrushOption/isAirbrushing':'true'},False)]:
            b=self.brush(params)
            self.assertEqual(any(x['feature']=='airbrush' for x in b['compatibility']),expected)

if __name__=='__main__':unittest.main()


class DabProgressTests(unittest.TestCase):
    def test_fade_is_dab_progress_with_own_curve_and_pressure_product(self):
        from krita_import import sensor_controls
        notes=[]
        params={'OpacityUseSameCurve':'false','OpacitySensor':'<params id="sensorslist"><ChildSensor id="fade" length="169" periodic="0"><curve>0,0;.5,.25;1,1;</curve></ChildSensor><ChildSensor id="pressure"/></params>'}
        c=sensor_controls(params,'Opacity',notes)
        self.assertEqual([x['control'] for x in c],['dabProgress','pressure'])
        self.assertEqual((c[0]['period'],c[0]['periodic']),(169,False))
        self.assertAlmostEqual(c[0]['curve']['samples'][0],0)
        self.assertLess(c[0]['curve']['samples'][128],.3)
        for raw in ['0','-1','1.5','nan','1000001']:
            notes=[];self.assertEqual(sensor_controls({'FlowSensor':f'<params id="fade" length="{raw}"/>'},'Flow',notes),[])
            self.assertTrue(any(x['status']=='unsupported' for x in notes))
        c=sensor_controls({'FlowSensor':'<params id="fade" periodic="1"/>'},'Flow',[])[0]
        self.assertEqual((c['period'],c['periodic']),(1000,True))
