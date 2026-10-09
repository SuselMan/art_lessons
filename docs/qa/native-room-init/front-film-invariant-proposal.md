# Следующий точный кандидат: film внутри waterFront

После combined cache+paired brush аппаратный первый material всё ещё тратит771.883 ms на240 waterFront проходов (из1199.571 ms измеренных GPU passes). Это описательный замер одного фиксированного порядка.

В текущем WGSL loop k=0..7 вычисляет `film=smoothstep(0.02,0.15,max(fieldAt(coverage,uv).a,u.wet.y*fieldLinear(foreignFilm,uv).r))` после каждого допустимого соседа. В выражении нет k, o, stride, ci, hj, hi или best. Поля coverage/foreignFilm отдельны от output, bindings и uniform неизменны в течение dispatch. Следовательно film одинаков для всех допущенных соседей одной invocation.

Узкий вариант: `filmReady=false;film=0` до loop, затем выполнить исходное выражение при первом соседе после обоих исходных continue; следующие соседи используют сохранённый f32. При нуле допустимых соседей не добавляется sampling. Арифметика edge/min и240 Q8 границ остаётся прежней. Максимум восемь одинаковых coverage reads и bilinear foreign reads заменяются одним вычислением; компилятор может уже выполнять такую CSE, поэтому прирост заранее неизвестен.

Условия допуска: явный DEVdefaultOFF option, отдельный shader passport через общую factory; immutable bindings/input-output nonalias, положительные конечные uniforms как в исходном front. CPU oracle проверяет lazy evaluation и битовую f32 величину для0..8 допущенных соседей/film границ; аппаратный oracle обязателен для результата компилятора. ONE same-packed OFF/ON сравнивает10 финальных Q8 ролей и endpoint,240 waterFront/210 paired contact counts; cache ON одинаков в обоих arms. Изменение разрешения, cadence, scheduler либо physical model не требуется.

Это предложение; shader ещё не изменён, аппаратного результата нет.
