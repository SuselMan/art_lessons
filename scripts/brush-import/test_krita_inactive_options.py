"""Saved option switches do not imply execution of a disabled parent feature."""
from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset

class InactiveOptionsTests(unittest.TestCase):
    def test_disabled_texture_strength_does_not_claim_missing_dynamics(self):
        for enabled in ('false',''):
            with tempfile.TemporaryDirectory()as directory:
                xml='<param name="PressureTexture/Strength/">true</param>'
                if enabled:xml+='<param name="Texture/Pattern/Enabled">'+enabled+'</param>'
                result=preset(kpp(resources=xml),'disabled-texture.kpp',Catalog(Path(directory)),{})
                self.assertNotIn('texture',result['descriptor'])
                self.assertFalse(any(n['feature']=='activeDynamics'and'PressureTexture/Strength/'in n['detail']for n in result['compatibility']))
    def test_active_texture_is_not_silently_discarded(self):
        with tempfile.TemporaryDirectory()as directory:
            xml='<param name="PressureTexture/Strength/">true</param><param name="Texture/Pattern/Enabled">true</param><param name="Texture/Pattern/PatternFileName">missing.pat</param>'
            with self.assertRaisesRegex(ValueError,'Missing Krita resource'):
                preset(kpp(resources=xml),'active-texture.kpp',Catalog(Path(directory)),{})
