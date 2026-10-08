# #728 — локализация native/GL source coverage

Состояние: диагностическое исследование Surface, production defaults не менялись. Все результаты относятся к одному 100 px зигзагу, Fine paper, одному tile1024 и каноническому settle1536. Это не проверка Room или других GPU.

Исходный end-to-end материал: 49 643 различных байта, max36; native author и native packed replay совпали точно. Аппаратная LINEAR выборка native non-paper inputs уменьшила расхождение до 43 282/max36. First carry amplification707/max38 →447/max3, pre-diffuse7211/max126 →499/max3. Это подтверждает вклад выборки, а не полное решение.

Coverage mode11 28/max58 не оказался самостоятельной ошибкой оператора: 26 различных пикселей, 25 коррелировали с входным coverage, три — с pressure; ни одного без различий same-pixel inputs. На x566/y396 pressure246/243 при пустом coverage дал alpha197/255. Width smoothstep0.00956397 составляет лишь ~2.44 Q8 уровня, поэтому малый вход усилился. Copy mode1 k0 exact внутри каждого backend. Первый front получил одинаковый source, но coverage29/max1; повтор обоих front на одинаковых настоящих GL source/coverage/paper дал exact0.

Первый isolated stamp и ribbon exact0 при GL DITHER ON/OFF. Полный ordered stream145 coverage команд воспроизвёл итоговое source отличие29/max1 в обоих dither arms. Команда9 дала один R-byte/max1. Команда11 временно дала max169 на x457/yTop372: пустой вход, native alpha255 против GL86. Это внутри nib, не обычный edge falloff. Все параметры stamp сохранялись из настоящего preparer.

Shader debug в критической точке: nibCoverage255 и pressure204 совпали; opening169 совпал; hair149 против78 и tipContact255 против86. Four lattice samples совпали184/44/106/16, но first-octave row mixes стали184/106 против44/16. Diagnostic hair floor кодировался48 в обоих backend, fract0 против255. Это свидетельство несогласованного floor/fract вычисления около integer границы; compiler contraction/reassociation остаётся гипотезой, не доказанным устройством компилятора. RGBA8 debug не измеряет точные sub-byte float значения и способен изменить compiler оптимизации.

Изолированная замена GL `fract(p)` на `p-i`, где `i=floor(p)`, восстановила critical hair149 и alpha255 в обоих backend. Команда11 сохранила пять отличных R-byte/max1, команда9 — один R-byte; alpha в этих парных командах совпала. На полном145 stream финал всё ещё28/max1 по каналам[20,0,4,4]; максимальное промежуточное отличие уменьшилось169 →5. Полной parity нет. Крупная noise discontinuity снята, остаточное Q8 накопление не локализовано.

Исходные аппаратные отчёты root: `temp/fast-watercolor-night/native-coverage-sequence-surface-1791423292714.json`, `native-coverage-same-input-surface-1791423591070.json`, `native-stamp-debug-surface-1791424051950.json`, `native-stamp-noise-surface-1791424417803.json`, `native-stamp-consistent-surface-1791424682213.json`, `native-coverage-consistent-surface-1791424822872.json`. Они не коммитятся; никакой вывод не основан на software mock.

Следующий gate: два последовательных настоящих GL owners — frozen baseline и диагностический floor-relative source — с одним неизменным native результатом. Хешировать исходный/заменённый shader source, tape и paper; сравнить весь material и staged inputs. Не включать вариант в production по результату одного isolated stamp.
