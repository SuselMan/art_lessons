# #796 — явная политика канонического M70 prepare

База 477be600. Утверждённые свойства M70 теперь определяются записанным
materialModel=m70-r2-v1 внутри WatercolorSettlePlan.prepare: contacts OFF,
paired optical colour ON, preserveBrushField ON. DEV diagnostic gates остальных
моделей сохранены. NativeTarget/controller больше не подменяют эти три флага.
При старом QA DEV-входе все три эффективных boolean остаются прежними.

Новый реальный prepare-test запускает dev=true/false и bare caller без diagnostic
flags: один/два пигмента, single-point/noTravel и recorded travel. Сравнивает
упорядоченные вызовы material passes и их аргументы, нормализуя только identity
буферов между engines. Проверяет реальные paired/preserve/contact paths.
MockGL не доказывает shader RGBA или crossGPU parity.

На исходном WatercolorSettlePlan из 477be600: 4 M70 tests FAIL, оба legacy
negative PASS. На исправленном Plan: все 6 PASS. Первый baseline показывает
разное число/содержимое material calls (126 против188 в single-paint noTravel).

## Отдельный незакрытый build/config риск

index.ts: _puddleFor ставит diagnosticNativeFieldMinimum=1024, но
_diffuseFieldFor учитывает его только при _watercolorReview. Последний сам
DEV&&options.watercolorReview. В production native minimum остаётся1536.
Эта геометрия поля может менять material result и memory; её здесь не меняли.
Также review-gated specializedWatercolorNib требует отдельной проверки. Этот
коммит устраняет три доказанных prepare-policy расхождения, не утверждает
полную идентичность DEV/production движка и не исправляет #748.
