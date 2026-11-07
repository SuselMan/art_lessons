"""Source settings preserve procedural masks; no commercial/vendor pixels."""
import copy
from pathlib import Path
import tempfile
import unittest
import convert
from test_krita_size_strength import authored

class ProceduralTests(unittest.TestCase):
    def brush(self,shape='circle',extra=None,generator=None,definition=None):
        params=extra or {}
        g={'type':shape,'id':'default','ratio':'.2','diameter':'48','hfade':'1','vfade':'.3','antialiasEdges':'1','spikes':'2',**(generator or {})}
        attrs={'type':'auto_brush','randomness':'0','density':'1',**(definition or {})}
        params={**params,'brush_definition':'<Brush '+' '.join(k+'="'+v+'"'for k,v in attrs.items())+'><MaskGenerator '+' '.join(k+'="'+v+'"'for k,v in g.items())+'/></Brush>'}
        with tempfile.TemporaryDirectory()as tmp:
            path=Path(tmp)/'Authored.kpp';path.write_bytes(authored(params));c=convert.Catalog(Path(tmp)/'out');from krita_import import convert_krita
            convert_krita(path,c);self.assertEqual(c.skipped,[]);return c.brushes[0],c.assets
    def test_unequal_fades_aa_axes_and_current_size_are_preserved_without_assets(self):
        for shape,mapped in [('circle','ellipse'),('rect','rectangle')]:
            b,assets=self.brush(shape);tip=b['descriptor']['tip']
            self.assertEqual(tip['kind'],'procedural');self.assertEqual(tip['aspect'],5)
            self.assertEqual(tip['profile'],{'kind':'standard','shape':mapped,'horizontalFade':1,'verticalFade':.3,'antialias':True});self.assertEqual(assets,{})
            self.assertEqual(b['sourceDefaults']['sizePx'],48)
    def test_zero_and_hard_fades_are_not_replaced_by_mean_hardness(self):
        b,_=self.brush('rect',generator={'hfade':'0','vfade':'1','antialiasEdges':'0'})
        self.assertEqual(b['descriptor']['tip']['profile']['horizontalFade'],0);self.assertFalse(b['descriptor']['tip']['profile']['antialias'])
    def test_excluded_density_randomness_spikes_and_softness_remain_explicit(self):
        for kw in [dict(definition={'density':'.8'}),dict(definition={'randomness':'.2'})]:
            b,_=self.brush('rect',**kw);self.assertNotIn('profile',b['descriptor']['tip'])
            self.assertTrue(any(c['feature']=='standardMaskProfile'and c['status']=='unsupported'for c in b['compatibility']))
    def test_standard_softness_constant_pressure_and_combined_controls(self):
        for shape in ['circle','rect']:
            for extra in [
                {'SoftnessUseCurve':'false','SoftnessValue':'.2'},
                {'SoftnessUseCurve':'true','SoftnessValue':'.5'},
                {'SoftnessUseCurve':'true','SoftnessValue':'.5','SoftnesscurveMode':'1','SoftnessSensor':'<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="declination"/></params>'},
            ]:
                b,assets=self.brush(shape,extra={'PressureSoftness':'true',**extra});d=b['descriptor']
                self.assertEqual(d['tip']['profile']['kind'],'standard');self.assertEqual(d['behavior']['softness'],float(extra['SoftnessValue']))
                self.assertGreaterEqual(d['version'],64);self.assertEqual(assets,{})
                self.assertFalse(any(n['status']=='unsupported'for n in b['compatibility']))
                convert.validate_portable_profile(d)
                if extra['SoftnessUseCurve']=='true':self.assertIn('softness',d['behavior']['modulations'])
                else:self.assertNotIn('softness',d['behavior'].get('modulations',{}))
    def test_softness_unsupported_sensor_does_not_become_constant(self):
        b,_=self.brush(extra={'PressureSoftness':'true','SoftnessUseCurve':'true','SoftnessSensor':'<params id="rotation"/>'})
        self.assertNotIn('softness',b['descriptor']['behavior']);self.assertNotIn('profile',b['descriptor']['tip'])
        self.assertTrue(any(n['status']=='unsupported'for n in b['compatibility']))
    def test_checked_unit_constant_softness_and_unchecked_stale_values(self):
        for params in [{'PressureSoftness':'false','SoftnessValue':'.2'},{'PressureSoftness':'true','SoftnessUseCurve':'false','SoftnessValue':'1'}]:
            b,_=self.brush(extra=params);self.assertEqual(b['descriptor']['tip']['profile']['kind'],'standard')
    def test_portable_boundary_rejects_partial_or_mixed_material_profiles(self):
        b,_=self.brush();d=b['descriptor'];convert.validate_portable_profile(d)
        for mutate in [lambda t:t.pop('profile'),lambda t:t['profile'].pop('verticalFade'),lambda t:t.update(mask='asset:'+'a'*64),lambda t:t['profile'].update(horizontalFade=float('nan')),lambda t:t['profile'].update(unknown=True)]:
            bad=copy.deepcopy(d);mutate(bad['tip'])
            with self.assertRaises(ValueError):convert.validate_portable_profile(bad)
        d['model']='mixer';convert.validate_portable_profile(d)
        d['tip']={'kind':'procedural','aspect':1,'profile':{'kind':'gaussian','fade':.5,'antialias':True}}
        with self.assertRaises(ValueError):convert.validate_portable_profile(d)


    def test_spikes_keep_square_allocation_and_source_ratio(self):
        for shape in ['circle','rect']:
            for n in [3,4,5,20]:
                b,_=self.brush(shape,generator={'spikes':str(n)});d=b['descriptor']
                self.assertEqual(d['tip']['autoShape'],{'version':1,'spikes':n});self.assertEqual(d['tip']['aspect'],5)
                self.assertEqual(d['tip']['profile']['kind'],'standard');self.assertGreaterEqual(d['version'],71);convert.validate_portable_profile(d)
                self.assertFalse(any(x['status']=='unsupported'for x in b['compatibility']))
        b,_=self.brush(generator={'spikes':'21'});self.assertNotIn('autoShape',b['descriptor']['tip'])
        self.assertTrue(any(x['status']=='unsupported'for x in b['compatibility']))
    def test_gaussian_spikes_anisotropy_and_native_softness_noop(self):
        b,_=self.brush(generator={'id':'gauss','spikes':'5'},extra={'PressureSoftness':'true','SoftnessValue':'.2'})
        d=b['descriptor'];self.assertEqual(d['tip']['profile']['kind'],'gaussian');self.assertEqual(d['tip']['autoShape']['spikes'],5)
        self.assertNotIn('softness',d['behavior']);convert.validate_portable_profile(d)
        self.assertFalse(any(x['status']=='unsupported'for x in b['compatibility']))
