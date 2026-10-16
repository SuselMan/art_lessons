# #747: ограниченная поддержка прямоугольной комнаты

Readonly-план. Это **один bounded tile**, обе стороны от1до1024px.
Infinite/multi-tile и обычная1240×1754 комната остаются отдельной задачей.
Принцип: мировые размеры каждой оси проходят через весь material pipeline;
GPU residency остаётся кешем и не сушит материал. App source здесь не изменён.

Минимальный контракт размеров: `number | {width:number;height:number}` для
`createNativePuddleTarget`/`createBackgroundMix` (число сохраняет square callers),
внутри только width/height. Controller host получает обе стороны; временно
совместимый host.size допустим только на границе конструктора, не в allocations.
Стороны должны быть положительными целыми; размер не меняется у живого controller.

Изменения:

- Controller: constructor solver, source/restore raw/next/goal allocations,
  presentation dimensions, accept geometry guard. Parked snapshots уже содержат
  реальные размеры; восстановление обязано сверять их с host, включая ориентацию.
- NativeTarget: output/contour/dryCoverage, все pool.acquire, bounds.maxX/maxY,
  resetFromScratch guard, BackgroundMix/ContrastPhase размер.
- BackgroundMix: fullbuffer(width,height), margin(12/width,12/height), worldSize,
  copytexel(1/width,1/height). Lowgrid с maxside256:
  lowW=max(1,round(256*width/max(width,height))), lowH аналогично;
  smoothing stride(radius/lowW,radius/lowH). Для square все числа прежние.
- ContrastPhase: такойже lowgrid вместо fixed256²; CPU flood uses nx*ny,
  at%nx, floor(at/nx), separate neighborbounds; minCells uses
  (width/nx)*(height/ny); uploadregionKeep(nx,ny). Это сохраняет приблизительно
  одинаковую плотность world sampling по обеим осям.
- Index: gate требует finite positive integer page/tile стороны<=1024,
  bounded room и **page.w===tile.w && page.h===tile.h**, а не просто снимает
  square condition. `_puddleFor` передаёт w,h; error text уточняет single-tile.
  Active model fieldminimum1024 не означает квадратный world bounds:
  WatercolorSettlePlan уже делает fieldFor(w/S,h/S) и берёт реальные tile bounds.
- PuddlePresentation уже number|{width,height}; её контракт менять не нужно.

Unit-проверки, проверяющие смысл:

1. 768×512 и512×768 allocations/solver bounds/presentation match; ошибки
   geometry mismatch/cross-orientation до копирования/частичного изменения.
2. Square512 legacy числовой вызов и explicit object задают теже uniforms,
   lowgrid размеры и последовательность solver ops.
3. World geometry: margin12px и smoothing одинаковый world stride по осям,
   CPU connectedcomponent area threshold для известной прямоугольной selection.
4. Три мокрых rectangular слоя: park→restore сохраняет все raw bytes+metadata,
   вода не закрывается; replay восстановления после CPU-cache eviction.
5. Недопустимые0/negative/NaN/Infinity/noninteger/>1024/multitile rejected
   атомарно, обычный pencil остаётся работоспособным.

Реальные GPU: fresh768×512 landscape +512×768 portrait; вода и пигмент через
центр, углы, обе короткие/длинные границы; peer crosslayer edits; Dry/undoDry;
undo/redo; duplicate/merge canonical target; rejoin snapshot; thirdwet cache.
Проверять live target против independent replay на **томже GPU**, не заявлять
crossGPU exact, пока #748 не решён. Контроль square exact-input target SHA
до/после refactor обязателен. Performance отдельно после CPU idle.

Сначала интегрировать и проверить #747 residency, затем менять геометрию
отдельным patch/commit: иначе новые размерные bugs смешаются с lifecycle bugs.
