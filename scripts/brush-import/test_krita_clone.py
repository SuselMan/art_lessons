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
        for key in ('Duplicateop/Healing','Duplicateop/CorrectPerspective','Duplicateop/CloneFromProjection'):
            with self.assertRaisesRegex(ValueError,'Unsupported Clone'):self.convert('<param name="'+key+'">true</param>')
        with self.assertRaisesRegex(ValueError,'OVER'):self.convert(mode='multiply')
