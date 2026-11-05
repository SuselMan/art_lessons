import base64
import io
import unittest
from PIL import Image, PngImagePlugin
from krita_import import preset_preview


class PreviewTests(unittest.TestCase):
    def test_preserves_artwork_aspect_and_strips_embedded_preset(self):
        source = Image.new('RGBA', (256, 128), (30, 70, 120, 255))
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text('preset', '<Preset>large private resources</Preset>')
        raw = io.BytesIO()
        source.save(raw, format='PNG', pnginfo=metadata)
        image = Image.open(io.BytesIO(raw.getvalue()))
        image.load()
        data = base64.b64decode(preset_preview(image).split(',', 1)[1])
        result = Image.open(io.BytesIO(data))
        self.assertEqual(result.size, (64, 32))
        self.assertEqual(result.getpixel((0, 0)), (30, 70, 120, 255))
        self.assertNotIn('preset', result.info)
