import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from krita_stock import verified_source


class StockTests(unittest.TestCase):
    def test_cache_integrity_without_network_and_corruption_rejected(self):
        data=b'authored resource'
        entry={'path':'krita/data/test.kpp','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'gitBlobSha1':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()}
        with tempfile.TemporaryDirectory() as tmp:
            cache=Path(tmp);target=cache/entry['path'];target.parent.mkdir(parents=True);target.write_bytes(data)
            with patch('urllib.request.urlopen', side_effect=AssertionError('network forbidden')):
                self.assertEqual(verified_source(entry,'commit',cache),target)
                target.write_bytes(b'corrupt')
                with self.assertRaisesRegex(ValueError,'integrity'):
                    verified_source(entry,'commit',cache)
    def test_traversal_rejected_before_network(self):
        with self.assertRaisesRegex(ValueError,'Unsafe'):
            verified_source({'path':'../escape'},'commit',Path('/tmp'))
