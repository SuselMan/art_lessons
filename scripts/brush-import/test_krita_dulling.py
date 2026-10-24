"""Small authored KPP settings: no native artwork or native execution."""
from pathlib import Path
import tempfile
import unittest
import convert
from krita_import import convert_krita
from test_krita import kpp

class DullingImportTests(unittest.TestCase):
    def brush(self,extra):
        params={'SmudgeRateMode':'1','PressureColorRate':'false','ColorRateValue':'.5','PressureSmudgeRadius':'true','SmudgeRadiusUseCurve':'false','SmudgeRadiusValue':'.41',**extra}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'mean.kpp';path.write_bytes(kpp(engine='colorsmudge',resources=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in params.items())))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c);self.assertEqual(c.skipped,[]);return c.brushes[0]
    def test_legacy_percent_migration_and_pure_guards(self):
        b=self.brush({});m=b['descriptor']['mixer']
        self.assertEqual(m['source'],'previousCanvas');self.assertEqual(m['sampling']['mode'],'uniformMean');self.assertAlmostEqual(m['sampling']['radius'],.0041)
        self.assertEqual((m['load'],m['initialLoad']),(0,0))
        self.assertTrue(any('fixed64' in n['detail'] and '512px' in n['detail'] for n in b['compatibility']))
        self.assertEqual(self.brush({'SmudgeRadiusValue':'.5'})['descriptor']['mixer']['sampling']['radius'],.005)
    def test_new_radius_version_disabled_and_clamp(self):
        self.assertEqual(self.brush({'SmudgeRadiusVersion':'2'})['descriptor']['mixer']['sampling']['radius'],.41)
        self.assertEqual(self.brush({'PressureSmudgeRadius':'false'})['descriptor']['mixer']['sampling']['radius'],0)
        self.assertEqual(self.brush({'SmudgeRadiusVersion':'2','SmudgeRadiusValue':'9'})['descriptor']['mixer']['sampling']['radius'],3)
    def test_foreground_newengine_and_dynamic_radius_honest_limits(self):
        for extra in [{'PressureColorRate':'true'},{'SmudgeRateUseNewEngine':'true'}]:
            self.assertNotIn('source',self.brush(extra)['descriptor']['mixer'])
        b=self.brush({'SmudgeRadiusUseCurve':'true','SmudgeRadiusSensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})
        self.assertTrue(any(n['feature']=='SmudgeRadiusCurve' and n['status']=='unsupported' for n in b['compatibility']))
    def test_spatial_mode_does_not_accidentally_gain_mean(self):
        m=self.brush({'SmudgeRateMode':'0'})['descriptor']['mixer']
        self.assertEqual(m['source'],'previousCanvas');self.assertNotIn('sampling',m)

if __name__=='__main__':unittest.main()
