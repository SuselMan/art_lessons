# OFF inherited carry: готовность и граница доказательства

База контроллера 7d66322f; кандидат dda7ecba. Аппаратный запуск не выполнен.
Единственное отличие будущего preview-cohort — INHERITED_CARRY=1 при CARRY_PREVIEW=1.
Остальные water400→pig70 / Float / Direct / Early / Finite / ownSourceSpacing
флаги сохраняются. Канонические параметры и shader не изменяются.

Immutable predecessor geometry захватывается из prepared source chunks того же
слоя/заливки до нового владельца. Используется max текущего и предыдущего
minor-tip radius; вода/wet/standing остаются текущими. Флаг не доказывает
связность: давление и V остаются водными gates; stride1 не перескакивает dry cell.

Паспорт контроллера вычисляется по текущим файлам session/pool/contract/options/
inherited helper/production constants, а не переписывается вручную. Actual flags
проверяются до input; отсутствие inherited/carry не считается ON измерением.
Новый actual tape и новый endpoint обязательны; старый ecd79 endpoint OPEN.

Read-only production formulas:
- RibbonStrokeScratch.noteFinish складывает radius max по finish batches.
- CanonicalWatercolorSettlePlan.prepare получает radius извне; budget =
  watercolorSpreadBudget(radius,water,runWet)/S, radiusC=radius/S.
- spread = clamp[2,160](radius*(.5+.4*w*(.15+.85*l)) +
  60*smoothstep(.75,1,l)); w/l clamp01.
- frontSteps=min(wet-dependent cap,ceil(1.4*budget+radiusC*(1-l))).
- Preview имеет S8; production S определяется bounds/radius и может быть1/2.

Следовательно, размеры UI400/70 и максимумы prepared minor geometry позволяют
вычислить кандидат, но НЕ фактический canonical radius: нужен реальный profile
multiplier/aspect, finish-merge scope, runWet и production S. При w=l=1 radius200
даёт world budget160, radius35 даёт91.5; это условные иллюстрации, не измерение
этой ленты. Нет основания подменить actual prepare probe этим расчётом.

Original SAME-tape prepare probe остаётся OPEN из-за подтверждённого reload.
Контроллер не принимает replacement loader, не перезапускает replay и сохраняет
ошибку отдельно от engine quality. Следующий hardware только по выдаче слота.
