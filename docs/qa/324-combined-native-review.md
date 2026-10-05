# #324 / #680: объединённый native review c1997fee

2026-10-06. Изолированная копия `324-combined-morph-qa`, source строго root `c1997fee`. Home Vite5301, backend4536, `VITE_WC_REVIEW=1`, `VITE_WC_FOREIGN_REVIEW=1`. Пользовательские5290/5313/5277/5289 не менялись. Source SHA проверены перед QA: index.ts `e3ada1ad…`, RibbonStrokePainter.ts `615c5ab9…`, LayerCompositor.ts `d4df519c…`. Paper bake взят из5297. Этот стенд объединяет static own/foreign V, presentation morph, canonical export, reveal lifecycle и canonical solver radius; не новый physical front/backmix solver.

## Настоящий Room UI smoke

Playwright открывает новую локальную комнату через Create form, выбирает Watercolor через material chooser. Нет console `setTool`, private `_onStart` или overrides флагов. Доверенные CDP `Input.dispatchMouseEvent`, pointerType pen, force.6 проходят обычный canvas PointerInput:15moves≈50clientpx. Текущие обычные defaults `normal:55:60:PB29:round`.

UI автоматически включил combined/solvent/foreign/radius. Появилась stroke operation; canonical export изменился на4429px/max206. Кнопка Dry создала paper_dry; кнопка Undo восстановила **точный baseline PNG**. Ready/drawn/dry/undo GL0, context lostfalse, pageerrors[]. Новая local room `d7y-sEpK`; существующие пользовательские комнаты не открывались. Browser finally закрыт. Screenshot dry показывает фактический мазок на обычной бумаге Room, не standalone demo.

Артефакты `temp/combined/ui-pen/{report.json,drawn.png,dry.png,undo.png}`; полный PNG before/painted/after также home по тому же пути. Harness `temp/combined/ui-pen.mjs`. Первый запуск остановился до UI из-за ошибочного Puppeteer-style `browser.process()` (Playwright такого метода не имеет); метод удалён, проверено отсутствие оставшегося owned Chrome, затем выполнен успешный повтор. Это harness ошибка, не ошибка Grafetto.

## Native4 / foreign / dry / undo / full rebuild

Отдельный настоящий PencilEngine с native input, без source flags override: normal100:15 round y150, clearwater100:0 y350, drypigment0:100 round по этой воде y350 (другой preset/wash), normal100:15 chisel y550.15moves каждого, pressure.7/size40. Это отдельный pipeline test, он не заменяет проверку app UI выше.

Automatic combined/record/fluid/solvent/foreign/radius=true, landing fluid, waterPolicy bottomless. Все10 GL checkpoint0, lostfalse. Native dry ↔ redo/full rebuild остаётся **6px/max6/mean.0000017708**; redo ↔ full rebuild точный0. Нельзя объявлять полный multi-stroke native replay exact: один pixel остатка в первом мокром штрихе, пять в области water→drypigment. Whole-image differences перечислены в `source-and-diff.json`.

Pre-source actual SHA записан для7 буферов на15 finish calls. Но ROI был фиксирован x64..320,y96..224: покрывает первый штрих и **не покрывает нижние y350/y550**. Для первого native↔rebuild inkLoad/strokeInk SHA различаются, coverage/inkColor/solventLoad/strokeColor/strokeSolvent точные. Следовательно здесь нет source-exact чистого solver AB; residual не следует автоматически приписывать radius. Для нижних штрихов нельзя использовать пустой/нецелевой ROI как доказательство source equality. Broad Dabcodec/source geometry изменения в этой проверке не делались. Честный ограниченный результат: native UI работает, GL/undo исправлены, playback/rebuild стабилен, tiny native source residual остаётся.

Артефакты `temp/combined/native4/{before.png,redo.png,rebuild.png,report.json,source-and-diff.json,room-ui.png}`; harness `temp/combined/native4.mjs`. Pre-source SHA собирался внутри браузера по bounded RGBA ROI, bytes не отправлялись base64 всех tiles и не сериализовались в большие JSON. Node wall150s, idle60s; успешный run завершился нормально, Chrome finally закрыт.

## Независимая Samsung проверка parent

Parent отдельно проверил5301 c199 обычные automatic canonical/foreign flags: native100:15 round→canonical export→undo/redo/full rebuild.26 salted cold programs/0 failed links, GL0, lostfalse; native/rebuild и redo/rebuild **точный PNG0px/max0**. Предыдущий matched Samsung single-stroke до canonical radius имел525px/max12. Артефакты и подробный Samsung отчёт хранятся у parent, эта запись не выдаётся за самостоятельно выполненную агентом проверку.

Runtime5301 оставлен frozen c199 для дальнейшего review. Ничего не push/deploy, исходники engine не менялись. Visual readiness для полного улучшения воды/спиралей оценивается родителем по отдельным кандидатам; эти smoke tests её не подменяют.
