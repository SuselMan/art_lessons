# #728: Samsung WebGL solver queue OFF/ON/ON/OFF

Actual SM-T970/R52RB0JXVSY, Chrome154, ANGLE Adreno650 OpenGL ES3.2.
Frozen f9be0d84, bundle SHA256
`693565d67b86e0b2814c7c7e042106fea1ccfd104799cb2e766f21930280ec73`.
Actual Fine compressed asset bytes и catch LUT сравнены с existing frozen paper;
SHA256 паспорта в [samsung-summary.json](samsung-summary.json).

Четыре собственные вкладки1499–1502, последовательность OFF/ON/ON/OFF:
paint **5817 /2810 /2553.8 /5776.4ms**. Средние5796.7→2681.9ms, наблюдаемое
снижение wall **53.7%** в данной серии. Все26 captured field records, material
оба1024 tiles, RGBA export и packed tape byte-identical во всех arms. Undo stroke-2
действительно меняет материал, Redo точно восстанавливает его. GL0/lostfalse,
errors[], memoryAbort отсутствует; минимум MemAvailable1363MiB (>500 abort).

Ticks335→132/131; original contact204/front70 сохраняются. Barrier counter
61/62/61/61 — wrapper completion/admission observations, не число GPU passes.
Не скрываем его расхождение. Default source остаётсяOFF, original closures,
Q8 boundaries и math не менялись; API GPU timer не использовался.

rAF-монитор охватывает **весь arm**, включая init, readPixels/export, Undo/Redo.
P95OFF16.8/16.8ms, ON33.4/16.8ms; max≈2.1–2.47sec относится к этой смешанной
фазе. Поэтому никакого улучшения drawing FPS из этих чисел не выводим. Это
standalone same-model fixed packed replay400/Fine/page2048x1024, **не обычный
Room, не настоящее перо, не human animation approval**. Быстрее wall — доказанный
ограниченный результат; UX живого рисования нужно проверять отдельно.

Экран был Dozing, разрешённый helper wake перевёл его в Awake. Новое pairing,
Chrome restart/cache очистка, чужие вкладки/Surface/роутер не трогались.
Stay-on original7→after7; настройки питания не менялись. Все собственные targets
закрыты в finally. Native/WebGPU GPU-прогонов не было.

Повтор контроллера (private URL в отдельном игнорируемом файле; не коммитить):

```sh
CDP_BASE=http://127.0.0.1:9454 \
GATE_URL_FILE=<private-file> \
GATE_OUT=temp/device-runs/<new-run> \
FROZEN_PAPER_DIR=<existing-frozen-public-paper> \
node docs/qa/harness/728-gl-queue-samsung/controller.mjs
```

Сначала skills/status/serial, cached ADB forward, owned fresh target, WebGL2
preflight. Controller проверяет actual bundle SHA, Fine bytes/LUT, RAM>=1700
до каждого arm и abort<500 во время работы. Raw ignored:
`temp/device-runs/queue-samsung/actual/report.json`. Scoped controller lint PASS.
