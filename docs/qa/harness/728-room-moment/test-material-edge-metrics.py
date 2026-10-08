import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('edges',pathlib.Path(__file__).with_name('material-edge-metrics.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class EdgeTests(unittest.TestCase):
 def test_rowgap_distinguished_from_emptyoutside(self):
  b=bytearray(5*3*4)
  for x in [1,3]:b[(5+x)*4+3]=1
  r=m.edge_metrics(b,5,3);self.assertEqual(r['zeroRunsBetweenFirstLastSupportInRow'],1);self.assertEqual(r['zeroPixelsBetweenFirstLastSupportInRow'],1);self.assertEqual(r['nonzeroAlpha'],2)
 def test_full_support_has_only_outerboundary(self):
  b=bytes([0,0,0,255])*9;r=m.edge_metrics(b,3,3);self.assertEqual(r['fourNeighborBoundaryPixels'],8);self.assertEqual(r['zeroRunsBetweenFirstLastSupportInRow'],0)
if __name__=='__main__':unittest.main()
