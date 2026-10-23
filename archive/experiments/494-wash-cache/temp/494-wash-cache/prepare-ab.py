from pathlib import Path
import subprocess
base='02df671bb326d8a92a7f2469449df288deedd4a7'
src=subprocess.check_output(['git','show',base+':apps/web/src/engine/index.ts'],text=True)
Path('apps/web/src/engine/ab494Before.ts').write_text(src+'\nexport { RibbonStrokeScratch }\n')
Path('apps/web/public/ab494.html').write_text('<!doctype html><html><body></body></html>')
