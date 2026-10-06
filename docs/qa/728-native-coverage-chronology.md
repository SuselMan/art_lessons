# #728 — native chunks и хронология coverage

Источник исследования — Surface, overlay-only `67c5f6e8`. Сохранённый журнал содержит 17 stroke operations и paper_dry: первый мазок `normal:0:100` — сухой пигмент, второй и плотные зигзаги `normal:100:100`. Native Dry отличается от стабильных remote replay/rebuild при том же журнале. Это расхождение изображения, а не исчезновение рисунка.

## Lossless Surface oracle

HOME `680-combined-stability/temp/surface-dense-{native,replay}.png`, analysis/compare рядом. Физический экспорт 1754×2480. В обоих изображениях alpha=255 всюду; alpha byteexact. RGB отличается на 744130 пикселях, max64, лишь 242 пикселя имеют delta>8. Premultiplied результат идентичен raw. Signed RGB sums native−replay: +2189,+1992,+3525. Низкая alpha и глобальная утрата пигмента не объясняют наблюдение.

## Причинный аппаратный контроль

Контроллер `temp/history-parity/chunk-chronology{.html,.mjs}`. HOME зеркало `680-water-wet-tone-qa`, 5316. Реальная Vega, один owned Chrome; физический640×480, кисть400, один native зигзаг с тремя диагностически заданными chunk boundaries. Это не точное восстановление Surface pointer events: их временная последовательность не сохранена.

Первый прогон: native async endpoint→checkpoint-free rebuild 17390 изменённых пикселей, max255, только10 delta>8. Единственная абляция — завершить previous same-scratch settle перед следующим native source: два forced completion, endpoint exact0. GL0/lostfalse, Chrome закрыт.

Повтор снимал вход `_settlePlan.prepare`, уже ПОСЛЕ штатного completion предыдущего job в `_finishRibbonStroke`, а не преждевременный finish-entry. Native async: 28812 пикселей/max15/17 delta>8. На всех трёх чанках bounded P/C/filmP/C/V/strokeV/original/dry/context ROI byteexact с rebuild. На чанках2/3 отличается только coverage. С forced completion source включая coverage и итог PNG exact0. Все GL0, Chrome закрыт.

`coverage-analysis.json`: отличаются только .r (координата поперёк кисти, native excess до203) и .g (pool metadata, excess1–2); .b воды и .a contact byteexact. Все различия .r/.g положительные в снятых ROI. В текущем copyback mode20 MAX объединяет ВСЕ RGBA: максимум двух across-coordinate не является хронологическим source-over. Следующий native film может уже перезаписать координату, когда previous settle возвращает более высокий старый .r. На replay старый settle завершён до нового source.

Артефакты HOME `680-water-wet-tone-qa/temp/history-parity/chunk-chronology/` и `chunk-chronology-prepare/`: raw report, pre-finish и actual-prepare hashes, coverage-channel analysis, native/rebuild PNG. Поля проверены в двух128×96 ROI, не по всей текстуре; строго whole PNG проверен отдельно. В двух независимых native жестах seeds/timings разные: сравнение строго native со СВОИМ recorded rebuild, не PNG двух разных жестов.

## Экспериментальный кандидат

`_wcCoverageFilmRebase` default OFF. Один lazy pool-owned coverage buffer на затронутый tile только при наложении native source на pending previous settle. Source coverage нового film сохраняется отдельно. При copyback r/g получают хронологический source-over old settled coverage→new film; b/a сохраняют прежний MAX. P/C/V/solver не меняются.

Буфер освобождается при landing/abort/destroy; context loss forget не возвращает dead handles. Snapshot/spill с незавершённым rebase отвергаются, вместо записи неполного continuation. Restore не включает tracking неизвестного film. 3 lifecycle CPU tests проходят; actual web app typecheck, lint и map:check проходят.

GPU кандидата ещё НЕ проверен. RGBA8 source-over неассоциативен из-за округлений: отдельный film может оставить1–2LSB против прежней per-dab хронологии. Если строгий native/rebuild oracle не проходит, кандидат не считается окончательным исправлением; следующий точный путь — replay immutable coverage draw commands нового film на завершённый base. Синхронное completion доказало причину, но не предлагается production, поскольку возвращает GPU hitch на chunk boundary.

### Lazy film — отрицательный аппаратный результат

В Vega OFF/film/complete прогоне на новом native жесте для каждого варианта: OFF16242px/max58/23 delta>8; film24994px/max40/21 delta>8; complete0. Все P/C/V ROI exact, coverage film неexact. GL0/lostfalse/ownedChromeCLOSED. HOME `temp/history-parity/coverage-film/`. `f109413b` НЕ является готовым исправлением и не должен интегрироваться.

### Следующая реализация: immutable команды

Буфер теперь хранит прежний coverage BASE до нанесения нового running film, не сгруппированную текстуру нового film. После предыдущего solver только r/g base восстанавливаются в его фактическом overlap. Затем выполняется прежний MAX copyback и сохранённые source-over draw команды следующего film, в прежнем порядке, с scissor overlap и colorMaskRG. b/a не перерисовываются. Dab, tile, preset/profile и across uniforms копируются при записи, band vertices копируются в независимый Float32Array; новые mutable ссылки на текущий кадр не сохраняются. DefaultOFF путь не записывает команды/не копирует vertices. При release/abort/destroy очищаются и texture, и список команд. При context loss они забываются без GL release. Shader source полностью возвращён к предыдущей реализации, новых shader режимов больше нет.

91 targeted CPU tests PASS (watercolor/parked/lifecycle, включая4 новых lifecycle), actual app+SW typecheck PASS и lint PASS со старыми warnings. GPU версии immutable commands ещё не выполнен на момент этой записи; strict endpoint exact0 остаётся требованием.
