"""Regression #872: legacy Krita 2.2 "radius" auto-brush generator attribute.

The pinned KisAutoBrushFactory::loadBrush reads the mask generator "radius"
attribute AS the generator diameter ("backward compatibility -- it was
mistakenly named radius for 2.2") and gives it priority over "diameter".
The importer used to read "diameter" only, so a legacy bundle silently fell
back to the 1.0 default. These cases pin the native precedence for the main
brush and for the masking (child) brush.
"""
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, PngImagePlugin
import convert
import krita_sketch
from krita_import import convert_krita


def kpp(definition, resources=''):
    preset=(f'<Preset name="QA Radius" paintopid="paintbrush">'
            f'<param name="brush_definition"><![CDATA[{definition}]]></param>{resources}</Preset>')
    meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',preset,zip=True)
    out=io.BytesIO();Image.new('RGB',(2,2),'red').save(out,format='PNG',pnginfo=meta)
    return out.getvalue()


def imported(tmp, definition, resources=''):
    path=Path(tmp)/'radius.kpp'
    path.write_bytes(kpp(definition,resources))
    catalog=convert.Catalog(Path(tmp)/'out')
    convert_krita(path,catalog)
    if catalog.skipped:
        raise AssertionError(catalog.skipped)
    return catalog.brushes[0]


def generator(**attributes):
    attributes.setdefault('type','circle')
    attributes.setdefault('ratio','1')
    attributes.setdefault('hfade','1')
    attributes.setdefault('vfade','1')
    rendered=''.join(f' {key}="{value}"' for key,value in attributes.items())
    return f'<Brush type="auto_brush" spacing="0.2" angle="0"><MaskGenerator{rendered}/></Brush>'


