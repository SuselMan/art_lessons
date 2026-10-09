# Native identity-copy: отдельный CPU-кандидат

DEV default OFF: `CanonicalPlanAdapter.diagnosticIdentityFieldCopy`. Разрешён только mode 1, k = ±0, world.z = 0, nearest A без linear-mask bit, совпадающие размеры и формат RGBA8, integer bounded scissor. Существующие проверки mode/device/всех alias/filter/finite uniforms выполняются раньше. Backend ownsLiveField проверяет все семь исходных texture inputs и output, COPY_SRC/COPY_DST проверяются явно. Неизвестный guard означает обычный shader. Copy сохраняет Y-ориентацию и destination вне scissor.

Возвращаемый uniform имеет явный nullable контракт. Adapter retains только реальный GPUBuffer; никаких dummy buffers. Исходный quantum, порядок, копии последующих операций и ACK не меняются. Успешный copy считается только после encode; при исключении uniform не создан. OFF остаётся исходным shader.

CPU Q8 oracle проверяет все 131072 пары значений a/b при ±0. Это не замена shader compiler proof. Actual whole endpoint и 10 Q8 roles OFF/ON пока не проверены; аппаратных запусков кандидата не было.

Польза ограничена двумя tail parity-copy dispatch в первом group tide. По проверенному caa UI остаётся 361.3 мс second DOWN→submit: около 209.1 мс до finish и 123.6 мс prior publication queue-prefix ACK. Tiny copy не объявляется решением UX.

Следующее существенное направление — исходные 12 tail mode-5 blur passes, но separable blur нельзя внедрять как точную замену: другая сумма и дополнительный/удалённый Q8 boundary. Можно исследовать direct target routing без изменения всех шести stride, weights и Q8 outputs: rim последний blur в mask при неalias source, tide смена первого scratch выбора, чтобы последний blur сразу оказался в t2. Нужно отдельно доказать, что изменённые free scratch bytes не читаются до полного перезаписывания, и guards при произвольном alias/числе stride. Это пока предложение, не код и не заявленный крупный выигрыш.
