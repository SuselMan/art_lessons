# #680: перенос пигмента независимым объёмом воды

Изолированный эксперимент от `7fdcc459`, `agents/680-solvent-flux`. Выключен по умолчанию: `setWatercolorAb({ ..., solventFlux: true })`. Не публиковался и не предназначен для пользовательского стенда.

Принцип: пигмент перемещается долей консервативного потока воды `q / Vdonor`, а не отдельным выталкиванием к обводу. Движущий напор — дополнительная вода `max(V − base, 0)`. Вязкость зависит от фактического `P.b / V`, не старого совместного carrier alpha.

## Доказательства CPU на настоящих полях

Spiral и stationary compact blob: реальные recorded operations, frozen5297, combined delivery / bottomless independent V. Канонический pre-front P RGBA и V; source solventBase захвачен до releaseFilm. V source/canonical byte-identical, геометрия совпадает, GL0, context alive. ROI680×600 внутри канонического поля1536²: вода на всех краях ROI отсутствует. Raw captures, скрипты и отчёты находятся в соседней рабочей копии `680-spiral-spread/temp/spiral/actual-*`.

В отличие от прежнего surrogate, реальная неподвижная клякса тоже добавляет воду. Отсутствие движения не означает отсутствие потока жидкости. Контроль с V=base даёт exact byte no-op для P обоих кейсов.

CPU зеркало byte-оператора, world-strides16/8/4 два цикла,12 операций по граням: наружная доля actual P.b —0.896% у спирали,2.706% у кляксы. Суммы всех4actualP каналов и V сохраняются точно в байтах, отрицательных значений, превышения255 и отрицательного V-base нет. Constant-concentration invariant доказан предыдущим float oracle; независимое byte-округление может отклонять концентрацию на квант, поэтому точный float invariant не заявляется для byte-версии. Actual C не захвачен как paired mobile depth: singleTau восстанавливает его позже, это не GPU-доказательство массы восьми компонентов.

## Ограниченный GPU прототип

Standalone lazy shader, без увеличения Adreno bookkeeping program. Двенадцать направленных face steps,24draws (P+V), immutable old P/V для обоих выходов. Каждая связь проверяет мокрость всех промежуточных texels; q ограничивается общей вместимостью V и всех P компонентов принимающей точки. Передача округляется вниз в целых байтах и симметрично вычитается/добавляется.

Это **replacement** legacy carry для данного A/B, а не дополнительный перенос поверх него. Front/domain и последующие settle stages остаются; окончательную картинку ещё надо проверить. Транспорт допускается только после начального штриха чистой водой, для первого ненулевого pigment stroke и одного цвета. Физический serial увеличивается только при beginStroke, не при newFilm/chunk: live-разбиение не меняет purity gate. Прямой мокрый мазок без предварительной воды сохраняет прежний carry даже при включённом флаге. Gate хранится в scratch snapshot/spill metadata; восстановленное старое неизвестное состояние не допускается, наличие GPU texture не служит доказательством чистоты.

При1536² две дополнительные RGBA8 scratch textures требуют18MiB (baseV+nextV). Владение регистрируется до следующей аллокации; finish возвращает их в pool, abandoned/context-loss lifecycle использует существующий owned-solvent set. Программа lazy, удаляется при destroy, ссылка сбрасывается после context restore.

**V меняется только в каноническом scratch этого эксперимента.** Он пока не записывается обратно в persistent entry.solventLoad. Это не solvent ledger и не поддержка следующего pigment gesture: тот исключён metadata gate. Нельзя включать эксперимент глобально или переносить на multi-paint без отдельного решения.

До review нужны Vega pixels/GL, контроль кляксы и grain/fingers, load/rebuild, затем настоящий salted Samsung compile. Длинные связи — ускоренная гидравлическая модель, не доказанная эквивалентность локальному PDE. Прототип может быть отвергнут по картинке или стоимости.

## Vega QA ac0db4e2: технически проходит, картинка не принята

2026-10-05 22:23–22:24 UTC, standalone5299, один Chrome на4small synthetic cases (не полный userstroke), затем отдельный Chrome на direct negative. Оба закрытыfinally; shadercompiledреально впервые на этом runtime. Все6кейсов GL0/no-context-loss.

| Кейс | Flux draws | Ошибка массы P RGBA | Ошибка суммы V | P.b снаружи seed |
|---|---:|---|---:|---:|
| small spiral |24|0/0/0/0|0|1.579%|
| compact blob |24|0/0/0/0|0|3.694%|
| direct wet100 |0|negative control PNG byte-identical|—|—|

Файлы `temp/flux/gpu/{report.json,*-pre/post-P/V.rgba,*.png}`, `temp/flux/direct/`, `temp/flux/metrics.json`, `temp/flux/compare.jpg` наVPS/домашнейкопии. Исходные4componentP суммы успирали9598658каждая, послеexactтеже; уblob1090992каждая, послетеже. Никакого скрытого clamp/mass loss.

Визуально: светлое внутреннее кольцо исчезло, ядро стало слитнее. Но наружные пальцы/grain заменены слишком гладким круглым ореолом, особенно у кляксы. Поэтому этот вариант **не интегрировать и не передавать на пользовательский review**. Load/rebuild и saltedSamsungcompile не выполнялись: сначала нужна более правильная картинка. Wallcase11s spiraloff/on и5.3/6.6s bloboff/on включают дополнительное readbackon, это не GPU timing.

Следующий эксперимент: консервативный q/V перенос с проводимостью существующего бумажного front-cost по каждой грани. Не добавлять обратно legacy carry поверх этого оператора и не вводить отдельную шумовую маску. Проверить симметрию conductance, mass/headroom/negative controls, затем отдельный короткий GPU A/B.
