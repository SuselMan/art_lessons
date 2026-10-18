import copy
import json
import unittest
from review_catalog import catalog_variants


def model(identifier='flow-1', algorithm='flow', config=None, encoding='optical-density'):
    return dict(id=identifier, label=identifier, image='actual.png', evidence=dict(
        algorithm=algorithm, config={} if config is None else config, encoding=encoding))


class Catalog(unittest.TestCase):
    def test_union_order_no_fake_cards_and_missing_counts(self):
        a = model()
        original = dict(id='original', label='original', image='native.png')
        variants = [a, dict(id='input'), dict(id='native-feather-cache'),
                    dict(id='earlier-native-one-octave'), dict(id='earlier-native-lazy'), original]
        data = dict(scenes=[dict(id='a', variants=variants), dict(id='b', variants=[model('flow-8')])])
        objects = [id(v) for s in data['scenes'] for v in s['variants']]
        catalog_variants(data)
        self.assertEqual([v['key'] for v in data['variantCatalog']][:5],
                         ['original', 'native-lazy', 'native-one-octave', 'native-cache', 'input'])
        self.assertEqual(objects, [id(v) for s in data['scenes'] for v in s['variants']])
        self.assertEqual([len(s['variants']) for s in data['scenes']], [6, 1])
        self.assertEqual(data['variantCatalogStats']['missingSlots'], 5)
        self.assertEqual(a['comparisonKey'], data['scenes'][1]['variants'][0]['comparisonKey'])

    def test_canonical_config_numbers_and_default_verify_zero_not_output_key(self):
        a = model(config={'steps': 64, 'verifyInitializer': 0, 'params': {'b': 2, 'a': 1}})
        b = model('different-local-id', config={'params': {'a': 1.0, 'b': 2}, 'steps': 64.0})
        a['image'] = 'one.png'
        b['image'] = 'different-output.png'
        data = {'scenes': [{'id': 'a', 'variants': [a]}, {'id': 'b', 'variants': [b]}]}
        catalog_variants(data)
        self.assertEqual(a['comparisonKey'], b['comparisonKey'])
        self.assertEqual(len(data['variantCatalog']), 1)
        self.assertEqual(a['comparisonKeyProvenance']['omittedDiagnosticDefaults'], ['verifyInitializer'])

    def test_input_encoding_is_scene_property_while_config_and_algorithm_are_distinct(self):
        variants = [model('a', config={'steps': 64}), model('b', config={'steps': 128}),
                    model('c', config={'steps': 64}, encoding='rgb-proxy'),
                    model('d', algorithm='other', config={'steps': 64})]
        data = {'scenes': [{'id': 'a', 'variants': [variants[0],variants[1],variants[3]]}, {'id':'b','variants':[variants[2]]}]}
        catalog_variants(data)
        self.assertEqual(len(data['variantCatalog']), 3)
        self.assertEqual(variants[0]['comparisonKey'],variants[2]['comparisonKey'])

    def test_machine_json_fallback_only_and_no_label_parameter_guess(self):
        a = {'id': 'wgsl-flow-17', 'label': 'Настройка 99', 'note': 'Параметры: {"sigma":64,"steps":32}\nmetadata'}
        b = {'id': 'wgsl-flow-3', 'label': 'Другой текст', 'note': 'Параметры: {"steps":32,"sigma":64}'}
        data = {'scenes': [{'id': 'a', 'variants': [a]}, {'id': 'b', 'variants': [b]}]}
        catalog_variants(data)
        self.assertEqual(a['comparisonKey'], b['comparisonKey'])
        self.assertEqual(a['comparisonKeyProvenance']['config'], 'note-machine-JSON')
        self.assertEqual(len(data['variantCatalogStats']['fallbackWarnings']), 2)
        bad = {'scenes': [{'id': 'a', 'variants': [{'id': 'flow-1', 'note': 'Параметры: {broken'}]}]}
        with self.assertRaises(ValueError): catalog_variants(bad)
        self.assertNotIn('variantCatalog', bad)

    def test_duplicate_key_reports_explicit_program_need_without_mutating(self):
        data = {'scenes': [{'id': 'a', 'variants': [model('program-A'), model('program-B')]}]}
        before = copy.deepcopy(data)
        with self.assertRaisesRegex(ValueError, 'program-A / program-B.*program identity'):
            catalog_variants(data)
        self.assertEqual(data, before)
        data['scenes'][0]['variants'][1]['evidence']['config'] = {'program': 1}
        catalog_variants(data)
        self.assertEqual(len(data['variantCatalog']), 2)

    def test_input_alias_only_full_sha_and_other_input_source_stays_separate(self):
        variants = [dict(id='input-reference-4', imageSHA256='a'*64),
                    dict(id='input', imageSHA256='a'*64),
                    dict(id='input-reference-7', imageSHA256='b'*64)]
        data = {'scenes': [{'id': 'a', 'variants': variants}]}
        catalog_variants(data)
        self.assertEqual([v['comparisonKey'] for v in variants], ['input', 'input', 'input-input-reference-7'])
        self.assertEqual(len(variants), 3)
        self.assertEqual(len(data['variantCatalog']), 2)
        self.assertEqual(len(data['variantCatalogStats']['inputAliases']), 1)
        self.assertEqual(data['variantCatalogStats']['missingSlots'], 0)

    def test_legacy_algorithm_identity_preserved_and_original_never_input(self):
        old = dict(id='earlier-alt', earlierSource={'algorithm': 'old-model'}, evidence={'config': {'n': 8}, 'encoding': 'optical-density'})
        new = model('new', algorithm='new-model', config={'n': 8})
        data = {'scenes': [{'id': 'a', 'variants': [old, new, {'id': 'input-reference-10'}]}]}
        catalog_variants(data)
        self.assertEqual(len(data['variantCatalog']), 3)
        self.assertFalse(any(row['key'] == 'original' for row in data['variantCatalog']))
        self.assertEqual(json.loads(old['comparisonKey'][6:])[0], 'old-model')


if __name__ == '__main__':
    unittest.main()
