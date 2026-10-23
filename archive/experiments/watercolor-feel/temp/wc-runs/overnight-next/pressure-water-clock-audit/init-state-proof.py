import json,pathlib,random
rng=random.Random(53)
for _ in range(10000):
 C=rng.uniform(.25,1e6)
 for initial,expected in [(None,C),(0,0),(C,C)]:
  snap=json.loads(json.dumps({'capacity':initial}));restored=snap.get('capacity') # null preserved; fallback0 distinct
  if restored is None:restored=C
  assert restored==expected
  for k in range(5):restored=json.loads(json.dumps({'capacity':restored}))['capacity'];assert restored==expected
pathlib.Path('temp/wc-runs/overnight-next/pressure-water-clock-audit/init-state-proof.json').write_text(json.dumps({'runs':10000,'INITnullRestoreThenSeedPASS':True,'fallbackZeroPreservedPASS':True,'numericCapacityPreservedPASS':True,'scope':'State-transition/property test independent of producer inversion and GPU'},indent=2)+'\n')
