from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class CloneTests(unittest.TestCase):
    def convert(self,extra='',mode='normal'):
        with tempfile.TemporaryDirectory()as d:return preset(kpp(engine='duplicate',mode=mode,resources=extra),'clone.kpp',Catalog(Path(d)),{})
    def test_mask_and_modes(self):
        a=self.convert()['descriptor'];self.assertEqual(a['clone'],{'version':1,'moveSourcePoint':True});self.assertEqual(a['model'],'stamp');self.assertNotIn('mixer',a);self.assertEqual(a['version'],54)
        b=self.convert('<param name="Duplicateop/MoveSourcePoint">false</param>')['descriptor'];self.assertFalse(b['clone']['moveSourcePoint'])
    def test_rejections(self):
        for key in ('EraserMode','PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing'):
            with self.assertRaises(ValueError):self.convert('<param name="'+key+'">true</param>')
        with self.assertRaisesRegex(ValueError,'OVER'):self.convert(mode='multiply')

    def test_pinned_native_perspective_flag_is_ignored_without_changing_three_clone_laws(self):
        for extra,version in [('',54),('<param name="Duplicateop/CloneFromProjection">true</param>',149),('<param name="Duplicateop/Healing">true</param>',152)]:
            pair=[self.convert(extra+'<param name="Duplicateop/CorrectPerspective">'+str(flag).lower()+'</param>')for flag in(False,True)]
            a,b=[x['descriptor']for x in pair];self.assertEqual(a['version'],version);self.assertEqual(b['version'],version)
            self.assertNotEqual(a['id'],b['id']) # Original native bytes/settings identity retained.
            self.assertEqual({k:v for k,v in a.items()if k!='id'},{k:v for k,v in b.items()if k!='id'})
            self.assertFalse(any(n['feature']=='nativeIgnored.cloneCorrectPerspective'for n in pair[0]['compatibility']))
            self.assertTrue(any(n['feature']=='nativeIgnored.cloneCorrectPerspective'and n['status']=='supported'for n in pair[1]['compatibility']))
