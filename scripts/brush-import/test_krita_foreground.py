"""Native legacy-strategy selection and independent rate/curve witnesses."""
import base64
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp


class LegacyForegroundTests(unittest.TestCase):
    def brush(self,extra=None,definition=None):
        params={'PressureColorRate':'true','ColorRateValue':'.7','ColorRateUseCurve':'false','SmudgeRateValue':'1',**(extra or {})}
        mode=params.pop('CompositeOp','normal')
        saved=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in params.items())
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'Unrelated.kpp';path.write_bytes(kpp(definition,resources=saved,engine='colorsmudge',mode=mode))
            image=io.BytesIO();Image.new('RGBA',(2,2),(80,140,200,128)).save(image,format='PNG')
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.png':image.getvalue()})
            return c

    def test_raw_smudge_strength_matters_even_when_checkbox_off(self):
        c=self.brush({'SmudgeRateValue':'.2','PressureSmudgeRate':'false'})
        m=c.brushes[0]['descriptor']['mixer']
        self.assertEqual((m['load'],m['initialLoad'],m['pickup']),(0,0,1))
        self.assertAlmostEqual(m['foreground']['rate'],.56)
        self.assertNotIn('dynamics',m['foreground'])
        self.assertAlmostEqual(self.brush({'SmudgeRateValue':'1'}) .brushes[0]['descriptor']['mixer']['foreground']['rate'],.14)

    def test_dynamic_smudge_uses_configured_maximum_for_foreground_prefactor(self):
        c=self.brush({'PressureSmudgeRate':'true','SmudgeRateUseCurve':'true','SmudgeRateSensor':'<params id="pressure"><curve>0,0.1;1,0.1;</curve></params>'})
        mixer=c.brushes[0]['descriptor']['mixer']
        self.assertAlmostEqual(mixer['foreground']['rate'],.14)
        self.assertAlmostEqual(mixer['pickupDynamics'][0]['curve']['samples'][0],.1)

    def test_zero_color_keeps_pure_canvas_and_native_flow_is_ignored(self):
        for checked in ['false','true']:
            c=self.brush({'PressureColorRate':checked,'ColorRateValue':'0','FlowValue':'.1','PressureFlow':'true','FlowUseCurve':'true','OpacityValue':'.4'})
            d=c.brushes[0]['descriptor'];self.assertNotIn('foreground',d['mixer'])
            self.assertEqual(d['flow'],1);self.assertEqual(d['flowByPressure'],[[0,1],[1,1]])
            self.assertEqual(d['opacity'],.4)
            self.assertNotIn('flow',d['behavior'].get('modulations',{}))

    def test_strategy_gate_applies_to_pure_and_foreground(self):
        gates=[({'SmudgeRateUseNewEngine':'true'},None),({'MergedPaint':'true'},None),({'CompositeOp':'multiply'},None),({'SmudgeRateMode':'2'},None)]
        gates += [({},'<Brush type="png_brush" filename="tip.png" brushApplication="'+str(mode)+'"/>') for mode in [1,2,3]]
        for color in ['0','.7']:
            for extra,definition in gates:
                with self.subTest(color=color,extra=extra,definition=definition):
                    c=self.brush({'ColorRateValue':color,**extra},definition);self.assertEqual(c.skipped,[])
                    b=c.brushes[0];self.assertNotIn('source',b['descriptor']['mixer'])
                    self.assertTrue(any(x['feature']=='colorSmudge' and x['status']=='unsupported' for x in b['compatibility']))
        c=self.brush({},'<Brush type="png_brush" filename="tip.png" brushApplication="0"/>')
        self.assertEqual(c.brushes[0]['descriptor']['mixer']['source'],'previousCanvas')

    def test_color_curve_legacy_custom_flag_and_raw_strength_order(self):
        sensor='<params id="pressure"><curve>0,0;0.5,0.2;1,1;</curve></params>'
        c=self.brush({'ColorRateUseCurve':'true','ColorRateSensor':sensor})
        fg=c.brushes[0]['descriptor']['mixer']['foreground']
        self.assertAlmostEqual(fg['rate'],.14);self.assertLess(fg['dynamics'][0]['curve']['samples'][128],.21)
        for custom in ['false','true']:
            c=self.brush({'ColorRateUseCurve':'true','ColorRateSensor':'','CustomColorRate':custom,'CurveColorRate':'0,1;1,0;'})
            curve=c.brushes[0]['descriptor']['mixer']['foreground']['dynamics'][0]['curve']
            if custom=='false':self.assertEqual(curve,[[0,0],[1,1]])
            else:self.assertEqual(curve['samples'][0],1);self.assertEqual(curve['samples'][-1],0)

    def test_mean_radius_native_default_version_migration_and_pressure(self):
        for version,expected in [('1',.03),('2',3)]:
            c=self.brush({'SmudgeRateMode':'1','PressureSmudgeRadius':'true','SmudgeRadiusVersion':version,'SmudgeRadiusUseCurve':'false'})
            self.assertAlmostEqual(c.brushes[0]['descriptor']['mixer']['sampling']['radius'],expected)
        c=self.brush({'SmudgeRateMode':'1','PressureSmudgeRadius':'true','SmudgeRadiusValue':'9.23','SmudgeRadiusUseCurve':'true'})
        sample=c.brushes[0]['descriptor']['mixer']['sampling']
        self.assertAlmostEqual(sample['radius'],.0923);self.assertEqual(sample['radiusDynamics'][0]['curve'],[[0,0],[1,1]])
        self.assertAlmostEqual(sample['radius']*.75,.069225)

    def test_additive_and_nonproduct_controls_remain_explicitly_unsupported(self):
        for option in ['ColorRate','SmudgeRadius']:
            extra={'SmudgeRateMode':'1','PressureSmudgeRadius':'true',option+'UseCurve':'true',option+'Sensor':'<params id="ascension"/>'}
            c=self.brush(extra);b=c.brushes[0];m=b['descriptor']['mixer']
            target=m['foreground'] if option=='ColorRate' else m['sampling']
            self.assertNotIn('dynamics' if option=='ColorRate' else 'radiusDynamics',target)
            self.assertTrue(any(n['feature']==option+'SensorCombination' and n['status']=='unsupported' for n in b['compatibility']))
        c=self.brush({'ColorRateUseCurve':'true','ColorRatecurveMode':'1','ColorRateSensor':'<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="declination"/></params>'})
        self.assertNotIn('dynamics',c.brushes[0]['descriptor']['mixer']['foreground'])
        self.assertTrue(any(n['feature']=='ColorRateSensorCombination' and n['status']=='unsupported' for n in c.brushes[0]['compatibility']))

    def test_invalid_raw_rates_reject_instead_of_smuggling_clamp(self):
        for key in ['ColorRateValue','SmudgeRateValue']:
            for value in ['-0.1','1.1','nan','inf','invalid']:
                with self.subTest(key=key,value=value):
                    c=self.brush({key:value});self.assertEqual(c.brushes,[])
                    self.assertTrue(c.skipped)

    def test_portable_foreground_dynamics_validated_before_any_write(self):
        c=self.brush({'SmudgeRateMode':'1','PressureSmudgeRadius':'true','SmudgeRadiusUseCurve':'true','ColorRateUseCurve':'true'})
        with tempfile.TemporaryDirectory() as tmp:
            # Use content-addressed authored bytes, not temporary paths returned
            # by the importer fixture, whose private directory is already gone.
            import hashlib
            raw=bytes(4);sha=hashlib.sha256(raw).hexdigest();aid='asset:'+sha
            d=copy.deepcopy(c.brushes[0]['descriptor']);d['tip'].update(kind='bitmap',mask=aid)
            bundle={'library':{'schemaVersion':1,'brushes':[{**c.brushes[0],'descriptor':d}],'assets':[{'id':aid,'size':2,'file':sha+'.bin'}],'skipped':[]},'assets':{aid:base64.b64encode(raw).decode()}}
            path=Path(tmp)/'test.grafetto-brushes.json';path.write_text(json.dumps(bundle))
            convert.portable_bundle(path,convert.Catalog(Path(tmp)/'valid'))
            mutations=[lambda m:m['foreground'].update(rate=2),lambda m:m['foreground'].update(dynamics=[{}]),lambda m:m['sampling'].update(radiusDynamics=[{}]*5),lambda m:m.update(load=.1),lambda m:m['foreground'].update(dynamics=[{'control':'pressure','minimum':0,'jitter':0,'curve':{'kind':'uniform','samples':[0,2]}}])]
            for index,mutate in enumerate(mutations):
                bad=copy.deepcopy(bundle);mutate(bad['library']['brushes'][0]['descriptor']['mixer']);path.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/str(index))
                with self.assertRaises(ValueError):convert.portable_bundle(path,out)
                self.assertEqual(list(out.output.iterdir()),[])


if __name__=='__main__':unittest.main()
