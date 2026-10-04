import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
from search_publish import publish


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.artifacts = self.root/'artifacts'
        self.artifacts.mkdir()
        self.gallery = self.root/'gallery'
        (self.gallery/'data').mkdir(parents=True)
        references = self.root/'docs/reference/strokes'
        references.mkdir(parents=True)
        Image.new('RGB',(4,4),'white').save(references/'photo.jpg')
        inputs = {'base':'source-sha','cases':[{'id':'s2-n1','sheet':'2','n':1,
                   'reference':'photo.jpg','box':[0,0,4,4],'inputSha256':'input-sha'}]}
        (self.artifacts/'inputs.json').write_text(json.dumps(inputs))
        for variant, color in [('baseline','white'),('landing-rich','blue'),('next','red')]:
            path = self.artifacts/variant
            path.mkdir()
            Image.new('RGB',(4,4),color).save(path/'s2-n1.png')
            (path/'report.json').write_text(json.dumps({'errors':[], 'replacements':int(variant!='baseline'),
                          'cases':[{'id':'s2-n1','lost':False,'error':None,'draws':10}]}))
        self.patch = patch('search_publish.ROOT',self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_rounds_append_without_changing_prior_images_or_votes(self):
        first = publish(self.artifacts,self.gallery)
        image = self.gallery/'previews/search-round1/s2-n1-landing-rich-candidate.png'
        before = image.read_bytes()
        votes = self.gallery/'data/review-votes.json'
        votes.write_text('[{"verdict":"better"}]')
        second = publish(self.artifacts,self.gallery,'round2','Второй',
                  {'baseline':'landing-rich','comparisons':[{'case':'s2-n1','candidate':'next'}]})
        batches = json.loads((self.gallery/'data/review-batches.json').read_text())
        self.assertEqual(batches,[first,second])
        self.assertEqual(image.read_bytes(),before)
        self.assertEqual(votes.read_text(),'[{"verdict":"better"}]')
        self.assertEqual(second['cases'][0]['baselineId'],'landing-rich')
        with self.assertRaises(ValueError):
            publish(self.artifacts,self.gallery,'round1')
        self.assertEqual(image.read_bytes(),before)

    def test_invalid_selection_never_published(self):
        for config in [{'comparisons':[]}, {'comparisons':[{'case':'missing','candidate':'next'}]},
                       {'comparisons':[{'case':'s2-n1','candidate':'../next'}]}]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                publish(self.artifacts,self.gallery,'round2','Второй',config)
        self.assertFalse((self.gallery/'data/review-batches.json').exists())

    def test_identical_outputs_leave_no_visible_batch(self):
        Image.new('RGB',(4,4),'white').save(self.artifacts/'next/s2-n1.png')
        with self.assertRaises(ValueError):
            publish(self.artifacts,self.gallery,'round2','Второй',
                    {'comparisons':[{'case':'s2-n1','candidate':'next'}]})
        self.assertFalse((self.gallery/'previews/search-round2').exists())
        self.assertFalse((self.gallery/'data/review-batches.json').exists())
        self.assertEqual(list((self.gallery/'previews').iterdir()),[])

if __name__ == '__main__':
    unittest.main()
