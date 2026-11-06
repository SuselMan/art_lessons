from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
class MirrorTests(unittest.TestCase):
    def brush(self,extra):
        with tempfile.TemporaryDirectory()as d:
            s=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in extra.items())
            return preset(kpp(resources=s),'mirror.kpp',Catalog(Path(d)),{})
    def test_checked_axes_pressure_and_constant(self):
        b=self.brush({'PressureMirror':'true','HorizontalMirrorEnabled':'true','VerticalMirrorEnabled':'true'})
        m=b['descriptor']['behavior']['mirror'];self.assertTrue(m['horizontal']);self.assertTrue(m['vertical']);self.assertEqual(m['dynamics'][0]['control'],'pressure')
        self.assertFalse(any(n['feature']=='activeDynamics'and'PressureMirror'in n['detail']for n in b['compatibility']))
        c=self.brush({'PressureMirror':'true','HorizontalMirrorEnabled':'true','MirrorUseCurve':'false','MirrorValue':'.5'})['descriptor']['behavior']['mirror'];self.assertNotIn('dynamics',c);self.assertEqual(c['value'],.5)
    def test_disabled_feature_never_uses_stale_sensor(self):
        for p in [{'PressureMirror':'false','HorizontalMirrorEnabled':'true'},{'PressureMirror':'true','HorizontalMirrorEnabled':'false','VerticalMirrorEnabled':'false'}]:
            b=self.brush(p);self.assertNotIn('mirror',b['descriptor']['behavior']);self.assertFalse(any(n['feature']=='activeDynamics'and'PressureMirror'in n['detail']for n in b['compatibility']))
    def test_keyed_random_has_mirror_option_key(self):
        m=self.brush({'PressureMirror':'true','HorizontalMirrorEnabled':'true','MirrorSensor':'<params id="fuzzystroke"/>'})['descriptor']['behavior']['mirror'];self.assertEqual(m['dynamics'][0]['randomSource']['key'],'MirrorFuzzyStroke')
