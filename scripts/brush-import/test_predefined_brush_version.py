from pathlib import Path
from tempfile import TemporaryDirectory
import io
import unittest
from PIL import Image
from brush_contract import Catalog
from krita_import import preset
from test_krita import kpp


class PredefinedBrushVersionTests(unittest.TestCase):
    def test_png_version_scales_new_import_source_size(self):
        png=io.BytesIO();Image.new('L',(8,4),128).save(png,format='PNG')
        with TemporaryDirectory() as tmp:
            for attrs,expected in [('',16),(' BrushVersion="1"',16),(' BrushVersion="2"',8),(' BrushVersion="3"',8),(' BrushVersion="1" scale=".5"',8),(' BrushVersion="2" scale=".5"',4)]:
                with self.subTest(attrs=attrs):
                    data=kpp('<Brush type="png_brush" filename="tip.png"'+attrs+'/>')
                    result=preset(data,'test.kpp',Catalog(Path(tmp)/str(len(attrs))),{'tip.png':png.getvalue()})
                    self.assertEqual(result['sourceDefaults']['sizePx'],expected)

    def test_auto_generator_is_not_predefined(self):
        with TemporaryDirectory() as tmp:
            data=kpp('<Brush type="auto_brush" BrushVersion="1"><MaskGenerator diameter="8" type="circle" id="default" ratio="1" hfade="1" vfade="1"/></Brush>')
            result=preset(data,'auto.kpp',Catalog(Path(tmp)),{})
            self.assertEqual(result['sourceDefaults']['sizePx'],8)
