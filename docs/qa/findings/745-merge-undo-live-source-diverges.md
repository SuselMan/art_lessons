# Undo merge восстанавливает у гостя иной фактический материал

Кампания #745, Vega real GPU CDP19333. Runtime 0c83ca99, frozen.

Repro: fresh512² room, A wet lower stroke, A wet upper stroke; mark lower
unsettled on both clients (QA-only, forces historical fallback); merge;
causal undo merge. Both clients' full-replay lower/upper targets agree.
But actual lower pixels after materializing its current puddle differ on B:
18492bytes, max209. A actual equals oracle. No GL/page errors, queues/rebuilds empty.
Merged actual itself matches replay both clients; this is distinct undo restore failure.

Harness: night-wide/layers.cjs case merge-fallback; fresh ordinary merge case
also queued separately to distinguish forced fallback from normal flow.
Evidence: temp/device-runs/745-final2-merge-fallback/report.json + failure PNG.
Own disposable room retained: qa-undo-v1-0354c224-f933-4afb-a7cb-5b3ae357a650.
Auth not committed. Local oracle hash662f4c20a01b1493fb3e507bc47184a96560dfc2312ce77abea9962da5589384;
B actual877de0fc203b7bdfcacbbaf581422f9b50143fd91f00df1a286e41ecce27a839.

Исправление #754 подтверждено на runtime2f52616d: fresh two-wet-source
merge-fallback + actual undo lower/upper PASS5; оба автора changedBytes0/GL0.
Диагностика: temp/device-runs/745-final4-merge-diagnostic/report.json.
Причина: новый источник удалял чужой sliced replay scratch до его accept;
теперь удаляется только неиспользованный prewarm. Старые disposable rooms
удалены owner API, auth удалён; исходные отчёты и PNG сохранены.
