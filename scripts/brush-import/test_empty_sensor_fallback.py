"""Empty active sensor definitions use the same fallback as missing ones."""
import copy
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from convert import Catalog
from krita_import import convert_krita
from test_krita import kpp
from test_krita_size_strength import authored


def data(engine, option, sensor=None, checked=True, custom='false', child=False):
    prefix = 'MaskingBrush/Preset/' if child else ''
    fields = {prefix+'Pressure'+option: str(checked).lower(), prefix+option+'UseCurve': 'true',
              prefix+'Custom'+option: custom, prefix+'Curve'+option: '0,1;1,0;'}
    if sensor is not None:
        fields[prefix+option+'Sensor'] = sensor
    if engine == 'paintbrush' and option == 'Size' and not child:
        return authored({**fields, 'PaintOpAction': '1'})
    props = '<param name="PaintOpAction">1</param>'
    if child:
        props += '<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>]]></param>'
    props += ''.join(f'<param name="{key}"><![CDATA[{value}]]></param>' for key, value in fields.items())
    return kpp(engine=engine, resources=props)


def imported(root, raw):
    path = root/'input.kpp'; path.write_bytes(raw)
    catalog = Catalog(root/'out'); convert_krita(path, catalog)
    return catalog


class EmptySensorFallbackTests(unittest.TestCase):
    def test_empty_matches_absent_for_checked_and_disabled(self):
        cases = [('paintbrush', x, False) for x in ('Size', 'Opacity', 'Flow', 'Rotation')]
        cases += [('colorsmudge', 'SmudgeRate', False), ('paintbrush', 'Size', True)]
        for engine, option, child in cases:
            for checked in (False, True):
                for custom in ('false', 'true'):
                    with self.subTest(engine=engine, option=option, child=child, checked=checked, custom=custom), tempfile.TemporaryDirectory() as tmp:
                        root = Path(tmp); records = []
                        for i, sensor in enumerate((None, '')):
                            case = root/str(i); case.mkdir()
                            catalog = imported(case, data(engine, option, sensor, checked, custom, child))
                            self.assertEqual(catalog.skipped, [])
                            descriptor = copy.deepcopy(catalog.brushes[0]['descriptor']); descriptor.pop('id')
                            if child: descriptor['behavior']['dual']['brush'].pop('id')
                            records.append(descriptor)
                        self.assertEqual(records[0], records[1])

    def test_malformed_nonempty_and_bundle_isolation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path = root/'input.bundle'
            with ZipFile(path, 'w') as archive:
                archive.writestr('a.kpp', data('paintbrush', 'Rotation', ''))
                archive.writestr('b.kpp', data('paintbrush', 'Rotation', '<params'))
                archive.writestr('c.kpp', data('colorsmudge', 'SmudgeRate', ''))
            catalog = Catalog(root/'out'); convert_krita(path, catalog)
            self.assertEqual([x['source'] for x in catalog.brushes], ['a.kpp', 'c.kpp'])
            self.assertEqual([x['name'] for x in catalog.skipped], ['b'])

    def test_empty_does_not_enable_unsupported_sketch_option(self):
        with tempfile.TemporaryDirectory() as tmp:
            catalog = imported(Path(tmp), data('sketchbrush', 'LineWidth', ''))
            self.assertEqual(catalog.brushes, [])
            self.assertIn('Unlowered active native194 options', str(catalog.skipped))


if __name__ == '__main__':
    unittest.main()
