import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('compare',Path(__file__).with_name('compare.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class PublishTests(unittest.TestCase):
 def test_hardlinked_evidence_remains_immutable_across_new_images(self):
  with tempfile.TemporaryDirectory() as root:
   r=Path(root);images=r/'images';images.mkdir();old=r/'old.png';old.write_bytes(b'\x89PNG\r\n\x1a\nold');name,_=module.publish_image(old,images);frozen=r/'frozen.png';os.link(images/name,frozen);inode=frozen.stat().st_ino
   newer=r/'new.png';newer.write_bytes(b'\x89PNG\r\n\x1a\nnew');name2,_=module.publish_image(newer,images)
   self.assertNotEqual(name,name2);self.assertEqual(frozen.read_bytes(),old.read_bytes());self.assertEqual(frozen.stat().st_ino,inode)
   module.publish_image(old,images);self.assertEqual((images/name).stat().st_ino,inode)
   self.assertFalse(list(images.glob('.image-*')))
 def test_corrupt_existing_hash_is_rejected_without_repairing_linked_evidence(self):
  with tempfile.TemporaryDirectory() as root:
   r=Path(root);src=r/'s.png';src.write_bytes(b'\x89PNG\r\n\x1a\nsource');images=r/'images';images.mkdir();target=images/(hashlib.sha256(src.read_bytes()).hexdigest()+'.png');target.write_bytes(b'bad')
   with self.assertRaisesRegex(AssertionError,'Corrupt'):module.publish_image(src,images)
   self.assertEqual(target.read_bytes(),b'bad')
