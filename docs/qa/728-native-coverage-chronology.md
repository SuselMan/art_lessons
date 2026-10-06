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

## Source sampler chronology: bounded causal follow-up

On the unchanged `34d7be81` source, full-buffer per-channel hashes/sums at
actual settle preparation show that immutable coverage command replay makes
coverage RGBA agree, but does not restore the entire material input. Chunk 2
still has `strokeInk.g` +1712 and solvent-film r/a −200 in native painting.
Consequently this candidate is not a complete native/history parity fix.

The follow-up instrumented each actual mode-7 nib draw before execution,
recording numeric inputs and the sampled coverage texture. Accepted segment
mode already processes V then P per dab; the earlier whole-batch ordering
hypothesis is excluded. All 42 corresponding source draw inputs are identical.
Without completing the previous settle, 27 draws read different coverage,
starting with the first V nib in the next chunk at (486.578918, 215.848694).
Its coverage sums are native `[25205612,2086756,49829262,49829262]` versus
history `[25305105,2086756,50027484,50337190]`; opacity is 0.25 in both.
The immediately following pigment draws read the same differing texture.
The V source uses coverage.a as a multiplier; the pigment source reads b/a.
Completing the old settle before subsequent source eliminates all sampler
and numeric-input differences. Both arms have GL0 and retained contexts.
This localizes a real input chronology difference, rather than proving that
all original Surface differences share this cause.

Raw HOME: `680-water-wet-tone-qa/temp/history-parity/source-inputs/report.json`.
The diagnostic controller is `temp/history-parity/source-inputs.{html,mjs}`.
Readback instrumentation is diagnostic and is not a performance measurement.
The hardware Chrome closed in finally. No shader or physical operator changed.

A coverage-only correction at old-job completion occurs too late to repair
already deposited V/P. A next candidate must preserve the canonical ordering
of source sampling as well, with bounded ownership of immutable commands and
material film state, or separate immediate presentation from queued canonical
source painting. Blindly MAX-merging coordinates or ignoring b/a differences
is not a valid correction. Existing candidate flags remain default OFF.

## Opt-in full source-command rebase (57792769)

The bounded prototype restores old coverage before old-job landing, clears only
new-film material buffers afterwards, and replays immutable coverage/V/P/C and
base+film combine commands in their original order. Old settled ink/color bases
are preserved. No CPU brush clocks or contact metadata are advanced again.
No shader changes or full synchronous settle on the input handler were added.
The experiment remains default OFF (`_wcSourceFilmRebase`). Its command replay
currently runs in old-job finish and is not yet a responsiveness improvement.

Real Vega paired three-chunk oracle:

| Arm | Native vs checkpoint-free rebuild changed pixels | Maximum | Pixels >8 |
| --- | ---: | ---: | ---: |
| Ordinary native | 34204 | 255 | 20 |
| Source-command rebase | 0 | 0 | 0 |
| Complete-before-source control | 0 | 0 | 0 |

At each of three actual prepare boundaries the source-rebase and complete arms
match full-buffer per-channel FNV hashes and integer sums for original, coverage,
P/C loads and films, solvent loads/films and present dry material fields. Captured
ROI bytes also match. Ordinary native diverges at boundaries 2 and 3. Whole PNG
is the strict full-image endpoint oracle; FNV checks alone are not a cryptographic
proof of texture identity. All arms GL0, contexts retained, owned Chrome closed.
Raw HOME: `680-water-wet-tone-qa/temp/history-parity/source-rebase/`.

Actual web typecheck passed; actual workspace oxlint passed with existing
warnings; six lifecycle tests passed. Follow-up gates remain: larger original
native fixture, multiple tiles/chunks, context-loss cancellation, memory and
latency. This small private-engine result does not establish full Surface parity
or smoothness and is not authorization to enable the flag in production.
