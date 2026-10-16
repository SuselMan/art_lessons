import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-film-gallery.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublicationSafety(unittest.TestCase):
    def fixture(self, root):
        work, base = root / 'work', root / 'gallery'
        for path in [work / 'input', work / 'output', base / 'previews', base / 'data']:
            path.mkdir(parents=True)
        (base / 'data/comments.json').write_text('{"existing":"keep exactly"}\n')
        old = {'versions': [{'id': 'old'}], 'sheets': [{'id': '1', 'strokes': [{'n': 1, 'app': {'old': {'src': 'preview/old.jpg'}}}]}]}
        (base / 'data/rendered.json').write_text(json.dumps(old))
        (base / 'previews/old.jpg').write_bytes(b'old immutable image')
        sheets = []
        for n in range(1, 12):
            sid = str(n)
            count = 8 if n <= 8 else 7
            slots = {str(k): [0, 0, 4, 4] for k in range(1, count + 1)}
            sheets.append({'id': sid, 'board': {'room': 'fixture', 'roomPx': [4, 4], 'pxPerMm': 12, 'slots': slots}, 'strokes': [{'n': k} for k in range(1, count + 1)]})
            journal = work / 'input' / ('ops_' + sid + '.json')
            journal.write_text('[]')
            Image.new('RGBA', (4, 4), (10, 50, 90, 120)).save(work / 'output' / ('sheet' + sid + '.png'))
            report = {'gl': 0, 'lost': False, 'errors': [], 'renderer': 'AMD hardware', 'model': 'front8-detail-flow-v3', 'inputSha': publisher.sha(journal)}
            (work / 'output' / ('sheet' + sid + '.json')).write_text(json.dumps(report))
        (work / 'archive-source.json').write_text(json.dumps({'sheets': sheets}))
        return work, base, old

    def test_preserves_old_versions_comments_and_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            work, base, old = self.fixture(Path(folder))
            before = (base / 'data/comments.json').read_bytes()
            publisher.publish(work, base, 'fixture-source', 'new')
            overlay = json.loads((base / 'data/rendered.json').read_text())
            self.assertEqual(overlay['versions'][0], old['versions'][0])
            self.assertEqual(overlay['sheets'][0], old['sheets'][0])
            self.assertEqual((base / 'data/comments.json').read_bytes(), before)
            self.assertEqual((base / 'previews/old.jpg').read_bytes(), b'old immutable image')
            self.assertEqual(len(list((base / 'previews/gallery-new/img').rglob('*.jpg'))), 85)

    def test_v4_publication_records_the_selected_model(self):
        with tempfile.TemporaryDirectory() as folder:
            work, base, old = self.fixture(Path(folder))
            for report in (work / 'output').glob('*.json'):
                value = json.loads(report.read_text())
                value['model'] = 'front8-detail-flow-v4'
                report.write_text(json.dumps(value))
            publisher.publish(work, base, 'v4-source', 'new-v4', 'front8-detail-flow-v4')
            manifest = json.loads((base / 'previews/gallery-new-v4/manifest.json').read_text())
            self.assertEqual(manifest['model'], 'front8-detail-flow-v4')
            overlay = json.loads((base / 'data/rendered.json').read_text())
            self.assertIn('вариант Г', overlay['versions'][-1]['subject'])

    def test_m70_requires_declared_scale_and_preserves_old_assets(self):
        with tempfile.TemporaryDirectory() as folder:
            work, base, old = self.fixture(Path(folder))
            archive = json.loads((work / 'archive-source.json').read_text())
            for sheet in archive['sheets']:
                sheet['board']['roomPx'] = [2048, 1024]
            (work / 'archive-source.json').write_text(json.dumps(archive))
            for report in (work / 'output').glob('*.json'):
                value = json.loads(report.read_text())
                value.update(model='m70-r2-v1', scale=.5)
                report.write_text(json.dumps(value))
                Image.new('RGBA', (1024, 1024), (10, 50, 90, 120)).save(report.with_suffix('.png'))
            publisher.publish(work, base, 'm70-source', 'm70-preview', 'm70-r2-v1')
            overlay = json.loads((base / 'data/rendered.json').read_text())
            self.assertIn('1024px', overlay['versions'][-1]['subject'])
            self.assertEqual(overlay['sheets'][0], old['sheets'][0])
            self.assertEqual((base / 'previews/old.jpg').read_bytes(), b'old immutable image')

    def test_m70_native_scale_has_distinct_label(self):
        with tempfile.TemporaryDirectory() as folder:
            work, base, _ = self.fixture(Path(folder))
            for report in (work / 'output').glob('*.json'):
                value = json.loads(report.read_text())
                sheet = int(report.stem.replace('sheet', ''))
                value.update(model='m70-r2-v1', scale=1, renderMode='native-samples',
                             nativeSamples=8 if sheet <= 8 else 7)
                report.write_text(json.dumps(value))
            publisher.publish(work, base, 'native-source', 'm70-native', 'm70-r2-v1')
            overlay = json.loads((base / 'data/rendered.json').read_text())
            self.assertIn('исходный масштаб', overlay['versions'][-1]['subject'])
            self.assertNotIn('предпросмотр', overlay['versions'][-1]['subject'])

    def test_gpu_failure_cannot_publish_partial_version(self):
        with tempfile.TemporaryDirectory() as folder:
            work, base, old = self.fixture(Path(folder))
            report = work / 'output/sheet2.json'
            value = json.loads(report.read_text())
            value['lost'] = True
            report.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'GPU failure'):
                publisher.publish(work, base, 'fixture-source', 'new')
            self.assertEqual(json.loads((base / 'data/rendered.json').read_text()), old)
            self.assertFalse((base / 'previews/gallery-new').exists())


if __name__ == '__main__':
    unittest.main()
