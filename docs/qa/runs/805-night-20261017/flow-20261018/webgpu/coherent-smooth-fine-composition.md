# Связный coarse поток + smooth fine бумага

Новый `macro18-coherent-fine.ts` / `coherentFineDefinitions` / `wgsl-macro-coherent-smooth-fine-paper` объединяет две уже проверявшиеся ветки. Root actual V15:25численных случаев fine/null0-vs12 прошли, guards0, opaque exact; картинка гладкая с зерном, но похожа на airbrush. Root V16: coherent curl0 совпал с mobility3, ненулевой stream заметнее менял форму, two-stroke mixing21→33%. Это мотивация конкретной композиции, не гарантия её качества.

## Важная связь factory/upload

Подмена только `basePairSourceOverride` НЕ переносит coherent модель: macro14 строит ψ на CPU в upload и кладёт его в aux.w. Новый FineOverrides.baseFactory выбирает настоящую macro14create с её upload; options.observePacking передаёт borrowed states/stationary/output. Coherent shader и upload остаются владельцами своего поля. Root/material агент владеет fourth-hook macro14, наша ветка его не переписывает.

Macro17 затем отдельно реконструирует M/D, macro11 выполняет fine mobile transport. Metadata basePhysicalModel явно coherent; mobility-only подпись override не выдаётся за фактический coarse алгоритм. Coherent fourth API пока не поддерживаетstateHash — такого обещания нет. Строится artistic streamfunction, не Navier–Stokes; фактические gated donor flux не обязаны оставаться divergence-free. Fine initialization floor/local fallback и independent deposited proxy сохраняют прежние ограничения.

Контроли:256coarse/12fine/paperGain3/curl128/eddy16; curl0припрочихравных; fine0контроль; более сильный mobility6/eddy24 как дополнительный параметр. Новых shaders или buffers по сравнению с самой выбранной композицией wrapper не добавляет. Пересчёт поля/загрузка идут в upload, а не в compile.

2CPU PASS: actual full wrapper fieldSHA и каждый aux upload word совпадают с прямым coherentcreate при одинаковом input/params; ненулевой stream подтверждён; curl0пишет нулевое поле; fine0 сохраняет настоящую factory; borrowed output/readback/ledger/cleanupexact, rejectedbase освобождает fine buffers. TypeScript/lint PASS. Это CPU lifecycle/source proof, actual GPU и художественное качество ожидаются от оператора.
