from pathlib import Path
import subprocess
p=Path('apps/web/src/engine/src/buffers/RibbonStrokeScratch.ts')
s=p.read_text()
needle='if (this.diffusePending || this.pendingComposite.size) return null'
assert s.count(needle)==1
try:
    p.write_text(s.replace(needle, 'if (true || this.diffusePending || this.pendingComposite.size) return null'))
    with Path('temp/494-ribbon-scratch/unit-mutation.log').open('w') as log:
        r=subprocess.run(['npx','vitest','run','--maxWorkers=2','apps/web/src/engine/index.watercolor.test.ts','-t','the budget spills a resting wash'],stdout=log,stderr=subprocess.STDOUT)
    assert r.returncode != 0, 'mutation was not detected'
    assert 'AssertionError' in Path('temp/494-ribbon-scratch/unit-mutation.log').read_text(), 'failure was not an assertion'
    print('Regression test rejected disabled spill (expected test failure)')
finally:
    p.write_text(s)
