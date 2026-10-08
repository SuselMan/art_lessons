# Диагностика LINEAR mode11

Сборка: `node -e "require('esbuild').buildSync({entryPoints:['docs/qa/harness/728-linear-mode11/run.ts'],outfile:'temp/linear-mode11/run.js',bundle:true,format:'esm'})"`.
В доверенной странице загрузить модуль `run.js`, затем `await window.runLinearMode11()`.
Root запускает на устройстве; этот harness не запускает браузер автоматически.

Три маленьких fixture: 32×8 и 1536×8 с одинаковыми размерами давления/выхода, затем стресс с давлением 511×7. Последний намеренно не отражает production размеры. Каждый использует неизменные RGBA8 входы, реальный GL shader mode11, отключённый DITHER и два настоящих native dispatch. Отчёт считает число разных байтов/max, ошибки validation/GL. Нет порога «хорошо» и нет таймингов производительности.

Baseline WGSL неизменён. Diagnostic option `diagnosticHardwareLinearInputs` выключен по умолчанию, действует только на существующие LINEAR non-paper входы. Аппаратный sampler clamp-to-edge заменяет четыре textureLoad/mix; nearest и paper неизменны. Преобразование UV `1-v` само может добавить округление. Улучшение парного теста доказывает чувствительность к выборке, а не причину полного end-to-end расхождения. Чтобы доказать последнюю, потребуется одинаковый захваченный production pressure и mode11 metadata.