class LegacyRadius872Tests(unittest.TestCase):
    def test_radius_only_is_read_as_the_generator_diameter(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=imported(tmp,generator(radius='30'))
            self.assertEqual(brush['sourceDefaults']['sizePx'],30)

    def test_legacy_radius_wins_over_diameter(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=imported(tmp,generator(radius='30',diameter='10'))
            self.assertEqual(brush['sourceDefaults']['sizePx'],30)

    def test_diameter_only_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=imported(tmp,generator(diameter='10'))
            self.assertEqual(brush['sourceDefaults']['sizePx'],10)

    def test_legacy_radius_is_reported_and_absent_for_plain_diameter(self):
        with tempfile.TemporaryDirectory() as tmp:
            legacy=imported(tmp,generator(radius='30'))
            plain=imported(tmp,generator(diameter='10'))
            self.assertTrue(any(note['feature']=='legacyRadius' for note in legacy['compatibility']))
            self.assertFalse(any(note['feature']=='legacyRadius' for note in plain['compatibility']))

    def masking_brush(self, tmp, child_attributes):
        """Import a dual brush whose masking component carries child_attributes.

        The masking component is a full brush of its own, so its generator
        goes through the same KisAutoBrushFactory rule: a legacy "radius" is
        the generator diameter and wins over "diameter". With
        UseMasterSize=false the child keeps its own absolute diameter, which
        the importer carries in dual.sizePolicy.
        """
        resources=('<param name="MaskingBrush/Enabled">true</param>'
                   '<param name="MaskingBrush/UseMasterSize">false</param>'
                   '<param name="MaskingBrush/Preset/brush_definition"><![CDATA['
                   +generator(**child_attributes)+']]></param>')
        return imported(tmp,generator(diameter='20'),resources)

    def test_masking_brush_child_reads_the_legacy_radius(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=self.masking_brush(tmp,{'radius':'30'})
            dual=brush['descriptor']['behavior']['dual']
            self.assertEqual(dual['sizePolicy'],{'kind':'resource','diameter':30})
            self.assertTrue(any(note['feature']=='masking.legacyRadius' for note in brush['compatibility']))

    def test_masking_brush_child_diameter_only_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=self.masking_brush(tmp,{'diameter':'10'})
            dual=brush['descriptor']['behavior']['dual']
            self.assertEqual(dual['sizePolicy'],{'kind':'resource','diameter':10})
            self.assertFalse(any(note['feature']=='masking.legacyRadius' for note in brush['compatibility']))

    def gauss_generator(self, **attributes):
        """A gauss generator that reaches the static gaussian mask branch.

        The procedural gaussian path wins whenever the fade is representable;
        an unparsable fade keeps the bitmap branch -- the one that samples the
        generator diameter -- in play.
        """
        attributes.setdefault('id','gauss')
        attributes.setdefault('hfade','x')
        return generator(**attributes)

    def test_gauss_generator_reads_the_legacy_radius(self):
        with tempfile.TemporaryDirectory() as tmp:
            legacy=imported(tmp,self.gauss_generator(radius='30'))
            plain=imported(tmp,self.gauss_generator(diameter='30'))
            self.assertEqual(legacy['descriptor']['tip']['kind'],'bitmap')
            self.assertEqual(legacy['descriptor']['tip']['mask'],plain['descriptor']['tip']['mask'])
            self.assertEqual(legacy['sourceDefaults']['sizePx'],30)

    def test_gauss_legacy_radius_wins_over_diameter(self):
        with tempfile.TemporaryDirectory() as tmp:
            both=imported(tmp,self.gauss_generator(radius='30',diameter='10'))
            radius_only=imported(tmp,self.gauss_generator(radius='30'))
            diameter_only=imported(tmp,self.gauss_generator(diameter='10'))
            # The static gauss mask is diameter independent, so the priority is
            # pinned on the generator diameter the brush actually applies.
            self.assertEqual(both['sourceDefaults']['sizePx'],30)
            self.assertEqual(radius_only['sourceDefaults']['sizePx'],30)
            self.assertEqual(diameter_only['sourceDefaults']['sizePx'],10)

    def test_unparsable_legacy_radius_reads_as_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=imported(tmp,generator(radius='abc'))
            self.assertEqual(brush['sourceDefaults']['sizePx'],0.01)

    def sketch_kpp(self, definition):
        preset=('<Preset name="QA Radius Sketch" paintopid="sketchbrush">'
                '<param name="brush_definition"><![CDATA['+definition+']]></param></Preset>')
        meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',preset,zip=True)
        out=io.BytesIO();Image.new('RGB',(2,2),'red').save(out,format='PNG',pnginfo=meta)
        return out.getvalue()

    def sketch_import(self, tmp, **attributes):
        """Import through the Sketch adapter, where the closed scope applies."""
        rendered=''.join(' '+key+'="'+value+'"' for key,value in attributes.items())
        definition=('<Brush type="auto_brush" density="1" randomness="0"><MaskGenerator id="default"'
                    ' type="circle" ratio="1" hfade="1" vfade="1" spikes="2"'+rendered+'/></Brush>')
        raw=self.sketch_kpp(definition)
        image=Image.open(io.BytesIO(raw));root=ET.fromstring(image.info['preset'])
        params={node.get('name'):node.text for node in root.findall('param')}
        catalog=convert.Catalog(Path(tmp)/'sketchout')
        return krita_sketch.sketch_preset(raw,root,params,'sketch.kpp',catalog,{},lambda name: None)

    def test_sketch_scope_accepts_a_bounded_legacy_radius(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=self.sketch_import(tmp,radius='30')
            self.assertEqual(brush['sourceDefaults']['sizePx'],30)
            self.assertTrue(any(note['feature']=='legacyRadius' for note in brush['compatibility']))

    def test_sketch_scope_accepts_the_closed_range_boundaries(self):
        for radius in ('0.01','256'):
            with tempfile.TemporaryDirectory() as tmp, self.subTest(radius=radius):
                brush=self.sketch_import(tmp,radius=radius)
                self.assertEqual(brush['sourceDefaults']['sizePx'],float(radius))

    def test_sketch_scope_reads_a_plain_diameter_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            brush=self.sketch_import(tmp,diameter='10')
            self.assertEqual(brush['sourceDefaults']['sizePx'],10)
            self.assertFalse(any(note['feature']=='legacyRadius' for note in brush['compatibility']))

    def test_sketch_scope_rejects_a_legacy_radius_outside_the_bounds(self):
        for attributes in({'radius':'300'},{'radius':'0'},{'radius':''},{'radius':'abc'}):
            with tempfile.TemporaryDirectory() as tmp, self.subTest(attributes=attributes), self.assertRaises(ValueError):
                self.sketch_import(tmp,**attributes)


if __name__=='__main__':
    unittest.main()
