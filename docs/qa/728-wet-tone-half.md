# #728: читаемый водяной тон 0.50

Илья22:11 явно уточнил: на чистой бумаге половина интенсивности до исходного fix, вместо слишком слабого0.35. Узкая поправка PAPER_COMPOSE_FRAG: bare-paper share0.35→0.50; underpaint остаётся0.12. Пигмент/вода P/C/V, solver, сухой composite и формат операций не меняются. На местах частичного покрытия прежний smoothstep по coverage плавно смешивает эти коэффициенты.

SamsungSM-T970/Adreno650, собственная unique5316/tone-review728.html вкладка1231:31 salted cold programs,0fail, GL0/lostfalse, finally own tab closed. Frozen реальные material fields: baseline(доfix),current0.35/0.12,desired0.50/0.12 менялись только shader PAPER_COMPOSE. Desired live мокрая бумага визуально различима мягким серым тоном; поверх густой сухой краски остаётся заметно слабее. Это аппаратный screen capture, не подтверждение субъективной оценки Ильи. Скрин640×480 canvas, физический640×480 fine, отдельный движок, не обычная RoomUI.

Все три canonical transparent PNG во время воды byte-exact0. Dry→реальный rebuild существующего tone слоя→UndoRedo, затем baseline-program rebuild/Redo:0различающихся пикселей. На этом source уже проверен отдельный rect-original candidate4fdf04e2; это не сведение двух source изменений в один коммит.

Raw VPS temp/device-runs/samsung728-tone.json и samsung728-tone-*.png; HOME680-water-wet-tone-qa/temp/history-parity/samsung728/analysis.json, rawPNG+report. HTML/controller temp/history-parity/tone-review728.html и samsung-tone.mjs. Исходные прежние samsung-tone-* материалы сохранены/восстановлены из HOME temp/history-parity/pre728-samsung. Ни push, ни deploy не выполнялись.
