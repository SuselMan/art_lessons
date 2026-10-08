import importlib.util,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('analysis',pathlib.Path(__file__).with_name('analyze-held-factors.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class AnalysisTests(unittest.TestCase):
 def test_exact_does_not_hide_one_quantum(self):
  self.assertTrue(m.difference([0,255],[0,255])['exact']);r=m.difference([0,255],[1,255]);self.assertFalse(r['exact']);self.assertEqual(r['different'],1);self.assertEqual(r['max'],1)
 def test_png_roundtrip_preserves_zero_and_full_channel(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'channel.png';values=[0,1,254,255];m.png(p,2,2,values);self.assertEqual(m.grayscale_png(p),(2,2,values))
 def test_different_roi_lengths_reject(self):
  with self.assertRaises(ValueError):m.difference([1],[1,2])
if __name__=='__main__':unittest.main()
