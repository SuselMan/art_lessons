# PaperWet после Dry: восстановление и redo

Проверка 06.10.2026 на настоящей Vega, замороженный runtime 5307, source
`7e07e8d2`, SHA256 index.ts
`93257e688b0bcbf201b684ba8793df33448320810e098a6ef409ecee4a626430`.
Один собственный Chrome, новые тестовые комнаты, три независимые пары участников.
Chrome закрыт в finally. Исходники, модель и шейдеры не менялись.

Контроллер использует настоящую кнопку Dry, ACK `paper_dry`, реальные
WEBGL_lose_context lost/restored events, Undo/Redo UI и официальный strokeDabs.
Перед восстановлением Dry действительно давал нулевой peak и старую пробу 0.
Свежие читатели открывали тот же подтверждённый серверный журнал.

| Сценарий | Старая проба после Dry | После действия | Свежие читатели |
|---|---:|---:|---:|
| Dry → context restore | 0 | 0.863399 | 0 / 0 |
| Dry → Undo → Redo | 0 | 0.874762 | 0.858568 / 0.844736 |
| Dry → новая вода → restore | 0 | 0.730895 | 0 / 0 |

В третьем случае новая вода размещалась отдельно: до потери контекста старая
проба 0, новая 0.880328; после восстановления новая 0.853773, у свежих читателей
0.840355/0.826511. Её естественное возрастное уменьшение допустимо; возвращение
воды старого высушенного штриха недопустимо независимо от возраста.

Во всех трёх случаях canonical PNG непустой и байтово совпадает с обоими свежими
читателями; GL0, captured faults пустые. Это отдельный дефект эфемерного поля,
а не доказанное изменение сухой краски. Redo воспроизводит его также у свежих
читателей, поэтому проблема шире самого context restore.

Причинный код: `_wetFromForeignStroke` учитывает возраст и preset, но не
`paper_dry`/`layer_clear` в порядке журнала. Replay восстанавливает старые штрихи
без этих метаданных; последующий redo также повторно смачивает их. Lost-ветка
новых подтверждённых операций отдельно пропускает CPU clear/forgetLayer.

Ограниченный план исправления: разрешать восстановление PaperWet только для
операций done после последних применимых Dry/clear в порядке журнала (opID,
не сравнение часов); новые live-пакеты оставить актуальными. Сохранить новую
воду после Dry, исключить undone/revoked источники. CPU metadata Dry/clear во
время потери контекста можно обработать без GL. На момент отчёта это план,
исправление ещё не внесено.

Raw evidence: домашняя копия `680-context-journal/temp/context-loss/dry-state/`
(`report.json`, контроллер и log); локальная копия
`680-context-restore/temp/context-loss/dry-state-result.json`.

## Ограниченное исправление и аппаратный повтор

Кандидат `3d582373` не меняет P/C/V, shader или solver. Все записанные
watercolor-операции проходят проверку opID по done-журналу после последних
упорядоченных Dry/clear. Положительный standing при номинальной воде 0 сохраняется;
возраст проверяется прежним кодом. Live-пакеты без opID не фильтруются.
Set кешируется по revision журнала, инвалидируемой append/confirm/undo/redo/revoke/
hydration. Во время context loss Dry/clear также очищают CPU PaperWet без GL.

Аппаратный повтор на отдельной 5308, настоящая Vega, один Chrome/три новых комнаты:
все три logicalPass/canonicalExact true. После Dry→restore старая проба 0;
после Dry→UndoRedo 0; после Dry→новая вода→restore старая 0, новая 0.853761.
Свежие читатели сохраняют старую пробу 0, новые штрихи мокрыми. PNG непустые,
байтово одинаковые у восстановленного двигателя и обоих свежих читателей.
GL0, captured faults пустые; Chrome закрыт в finally, exit0.

Перед Dry обязательны actual paperReady(), native stroke ACK, wet-проба и
видимая активная кнопка; Dry ACK подтверждён отдельно. Passport index.ts/
OperationLog.ts/hasActiveWater.ts SHA256 совпал локально и в runtime.
Предшествующие непрошедшие прогоны были fixture failures до Dry: в новом mirror
отсутствовали gitignored baked-paper assets; затем ошибочное имя paperLoaded
в контроллере. Они не считаются проверками поведения исправления. Assets
восстановлены, проверка заменена настоящим paperReady(), source не менялся.

CPU: actual app typecheck PASS; OperationLog+watercolor 121 тест PASS;
контекст/eligibility focused PASS, включая zero-preset positive standing,
revoked Dry, ordered barriers, foreign-layer clear и hydration/confirmation
revision. Mapcheck 942 файла PASS, rules 0 errors/4 известных warnings.

Raw: `680-paper-dry-replay/temp/context-loss/fixed-dry-valid2/report.json`
на домашней машине; локально `temp/context-loss/fixed-dry-valid2-result.json`.
