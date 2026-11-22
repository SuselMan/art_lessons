from pathlib import Path
from tempfile import TemporaryDirectory
import io
import unittest
from unittest.mock import patch
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

    def test_root_default_change_preserves_rendering_identity(self):
        from krita_import import numeric
        png=io.BytesIO();Image.new('L',(16,8),128).save(png,format='PNG')
        data=kpp('<Brush type="png_brush" filename="tip.png" scale="0.375" BrushVersion="1"/>')
        def old_scale(value,default=0):
            return numeric(value,default)/2 if value=='0.375' else numeric(value,default)
        with TemporaryDirectory() as tmp:
            current=preset(data,'test.kpp',Catalog(Path(tmp)/'current'),{'tip.png':png.getvalue()})
            with patch('krita_import.numeric',side_effect=old_scale):
                old=preset(data,'test.kpp',Catalog(Path(tmp)/'old'),{'tip.png':png.getvalue()})
        self.assertEqual(current['sourceDefaults']['sizePx'],12)
        self.assertEqual(old['sourceDefaults']['sizePx'],6)
        self.assertEqual(current['descriptor'],old['descriptor'])

    def test_child_absolute_size_changes_parent_identity(self):
        from test_independent_mask190 import native
        from krita_import import numeric
        png=io.BytesIO();Image.new('L',(16,8),128).save(png,format='PNG')
        definition='<Brush type="png_brush" filename="tip.png" scale="0.375" BrushVersion="1"/>'
        params={'MaskingBrush/Preset/brush_definition':definition}
        with TemporaryDirectory() as tmp:
            (Path(tmp)/'current').mkdir();(Path(tmp)/'old').mkdir()
            raw,current=native(Path(tmp)/'current',params,{'tip.png':png.getvalue()})
            self.assertEqual(current.skipped,[])
            # Mimic the old effective scale for the same source bytes, without
            # changing or rehashing the authored KPP.
            def old_scale(value,default=0):
                return numeric(value,default)/2 if value=='0.375' else numeric(value,default)
            with patch('krita_import.numeric',side_effect=old_scale):
                old_raw,old=native(Path(tmp)/'old',params,{'tip.png':png.getvalue()})
            self.assertEqual(raw,old_raw)
            self.assertEqual(old.skipped,[])
            now=current.brushes[0]['descriptor'];before=old.brushes[0]['descriptor']
            self.assertEqual(now['behavior']['dual']['sizePolicy']['diameter'],12)
            self.assertEqual(before['behavior']['dual']['sizePolicy']['diameter'],6)
            self.assertNotEqual(now['id'],before['id'])
