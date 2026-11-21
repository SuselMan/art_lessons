"""Self-authored Pixel Mix fixture and portable-boundary regression."""
import copy,tempfile,unittest
from pathlib import Path
from brush_contract import Catalog
from krita_import import preset
from test_krita import kpp
from convert import validate_portable_profile

class PixelColorMix197(unittest.TestCase):
    def test_plain_wash_pressure_captures_mix_and_rejects_other_roles(self):
        xml='<param name="PaintOpAction">2</param><param name="ColorSource/Type">plain</param><param name="PressureMix">true</param><param name="MixValue">.8</param><param name="MixUseCurve">true</param><param name="MixSensor"><![CDATA[<params id="pressure"><curve>0,0;1,1;</curve></params>]]></param>'
        with tempfile.TemporaryDirectory() as tmp:
            row=preset(kpp(resources=xml),'authored.kpp',Catalog(Path(tmp)),{})
            d=row['descriptor'];self.assertEqual(d['version'],197);self.assertEqual(d['behavior']['colorMix']['value'],.8)
            self.assertFalse(any(n['feature']=='activeDynamics' and 'PressureMix' in n['detail'] for n in row['compatibility']))
            validate_portable_profile(d)
            for change in (lambda x:x.update(version=74),lambda x:x.update(texture={}),lambda x:x['behavior'].update(dual={}),lambda x:x['behavior']['colorMix'].update(value=2)):
                bad=copy.deepcopy(d);change(bad)
                with self.assertRaises(ValueError):validate_portable_profile(bad)
    def test_non_pressure_sensor_remains_unsupported(self):
        xml='<param name="PaintOpAction">2</param><param name="PressureMix">true</param><param name="MixSensor"><![CDATA[<params id="fuzzy"/>]]></param>'
        with tempfile.TemporaryDirectory() as tmp:
            row=preset(kpp(resources=xml),'authored.kpp',Catalog(Path(tmp)),{})
            self.assertNotIn('colorMix',row['descriptor']['behavior'])
            self.assertTrue(any(n['feature']=='activeDynamics' and 'PressureMix' in n['detail'] for n in row['compatibility']))
