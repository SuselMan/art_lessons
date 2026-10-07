# Реальный Surface call graph, 07.10.2026

Код6aa14a43, isolated dev frontend5344, normal QAbackend4539. Два жеста: round400/water100/pigment100/pressure0.8; зигзаг3s с двумя coalesced samples/frame, затем короткий штрих на втором tail rAF. Это scripted PointerInput handlers, не human physical pen timing. Fine1754×2480, fit40%, Surface Chrome154/IntelIrisXe/DPR2. Остальные performanceflagsOFF, joinedTouchON как production.

36 наблюдаемых методов/81 связь. Wrapped sync calls сохраняют this/args/return/throw; generator creation не считается выполнением генератора и исключена. Promise completion не измеряется. Edge — nearest instrumented synchronous caller, а не полный V8 call graph. Сумма totalMs double-counts nested calls; selfMs вычитает только наблюдаемых детей. P95 first≤4096 calls; счётчики/total/max allcalls.

CDP Profiler sampling1ms хранится отдельно. Sampled function hit counts не являются количеством вызовов. NativeGPU time не собран; gl draw/clear/upload длительности — CPU submission, не исполнение GPU. Counter wrappers и dev/React runtime добавляют overhead; baseline без instrumentation отсутствует.

## Факты

- запись7.7915s; motion3.013s/179 rAF intervals/max33ms/0>100ms; tail max817ms;
- instrumented display114calls/self232ms; paintDabs53/self225.2ms; Plan.prepare2/max63.3ms;
- 5235 drawArrays,1512 copyRegionInto,1406 brushPass,671 fieldOp;
- 2 longtasks160/145ms, sampled idle6228.6ms/program340.5ms; idle не доказывает конкретную причину задержки;
- _updateWetTexture49ms self sampled, brushDragField42.2ms, GC28ms. Их точных callcounts в countergraph нет;
- critical Engine/Room/Plan rawSHA совпали с git6aa; paper loaded/normal author matched; 2ACK +2REST ID matches; GL0/lostfalse;
- own Surface Chrome8160/profile/task, forwardsHOME1469738/VPS2616396 и Vite1469314 закрыты. RAM afterclose≈3.55GiB. Чужие stands/devices не изменены.

Raw под temp/callgraph-728/report-1791401737504.json и matching cpuprofile; публичный summary без journalpayload находится docs/qa/callgraph-viewer. Первая попытка1791401667745 имела syntax error в instrumentation до рисования; raw сохранён, в dataset не входит.

record.mjs использует заранее предоставленный owned CDP9453, own frozen5344 и dependencies из680-device-qa-guards. Не запускает браузер/сервер/туннель самостоятельно. Для нового запуска нужны census/owned lifecycle, memory guard и явное согласование этих портов; старые endpoints не переносить слепо. После recording закрывает только собственную target; внешняя exact browser/task/forward cleanup обязательна.

UI проверен browserHTTP200/data/profile,36nodes/5metrics/top20/logscale/detail/mobile390, ошибок JS нет. Изображения temp/callgraph-728/viewer-{desktop,mobile}.png. Raw профиль можно импортировать в Chrome DevTools Performance.
