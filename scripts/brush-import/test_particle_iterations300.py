"""Krita Particle iterations 201..300: uniform ceiling 300, load budget unchanged."""
import tempfile,unittest
from pathlib import Path
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from particle_wash134 import particle_wash134_scope
# The Krita uniform property Particle/iterations allows 1..300. The 16384 point
# budget (count*iterations) is the load bound and is NOT relaxed here, so a
# large iteration count only stays legal with a proportionally small count.
BUDGET=16384
def safe_count(iterations):return min(500,BUDGET//iterations)
class ParticleIterations300(unittest.TestCase):
 def convert(self,extra=''):
  data=kpp(engine='particlebrush',resources=extra)
  with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
 def test_uniform_ceiling_300_is_accepted_with_a_safe_count(self):
  for iterations in(1,200,201,300):
   with self.subTest(iterations=iterations):
    count=safe_count(iterations);self.assertLessEqual(count*iterations,BUDGET)
    a=self.convert('<param name="Particle/count">%d</param><param name="Particle/iterations">%d</param>'%(count,iterations))
    p=a['descriptor']['particle'];self.assertEqual(p['iterations'],iterations);self.assertEqual(p['count'],count)
 def test_above_the_uniform_ceiling_is_rejected(self):
  with self.assertRaisesRegex(ValueError,'iterations'):self.convert('<param name="Particle/count">1</param><param name="Particle/iterations">301</param>')
 def test_load_budget_still_bounds_count_times_iterations(self):
  for count,iterations in((500,200),(55,300),(500,300)):
   with self.subTest(count=count,iterations=iterations):
    self.assertGreater(count*iterations,BUDGET)
    with self.assertRaisesRegex(ValueError,'budget'):self.convert('<param name="Particle/count">%d</param><param name="Particle/iterations">%d</param>'%(count,iterations))
 def test_closed_scope_mirrors_the_same_ceiling_and_budget(self):
  for iterations in(200,201,300):
   count=safe_count(iterations);p={'version':1,'count':count,'iterations':iterations,'gravity':.906,'weight':.06,'scaleX':1,'scaleY':1}
   d={'version':134,'model':'stamp','paperInteraction':0,'flow':1,'flowByPressure':[[0,0],[1,1]],'opacityByPressure':[[0,0],[1,1]],'tip':{'kind':'round','aspect':1,'hardness':1,'rotation':'fixed','angle':0},'behavior':{'version':2,'rendering':{'mode':'buildUp','blendMode':'normal','accumulation':'alphaDarken'}},'particle':p}
   self.assertTrue(particle_wash134_scope(d))
   d['particle']['iterations']=301;self.assertFalse(particle_wash134_scope(d))
   d['particle']['iterations']=iterations;d['particle']['count']=500;self.assertFalse(particle_wash134_scope(d))
if __name__=='__main__':unittest.main()
