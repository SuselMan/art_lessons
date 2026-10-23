"""Raw ABR tool keys follow the published ag-psd descriptor reader.

No licensed brush inputs or assertions about proprietary pigment equations.
"""
from pathlib import Path
import tempfile
import unittest

import convert


class AbrToolOptionsTests(unittest.TestCase):
    def descriptor(self, tool):
        with tempfile.TemporaryDirectory() as directory:
            catalog = convert.Catalog(Path(directory))
            descriptor, _ = convert.photoshop_component(
                {'Brsh': {'_class': 'computedBrush'}, 'toolOptions': tool},
                {}, catalog, [], b'own ABR tool fixture')
            return descriptor

    def test_published_mixer_keys_drive_pickup_and_strength(self):
        descriptor = self.descriptor({'_class': 'MixB', 'wetness': 80, 'Prs ': 35})
        self.assertEqual(descriptor['model'], 'mixer')
        self.assertEqual(descriptor['version'], 4)
        self.assertAlmostEqual(descriptor['mixer']['pickup'], .8)
        self.assertAlmostEqual(descriptor['mixer']['strength'], .35)
        self.assertAlmostEqual(descriptor['behavior']['wetMix']['pull'], .8)
        self.assertAlmostEqual(descriptor['behavior']['wetMix']['attack'], .35)

    def test_canonical_zero_overrides_legacy_aliases(self):
        descriptor = self.descriptor({'_class': 'MixB', 'wetness': 0, 'wet': 90,
                                      'Prs ': 0, 'strength': 95})
        self.assertEqual(descriptor['mixer']['pickup'], 0)
        self.assertEqual(descriptor['mixer']['strength'], 0)

    def test_smudge_strength_accepts_descriptor_unit_values(self):
        descriptor = self.descriptor({'_class': 'SmTl', 'wetness': {'value': 20},
                                      'Prs ': {'value': 75}})
        self.assertEqual(descriptor['mixer']['load'], 0)
        self.assertAlmostEqual(descriptor['mixer']['pickup'], .2)
        self.assertAlmostEqual(descriptor['mixer']['strength'], .75)

    def test_legacy_private_aliases_remain_accepted(self):
        descriptor = self.descriptor({'_class': 'MixB', 'wet': 30, 'strength': 65})
        self.assertAlmostEqual(descriptor['mixer']['pickup'], .3)
        self.assertAlmostEqual(descriptor['mixer']['strength'], .65)

    def test_missing_options_keep_explicit_approximation_defaults(self):
        descriptor = self.descriptor({'_class': 'MixB'})
        self.assertEqual(descriptor['mixer'], {'load': .5, 'pickup': .5, 'strength': .5})


if __name__ == '__main__':
    unittest.main()
