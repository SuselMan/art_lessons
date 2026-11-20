"""Authored settings only; round-marker is never selected by preset name."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image, PngImagePlugin
import convert
from krita_import import convert_krita


def authored(params=None, name='Independent marker'):
    values={'CompositeOp':'normal','diameter':'40','spacing':'.1','useAutoSpacing':'false',
            'autoSpacingCoeff':'1','FlowValue':'1','OpacityValue':'1',
            'PressureSize':'false','PressureSpacing':'false','SizeValue':'1',
            'SizeUseCurve':'true','SizeSensor':'<params id="pressure"/>',
            'SizeUseSameCurve':'true','SizecurveMode':'0','Spacing/Isotropic':'false',
            'SpacingValue':'1','SpacingUseCurve':'true','SpacingUseSameCurve':'true',
            'SpacingSensor':'<params id="pressure"/>','SpacingcurveMode':'0',
            'PaintOpSettings/updateSpacingBetweenDabs':'false','paintop':'roundmarker',
            'EraserMode':'false', **(params or {})}
    body=''.join('<param name="'+key+'"><![CDATA['+value+']]></param>' for key,value in values.items() if value is not None)
    xml='<Preset name="'+name+'" paintopid="roundmarker">'+body+'</Preset>'
    meta=PngImagePlugin.PngInfo();meta.add_text('preset',xml)
    result=io.BytesIO();Image.new('L',(2,2)).save(result,format='PNG',pnginfo=meta)
    return result.getvalue()


class RoundMarkerTests(unittest.TestCase):
    def read(self, params=None, fail=False):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'Authored.kpp';path.write_bytes(authored(params))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
            if fail:
                self.assertEqual(catalog.brushes,[]);self.assertTrue(catalog.skipped)
                return catalog.skipped[0]['reasons'][0]
            self.assertEqual(catalog.skipped,[]);self.assertEqual(catalog.assets,{})
            return catalog.brushes[0]

    def test_basic_fields_version_identity_and_no_thumbnail_mask(self):
        brush=self.read();d=brush['descriptor']
        self.assertEqual(d['version'],28)
        self.assertEqual(d['tip']['profile'],{'kind':'circleBand','antialias':True})
        self.assertEqual((d['tip']['kind'],d['tip']['aspect'],d['model']),('procedural',1,'stamp'))
        self.assertEqual(d['behavior']['rendering']['accumulation'],'maxAlpha')
        self.assertEqual(d['behavior']['spacing'],{'mode':'diameter','coefficient':.1,'isotropic':True})
        self.assertEqual(brush['sourceDefaults'],{'sizePx':40,'opacity':1,'flow':1})
        self.assertNotIn('mask',d['tip']);convert.validate_portable_profile(d)
        self.assertEqual(d['id'],self.read()['descriptor']['id'])
        self.assertNotEqual(d['id'],self.read({'OpacityValue':'.4'})['descriptor']['id'])

    def test_native_defaults_and_global_opacity_are_not_baked_into_coverage_twice(self):
        brush=self.read({'diameter':None,'spacing':None,'OpacityValue':'.35'})
        d=brush['descriptor']
        self.assertEqual(brush['sourceDefaults'],{'sizePx':30,'opacity':.35,'flow':1})
        self.assertEqual(d['opacity'],.35)
        self.assertEqual(d['opacityByPressure'],[[0,1],[1,1]])
        self.assertEqual(d['flowByPressure'],[[0,1],[1,1]])
        self.assertEqual(d['behavior']['spacing']['coefficient'],.02)

    def test_auto_and_zero_spacing_and_unchecked_stale_size(self):
        self.assertEqual(self.read({'useAutoSpacing':'true','autoSpacingCoeff':'.8'})['descriptor']['behavior']['spacing']['mode'],'kritaAuto')
        zero=self.read({'useAutoSpacing':'true','autoSpacingCoeff':'0'})['descriptor']['behavior']['spacing']
        self.assertEqual((zero['mode'],zero['coefficient']),('diameter',0))
        stale=self.read({'SizeValue':'.2','SizeSensor':'not XML','SpacingValue':'.3'})['descriptor']
        self.assertEqual(stale['sizeByPressure'],[[0,1],[1,1]])
        self.assertEqual(stale['behavior']['spacing']['coefficient'],.1)

    def test_active_unsupported_settings_and_nonfinite_values_fail_explicitly(self):
        for params,key in [({'PressureSize':'true'},'PressureSize'),({'PressureSpacing':'true'},'PressureSpacing'),
                           ({'PressureOpacity':'true'},'PressureOpacity'),({'PressureFlow':'true'},'PressureFlow'),
                           ({'PressureRotation':'true'},'PressureRotation'),({'Texture/Pattern/Enabled':'true'},'Texture/Pattern/Enabled'),
                           ({'MaskingBrush/Enabled':'true'},'MaskingBrush/Enabled'),({'FlowValue':'.5'},'flow'),
                           ({'CompositeOp':'multiply'},'compositing'),({'EraserMode':'true'},'compositing'),
                           ({'diameter':'NaN'},'diameter'),({'spacing':'Infinity'},'spacing'),
                           ({'OpacityValue':'1.1'},'OpacityValue'),({'diameter':'0'},'diameter'),
                           ({'useAutoSpacing':'true','autoSpacingCoeff':'.0001'},'auto-spacing')]:
            with self.subTest(params=params):self.assertIn(key,self.read(params,True))

    def test_portable_profile_gate_and_atomic_rejection(self):
        brush=self.read();descriptor=brush['descriptor']
        mutations=[lambda d:d['tip']['profile'].update(antialias=False),lambda d:d['tip']['profile'].update(extra=1),
                   lambda d:d.update(model='mixer'),lambda d:d.update(flow=.5),lambda d:d.update(flow=True),
                   lambda d:d.update(paperInteraction=.1),lambda d:d['tip'].update(aspect=2),
                   lambda d:d.update(texture={'id':'cloud'}),lambda d:d['behavior'].update(dual={}),
                   lambda d:d['behavior'].update(taper={}),lambda d:d['behavior'].update(dynamics={'opacity':{}}),
                   lambda d:d['behavior'].update(modulations={'roundness':[]}),
                   lambda d:d['behavior'].update(rotation={'projection':True}),
                   lambda d:d['opacityByPressure'].__setitem__(1,[1,.5]),
                   lambda d:d['tip'].pop('profile'),lambda d:d['behavior']['rendering'].pop('accumulation')]
        for mutate in mutations:
            with self.subTest(mutate=mutate),tempfile.TemporaryDirectory() as tmp:
                bad=copy.deepcopy(brush);mutate(bad['descriptor'])
                with self.assertRaises(ValueError):convert.validate_portable_profile(bad['descriptor'])
                path=Path(tmp)/'test.grafetto-brushes.json'
                path.write_text(json.dumps({'library':{'schemaVersion':1,'brushes':[brush,bad],'assets':[],'skipped':[]},'assets':{}}))
                catalog=convert.Catalog(Path(tmp)/'out')
                with self.assertRaises(ValueError):convert.portable_bundle(path,catalog)
                self.assertEqual(catalog.brushes,[]);self.assertEqual(list(catalog.output.iterdir()),[])
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.grafetto-brushes.json'
            path.write_text(json.dumps({'library':{'schemaVersion':1,'brushes':[brush],'assets':[],'skipped':[]},'assets':{}}))
            catalog=convert.Catalog(Path(tmp)/'out');convert.portable_bundle(path,catalog)
            self.assertEqual(catalog.brushes,[brush])


if __name__=='__main__':unittest.main()
