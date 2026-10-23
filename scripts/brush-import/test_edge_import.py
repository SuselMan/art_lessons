"""Own tiny fixtures: preserve edge controls without inventing vendor formulas."""
import io
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

from PIL import Image

import convert


class ProcreateEdgeImportTests(unittest.TestCase):
    def import_brush(self, settings):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'edge-probe.brush'
            png = io.BytesIO()
            # A white tip with one missing corner; no bundled or licensed assets.
            Image.frombytes('L', (2, 2), bytes([255, 255, 255, 0])).save(png, 'PNG')
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('Brush.archive', plistlib.dumps({'name': 'Edge probe', **settings}))
                archive.writestr('Shape.png', png.getvalue())
            catalog = convert.Catalog(root / 'catalog')
            convert.procreate(path, catalog)
            self.assertEqual(catalog.skipped, [])
            self.assertEqual(len(catalog.brushes), 1)
            return catalog.brushes[0]

    def unsupported_mentions(self, brush, key):
        return any(note['status'] == 'unsupported' and key.lower() in
                   (note['feature'] + ' ' + note['detail']).lower()
                   for note in brush['compatibility'])

    def test_pressure_bleed_alone_preserves_its_curve_without_wet_mix(self):
        brush = self.import_brush({
            'dynamicsPressureBleed': 0.7,
            'dynamicsPressureBleedCurve': {'points': ['{0, 0}', '{0.5, 0.2}', '{1, 1}']},
        })
        descriptor = brush['descriptor']
        edge = descriptor['behavior']['edgeBleed']
        self.assertAlmostEqual(edge['pressure'], 0.7)
        self.assertEqual(edge['pressureCurve'], [[0, 0], [0.5, 0.2], [1, 1]])
        self.assertEqual(descriptor['model'], 'stamp')
        self.assertNotIn('wetMix', descriptor['behavior'])

    def test_tilt_bleed_alone_is_a_shape_control_not_a_mixer(self):
        descriptor = self.import_brush({'dynamicsTiltBleed': 0.6})['descriptor']
        self.assertAlmostEqual(descriptor['behavior']['edgeBleed']['tilt'], 0.6)
        self.assertEqual(descriptor['model'], 'stamp')
        self.assertNotIn('wetMix', descriptor['behavior'])

    def test_bleed_does_not_create_pull_dynamics_when_wet_mix_is_active(self):
        behavior = self.import_brush({
            'dynamicsLoad': 1, 'dynamicsWetAccumulation': 0.35,
            'dynamicsPressureBleed': 0.8, 'dynamicsTiltBleed': 0.4,
        })['descriptor']['behavior']
        self.assertAlmostEqual(behavior['wetMix']['pull'], 0.35)
        self.assertNotIn('pull', behavior['wetMix'].get('dynamics', {}))
        self.assertIn('edgeBleed', behavior)

    def test_mix_softening_does_not_overwrite_blur_and_is_explicitly_unsupported(self):
        brush = self.import_brush({'dynamicsBlur': 0.2, 'dynamicsMixSoftening': 0.9})
        self.assertAlmostEqual(brush['descriptor']['behavior']['wetMix']['blur'], 0.2)
        self.assertTrue(self.unsupported_mentions(brush, 'dynamicsMixSoftening'))

    def test_softening_alone_is_not_silently_reported_as_supported(self):
        brush = self.import_brush({'dynamicsMixSoftening': 0.9})
        self.assertTrue(self.unsupported_mentions(brush, 'dynamicsMixSoftening'))

    def test_pressure_mix_alone_executes_or_is_explicitly_unsupported(self):
        brush = self.import_brush({'dynamicsPressureMix': 0.8})
        descriptor = brush['descriptor']
        dynamics = descriptor['behavior'].get('wetMix', {}).get('dynamics', {})
        executes = descriptor['model'] == 'mixer' and bool(dynamics.get('dilution'))
        self.assertTrue(executes or self.unsupported_mentions(brush, 'dynamicsPressureMix'))

    def test_modulated_rendering_transfer_has_an_explicit_compatibility_warning(self):
        brush = self.import_brush({'renderingModulatedTransfer': True})
        self.assertTrue(any(note['status'] != 'supported' and
                            'renderingModulatedTransfer' in (note['feature'] + ' ' + note['detail'])
                            for note in brush['compatibility']))


if __name__ == '__main__':
    unittest.main()
