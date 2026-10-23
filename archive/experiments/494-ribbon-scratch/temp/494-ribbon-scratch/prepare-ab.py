from pathlib import Path
import subprocess
base='b7d2b6a915c50017b57588fe247f08d75df38839'
# Run from this task worktree. Temporary source is removed after the run.
s=subprocess.check_output(['git','show',base+':apps/web/src/engine/index.ts'],text=True)
Path('apps/web/src/engine/ab494Before.ts').write_text(s+'\nexport { RibbonStrokeScratch }\n')
Path('apps/web/public/ab494.html').write_text('<!doctype html><html><body></body></html>\n')
