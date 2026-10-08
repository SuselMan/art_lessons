# Текущий OFF / original42 / target61

Preparation только: frozen root00ce885e, current bundle1 900 853 bytes создан в existing own `temp/ring-current-off`; GPU не запускался. Journal42 SHAecbb146ddd9ecf3b6c3c46cc289245d92cbf246cf8225490eea70a9dee3ce1d9. Source engine/shared hashes, bundle/probe hashes и target61 сохраняются passport.json. DEFAULT physics, constructor gradientFibres=true как Room, phase/ADDfalse. Обычный Room/ACK не проверяются.

Подготовка (без устройства):

```sh
WC_RELEASE_ROOT=/home/suselman/projects/pencil-agents/680-water-wet-tone WC_RING_EXISTING=/home/suselman/projects/pencil-agents/728-ring-expanded-gates/temp/regression WC_QA_OUT=/home/suselman/projects/pencil-agents/728-bounded-ui-optin/temp/ring-current-off node docs/qa/harness/728-ring-current/prepare.mjs
```

Root должен разместить только current.mjs в существующем отдельном trusted QA origin с уже имеющимися baked paper assets. Не публиковать в production. Затем, ТОЛЬКО после освобождения Surface:

```sh
WC_GPU_SLOT=granted WC_RELEASE_ROOT=/home/suselman/projects/pencil-agents/680-water-wet-tone WC_QA_OUT=/home/suselman/projects/pencil-agents/728-bounded-ui-optin/temp/ring-current-off WC_CDP_BASE=http://127.0.0.1:9455 WC_STAGE_URL="$RING_STAGE_URL" node docs/qa/harness/728-ring-current/run.mjs
```

RING_STAGE_URL — приватный существующий QA каталог, не placeholder действующей публикации. Контроллер проверяет servedbundle SHA, создаёт/закрывает только свой target, исполняет прежний regression/probe.js с одной явно отмеченной заменой constructor gradientFibres=true. ROI910,455–1264,721, capture targetGEiXT33N5K/seq61,42original/41execution, originalDry плюс штатный watercolorDryAll, opaque/premult endpoints и GL/lost/lifecycle. Материал sums не является fixed-profile доказательством.

**Граница stage profile:** existing `728-live-onset-current/temp/onset/sheet3-stage-function.js` нельзя запускать как currentOFF: он принудительно включает private asyncFinish/sourceFilmRebase/gradient и warm, задаётphase. Его `sheet3-profiles.py` уже имеет нужный фиксированный алгоритм: Manhattan signed distance −20..20 от pre-carry original-P.b>0 и wet-V.r>0, averages P.b/C.a/V.r/coverage.g/cost.r. Перед вторым stage шагом нужно перенести только wrapper/capture на current planner без этих flag assignments и проверить5meaningfulstages/ONEtarget/matchinginput maps. Этот endpoint harness НЕ выдаёт недостающие plane bytes и НЕ притворяется готовым stage gate. Первый OFF endpoint нужен, чтобы вообще подтвердить остаточное кольцо после уже принятого density fix; затем root решает stage/ADD A/B.

Синтаксис обоих scripts проверен; actual build PASS. Hardware/render/profile ещё не выполнены. Устройство, доступ, GPU shader validation и визуальный endpoint этим не подтверждаются.
