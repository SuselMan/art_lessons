# #778: восстановление M70 сохраняет мокрые границы

Baseline: recoveryOperations отбрасывал scoped paper_dry и restamp всех timestamps
сливал natural120s epochs. Два engine/real controller + scratch CPU snapshots,
NativeTarget mock: accepted A→Dry→B и A→gap120100ms→B имели source bounds
12,12..38,38; recovered source ошибочно включал A: -8,-8..38,38.

Scoped Dry теперь принимается как context, но без content в группе не создаёт
новый слой. Группа с явно записанным M70 material tag сохраняет original timestamps
для всех своих операций; отдельные legacy/nonM70 группы и retargetToLayer по
умолчанию restamp как прежде. Новые operation/layer IDs сохраняются. Новый seq
задаёт фактический порядок replay; timestamps сохраняют только material chronology.

Два material regression после fix сравнивают source bounds, water/pigmentUsed и
все CPU material buffers с accepted-history reference. Дополнительно Dry-only,
global Dry exclusion, scoped-layer retarget и legacy restamp проверены отдельно.
MockGL не доказывает аппаратную GLSL точность. #777 durable handoff остаётся OPEN;
существующие debounce/maxwait batch boundaries и timestamp-sort/tie правила этим
исправлением не менялись. Отсутствующий/поздно пришедший Dry вне доступной группы
этот локальный replay-plan восстановить не может.
