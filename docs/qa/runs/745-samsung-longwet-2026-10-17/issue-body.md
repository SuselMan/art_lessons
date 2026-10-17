Связано с ночной кампанией #745 и исходным требованием быстрой загрузки обычных комнат и аннотаций. На настоящем Samsung SM-T970 / Adreno650 загрузка 1000 мокрых M70 операций занимает около 13.6с по внутреннему RoomOpenMeasurement, из них 12.8с — replay.

| Штрихов | Режим | RoomOpen ready, мс | Join | Paper | Replay | Navigation → target-ready |
|---:|---|---:|---:|---:|---:|---:|
|100|normal|1565|393|159|1013|9719|
|100|review|1764|563|147|1054|11678|
|300|normal|4287|486|168|3633|12361|
|300|review|4091|418|147|3526|12399|
|1000|normal|13647|667|163|12816|23223|
|1000|review|13616|634|146|12836|22600|

Вход: 512², 10 Socket.io авторов, по 8 packed dabs на штрих, одна связная область, вода95/пигмент20, без Dry. Для1000 записанные timestamps покрывают29м58.2с, но это ускоренный посев, а не реальное ожидание30мин. Последний материал к каноническому capture имел возраст33.4/33.3с; лужа оставалась мокрой. Flags cache/hidden OFF, стандартный бюджет300MiB. Runtime freeze6cd49722.

Все6 независимых fresh contexts/rooms прошли strict same-Adreno actual canonical BEFORE independent full accepted-history OFF oracle: 0 отличающихся каналов, GL0; все ID/content hashes проверены, 1000ops полностью присутствуют. Это проблема времени готовности, потери данных не обнаружено.

Методология: normal и настоящий `?preview` annotation mode; review использует fallback без cached image export. RoomOpen ready — внутренний join/paper/replay, а не полное время navigation. Большой navigation остаток содержит загрузку JS/private admission/автоматическое заполнение формы: submit документа происходит на6.3–8.3с. Первый draw+2RAF фиксируется до окончания replay: для1000normal8.915с, review8.333с от document performance origin; это частичное изображение, не доказательство полной готовности/физического кадра. Отдельного offset wall navigation↔document performance origin нет. Longtasks observer не устанавливался, main-thread freeze не утверждается.

Один прогон на случай, общий dev QA backend, параллельно часть времени root fullengine CPU1worker и другой GPU-оператор. Это не isolated release benchmark; однако воспроизводимый рост внутреннего replay1.0→3.5→12.8с заметен и требует профилирования. Таймаут45с не увеличивался. Сырые readPixels/GPU дампы не нужны: компактный report содержит16 пространственных ROI/hash, source field hashes, память/diagnostics и2812API ID/content hashes.

Артефакты: `docs/qa/runs/745-samsung-longwet-2026-10-17/{report.json,summary.md}`; harness `docs/qa/harness/728-night/samsung-long-wet-load.cjs` SHA25642d07ec3ed514baae8cb3632d167cc0faee574053b5bd038b15d2c41892d5b37.

Ожидается: локализовать затраты replay/solver/JS без изменения физики и без маскировки частичным first draw; согласовать целевой предел загрузки длинной мокрой истории.
