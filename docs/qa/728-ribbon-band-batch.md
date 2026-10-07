# #728: один CPU проход геометрии для трёх material bands

База5a102d54. Принцип cross-device-determinism: Operation Log, прежние double значения геометрии/материалов, Float32 vertex order и физические draw команды сохраняются. Новый builder проходит геометрию один раз и выдаёт три независимых массива. Старый buildRibbonBands сохраняет прежний алгоритм и API; экспортированы только три pure geometry helper.

Painter.diagnosticBandBatch выключен по умолчанию. Используется только при segmentMode + inkFor + diagnosticSolventField + !stampsOnly; прочие инструменты/сухая кисть/кончик не изменены. Три текущих callbacks pure: pigment, same pigment with contact-before wetOf, solvent. Каждый вызывается однажды на сегмент своего material; interleaving вместо трёх полных geometry walks безопасен для этих callbacks. Материальные double products вычисляются до Float32 encoding; закодированные floats не используются обратно в геометрии.

Writer: дешёвая initial capacity по числу сегментов, grow перед сегментом на уже вычисленном poseSubdivisions, без второго geometry walk. Геометрические doubles не меняются. Actual final8 Samsung1345 + varied ellipse/roundedBox/film/scale/pressure/return/zero-travel/negative-opacity: все три массива byte exact против старых builders25cases. Existing geometry31tests и actual Painter ordered band bytes/modes/uniforms7tests:63PASS, webTS PASS. oxlint --fix:0errors, один существующий no-this-alias warning const owner=this вне данного diff.

Отрицательный первый writer с тремя Number[] сохранён в generic-negative-benchmark.log: HOME paired15samples10reps median15.115→16.324ms; диагностический Vitest timeout5s после вывода. Этот writer заменён, не предлагается к интеграции.

Typed writer: HOME alternating15pairs3reps actual final8 median old13.969→new2.775ms. CPU diagnostic, не Adreno/Room/FPS. Artefacts temp/ribbon-band-batch. Default OFF до immutable hardware material/endpoints/native gate. Ни shader/physics tuning, ни GPU correctness claim пока нет.
