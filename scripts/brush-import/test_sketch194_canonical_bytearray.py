"""Canonical QByteArray Sketch controls survive the private 194 bridge."""
import base64
import copy
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from PIL import Image
from brush_contract import Catalog, finalize_identity
from krita_import import convert_krita
from native_mask190 import png_preset
from test_sketch_spray194 import native194


def fixture(option, key, value, typed, checked='true'):
    params={'Pressure'+option:checked, option+'UseCurve':'true',
            option+'Value':'0.5',option+'Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'}
    params[key]=value
    source=native194('sketchbrush',params=params)
    root=ET.fromstring(Image.open(io.BytesIO(source)).text['preset'])
    if typed:
        node=next(p for p in root.findall('param') if p.get('name')==key)
        node.set('type','bytearray')
        node.text=base64.b64encode(value.encode()).decode()
    return png_preset(root)


def import_one(path, root):
    catalog=Catalog(root)
    convert_krita(path,catalog)
    return catalog


class Sketch194CanonicalBytearrayTests(unittest.TestCase):
    def test_canonical_typed_matches_untyped_public_kpp(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for option in ('Offset scale','Line width'):
                for key in ('Pressure'+option,option+'UseCurve'):
                    for value in ('true','false','1','0'):
                        with self.subTest(option=option,key=key,value=value):
                            descriptors=[]
                            for typed in (False,True):
                                p=root/('typed.kpp' if typed else 'plain.kpp')
                                p.write_bytes(fixture(option,key,value,typed))
                                c=import_one(p,root/('out-typed' if typed else 'out-plain'))
                                self.assertEqual(c.skipped,[])
                                self.assertEqual(len(c.brushes),1)
                                d=dict(c.brushes[0]['descriptor'])
                                self.assertEqual(d['version'],194)
                                self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),p.read_bytes())['id'])
                                d.pop('id')
                                descriptors.append(d)
                            self.assertEqual(*descriptors)

    def test_typed_curve_is_inert_when_option_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for option in ('Offset scale','Line width'):
                for value in ('true','false'):
                    with self.subTest(option=option,value=value):
                        descriptors=[]
                        for typed in (False,True):
                            p=root/('typed.kpp' if typed else 'plain.kpp')
                            p.write_bytes(fixture(option,option+'UseCurve',value,typed,checked='false'))
                            c=import_one(p,root/('typed' if typed else 'plain'))
                            self.assertEqual(c.skipped,[])
                            d=dict(c.brushes[0]['descriptor']);d.pop('id')
                            descriptors.append(d)
                        self.assertEqual(*descriptors)

    def test_bundle_keeps_neighbour_and_noncanonical_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'bundle.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for index,(option,key,value) in enumerate((
                    ('Offset scale','PressureOffset scale','true'),
                    ('Offset scale','Offset scaleUseCurve','false'),
                    ('Line width','PressureLine width','false'),
                    ('Line width','Line widthUseCurve','true'),
                )):
                    z.writestr(f'good{index}.kpp',fixture(option,key,value,True))
                z.writestr('neighbour.kpp',fixture('Line width','Line widthUseCurve','false',False))
                z.writestr('noncanonical.kpp',fixture('Line width','PressureLine width','yes',True))
            c=import_one(p,root/'out')
            self.assertEqual(len(c.brushes),5)
            self.assertEqual([x['name'] for x in c.skipped],['noncanonical'])
            self.assertTrue(c.skipped[0]['reasons'])


if __name__=='__main__': unittest.main()
