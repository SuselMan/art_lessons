from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class DeformTests(unittest.TestCase):
    def convert(self,extra='',mode='copy'):
        data=kpp(engine='deformbrush',resources=extra,mode=mode)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_copy_and_native_density(self):
        result=self.convert('<param name="Brush/density">100</param>')
        d=result['descriptor'];self.assertEqual(d['version'],51);self.assertTrue(d['mixer']['smearAlpha']);self.assertEqual(d['deform']['density'],1);self.assertEqual(d['mixer']['source'],'previousCanvas')
    def test_inactive_airbrush_rate_is_ignored(self):
        result=self.convert('<param name="PressureRate">true</param><param name="PaintOpSettings/isAirbrushing">false</param>')
        self.assertTrue(any(n['feature']=='ignoredInactiveRate' for n in result['compatibility']))
        self.assertFalse(any(n['status']=='unsupported' and 'PressureRate' in n['detail'] for n in result['compatibility']))
    def test_normal_and_move(self):
        d=self.convert('<param name="Deform/deformAction">5</param>',mode='normal')['descriptor'];self.assertFalse(d['mixer']['smearAlpha']);self.assertEqual(d['deform']['mode'],5)
    def test_old_data_is_explicit_version145_only(self):
        d=self.convert('<param name="Deform/useOldData">true</param>')['descriptor']
        self.assertEqual(d['version'],145);self.assertEqual(d['deform']['sourcePolicy'],'canonical-begin-v1');self.assertEqual(d['mixer']['source'],'previousCanvas')
        current=self.convert('<param name="Deform/useOldData">false</param>')['descriptor'];self.assertEqual(current['version'],51);self.assertNotIn('sourcePolicy',current['deform'])
    def test_bad_mode_rejected(self):
        with self.assertRaisesRegex(ValueError,'mode'):self.convert('<param name="Deform/deformAction">1.5</param>')
    def test_missing_fields_use_pinned_krita_defaults(self):
        result=self.convert();d=result['descriptor']
        self.assertEqual(d['deform']['amount'],0.2)
        self.assertEqual(d['behavior']['spacing']['coefficient'],0.15)
        self.assertEqual(result['sourceDefaults']['sizePx'],20)
    def test_explicit_deform_fields_override_defaults(self):
        result=self.convert('<param name="Brush/diameter">42</param><param name="Brush/spacing">0.5</param><param name="Deform/deformAmount">0.7</param>');d=result['descriptor']
        self.assertEqual(d['deform']['amount'],0.7)
        self.assertEqual(d['behavior']['spacing']['coefficient'],0.25)
        self.assertEqual(result['sourceDefaults']['sizePx'],42)
