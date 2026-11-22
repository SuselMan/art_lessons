"""Missing native random options must survive as independent response inputs."""
from pathlib import Path
import copy
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

    def test_darken_combines_pressure_and_fuzzy(self):
        result=self.brush({'PressureDarken':'true','DarkenValue':'1','DarkenUseCurve':'true','DarkenSensor':'<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="pressure"/></params>'})
        descriptor=result['descriptor'];control=descriptor['behavior']['dynamics']['brightness']
        self.assertEqual(control['combine']['policy'],'native-darken-v1')
        self.assertEqual(control['combine']['scaling'][0]['control'],'pressure')
        self.assertEqual(control['combine']['additive'][0]['control'],'random')
        self.assertFalse(any(n['status']=='unsupported' for n in result['compatibility']))
        convert.validate_portable_profile(descriptor)
        forged=copy.deepcopy(descriptor);dynamics=forged['behavior']['dynamics'];dynamics['size']=dynamics.pop('brightness')
        with self.assertRaisesRegex(ValueError,'Native darken'):convert.validate_portable_profile(forged)

    def test_pressure_and_fuzzy_responses_are_not_collapsed_into_pressure(self):
        sensor='<params id="sensorslist"><ChildSensor id="fuzzy"><curve>0,.2;1,1;</curve></ChildSensor><ChildSensor id="pressure"><curve>0,.2;1,1;</curve></ChildSensor></params>'
        b=self.brush({'PressureSize':'true','SizeUseCurve':'true','SizeSensor':sensor,'SizeUseSameCurve':'false'})['descriptor']
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

    def test_hsv_strength_keeps_native_neutral_domain(self):
        for option,target in [('h','hue'),('s','saturation'),('v','value')]:
            params={'Pressure'+option:'true',option+'Value':'1',option+'Sensor':'<params id="fuzzy"><curve>0,.48;1,.61;</curve></params>'}
            b=self.brush(params);c=b['descriptor']['behavior']['colorAdjustment'][target]
            self.assertEqual(c['control'],'random');self.assertAlmostEqual(c['curve']['samples'][0],.48)
            params[option+'Value']='.7';b=self.brush(params)
            if option=='h':
                adjusted=b['descriptor']['behavior']['colorAdjustment'][target]['curve']['samples']
                self.assertAlmostEqual(adjusted[0],.5+.7*(.48-.5))
                self.assertAlmostEqual(adjusted[-1],.5+.7*(.61-.5))
            else:
                adjusted=b['descriptor']['behavior']['colorAdjustment'][target]['curve']['samples']
                self.assertAlmostEqual(adjusted[0],.15+.49*.48)
                self.assertAlmostEqual(adjusted[-1],.15+.49*.61)

    def test_hue_fuzzy_strength_scales_offset_from_neutral(self):
        result=self.brush({'Pressureh':'true','hValue':'.22','hUseCurve':'true','hUseSameCurve':'false','hSensor':'<params id="fuzzy"><curve>0,.497816;1,.591495;</curve></params>'})
        control=result['descriptor']['behavior']['colorAdjustment']['hue']
        self.assertEqual(control['control'],'random')
        self.assertAlmostEqual(control['curve']['samples'][0],.5+.22*(.497816-.5))
        self.assertAlmostEqual(control['curve']['samples'][-1],.5+.22*(.591495-.5))
        self.assertFalse(any(n['status']=='unsupported' and 'Pressureh' in n['detail'] for n in result['compatibility']))
        convert.validate_portable_profile(result['descriptor'])

    def test_saturation_speed_preserves_strength_and_input(self):
        result=self.brush({'Pressures':'true','sValue':'.42','sSensor':'<params id="speed"/>','sUseCurve':'true'})
        control=result['descriptor']['behavior']['colorAdjustment']['saturation']
        self.assertEqual(control['control'],'speed')
        self.assertAlmostEqual(control['curve'][0][1],.29)
        self.assertAlmostEqual(control['curve'][-1][1],.29+.42*.42)
        self.assertFalse(any(n['feature']=='activeDynamics' and 'Pressures' in n['detail'] for n in result['compatibility']))

    def test_combined_value_strength_keeps_neutral_offset_and_restricted_role(self):
        sensor='<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="distance" length="1200" periodic="1"/></params>'
        result=self.brush({'Pressurev':'true','vValue':'.2','vSensor':sensor,'vUseCurve':'true','vUseSameCurve':'false'})
        control=result['descriptor']['behavior']['colorAdjustment']['value']
        self.assertEqual(control['combine']['policy'],'native-hsv-strength-v1');self.assertEqual(control['combine']['constant'],.2)
        self.assertFalse(any(n['status']=='unsupported' for n in result['compatibility']))
        convert.validate_portable_profile(result['descriptor'])
        forged=copy.deepcopy(result['descriptor']);adjustment=forged['behavior']['colorAdjustment'];adjustment['hue']=adjustment.pop('value')
        with self.assertRaisesRegex(ValueError,'Native HSV strength'):convert.validate_portable_profile(forged)

    def test_pixel_size_perspective_retains_native_no_assistant_default(self):
        sensor='<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="perspective"><curve>0,.2;1,.8;</curve></ChildSensor></params>'
        result=self.brush({'PressureSize':'true','SizeUseCurve':'true','SizeUseSameCurve':'false','SizeSensor':sensor})
        controls=result['descriptor']['behavior']['modulations']['size']
        self.assertEqual([c['control'] for c in controls],['random','perspective'])
        self.assertAlmostEqual(controls[1]['curve']['samples'][-1],.8)
        self.assertFalse(any(n['status']=='unsupported' for n in result['compatibility']))
    def test_hue_stroke_random_and_saturation_sensor_combination(self):
        params={'Pressureh':'true','hValue':'1','hSensor':'<params id="fuzzystroke"/>',
                'Pressures':'true','sValue':'1','sSensor':'<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="fuzzystroke"/></params>'}
        brush=self.brush(params)
        color=brush['descriptor']['behavior']['colorAdjustment']
        self.assertEqual(color['hue']['randomSource']['key'],'hFuzzyStroke')
        self.assertEqual([v['control'] for v in color['saturation']['combine']['additive']],['random','strokeRandom'])
        convert.validate_portable_dynamics([color['hue'],color['saturation']])
        self.assertFalse(any(n['status']=='unsupported' for n in brush['compatibility']))
        params['hSensor']='<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="fuzzy"/></params>'
        result=self.brush(params)
        hue=result['descriptor']['behavior']['colorAdjustment']['hue']
        self.assertEqual(hue['combine']['policy'],'native-hue-v1')
        self.assertFalse(any(n['status']=='unsupported' and 'Pressureh' in n['detail'] for n in result['compatibility']))
        convert.validate_portable_dynamics([hue])
        convert.validate_portable_profile(result['descriptor'])
        params['hSensor']='<params id="sensorslist"><ChildSensor id="fuzzystroke"/><ChildSensor id="distance" length="400" periodic="1"/></params>'
        distance=self.brush(params)['descriptor']['behavior']['colorAdjustment']['hue']
        self.assertEqual(distance['combine']['scaling'][0]['control'],'distance')
        forged=copy.deepcopy(result['descriptor']);adjustment=forged['behavior']['colorAdjustment']
        adjustment['saturation']=adjustment.pop('hue')
        with self.assertRaisesRegex(ValueError,'Native hue policy'):convert.validate_portable_profile(forged)
    def test_canonical_airbrush_key_overrides_legacy_alias(self):
        for params,expected in [({'PaintOpSettings/isAirbrushing':'true'},True),({'AirbrushOption/isAirbrushing':'true'},False),({'PaintOpSettings/isAirbrushing':'false','AirbrushOption/isAirbrushing':'true'},False)]:
            b=self.brush(params)
            self.assertEqual('timing' in b['descriptor']['behavior'],expected)



    def test_source_spacing_keeps_plain_pressure_geometry_without_fuzzy(self):
        d=self.brush({'PressureSize':'true','SizeUseCurve':'true','SizeSensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})['descriptor']
        self.assertEqual(d['behavior']['spacing'],{'mode':'diameter','coefficient':.1})
        self.assertEqual(d['sizeByPressure'],[[0,0],[1,1]])

    def test_native_accumulation_includes_varying_pigment_wash(self):
        for params in [{},{'PaintOpAction':'1'}]:
            self.assertEqual(self.brush(params)['descriptor']['behavior']['rendering']['accumulation'],'directOver')
        self.assertEqual(self.brush({'PaintOpAction':'2'})['descriptor']['behavior']['rendering']['accumulation'],'alphaDarken')
        varied=self.brush({'PaintOpAction':'2','Pressureh':'true','hUseCurve':'true','hValue':'1','hSensor':'<params id="fuzzy"/>'})
        self.assertEqual(varied['descriptor']['behavior']['rendering']['accumulation'],'alphaDarken')
        self.assertFalse(any(x['feature']=='washAccumulation' for x in varied['compatibility']))

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

    def test_portable_progress_and_random_controls_keep_recursive_contract(self):
        from convert import validate_portable_dynamics
        for c in [{'control':'dabProgress','period':169,'periodic':False}, {'control':'strokeRandom','randomStream':4294967295}, {'control':'random'}]:
            validate_portable_dynamics([dict(c,minimum=0,jitter=0)])
        for c in [{'control':'dabProgress','period':0,'periodic':False},{'control':'strokeRandom','randomStream':-1},{'control':'pressure','period':1,'periodic':False},{'control':'random','randomStream':0},{'control':'dabProgress','period':True,'periodic':False}]:
            with self.assertRaises(ValueError): validate_portable_dynamics([dict(c,minimum=0,jitter=0)])
