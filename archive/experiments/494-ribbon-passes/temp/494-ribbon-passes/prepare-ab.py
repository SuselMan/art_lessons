from pathlib import Path
import subprocess
src=subprocess.check_output(['git','show','02238165:apps/web/src/engine/index.ts'],text=True)
Path('apps/web/src/engine/ab494Before.ts').write_text(src+'\nexport { RibbonStrokeScratch }\n')
Path('apps/web/public/ab494.html').write_text('<!doctype html><html><body></body></html>')
