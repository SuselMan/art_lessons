# #765: пустой prewarm и публикация снимков

До исправления настоящий engine/controller пропускал `_snapshotQuiet` у пустого
слоя, затем `setActiveLayer` создавал через 50 мс пустой prewarm и gate навсегда
возвращал false. Regression FAIL после 51 мс; четыре прежних prewarm tests PASS.
Ни context, ни tile, ни записанного мокрого материала у этого source не было.

Теперь controller различает владение ресурсом (`has`) и наличие материала
(`hasMaterial`). Snapshot quiet и checkpoint guard не считают доказанно пустой
prewarm водой. Настоящие источники и parked CPU material по-прежнему блокируют
публикацию: вытеснение из GPU не высушивает слой. Wall-clock expiry не менялась.

После интеграции #747/#764/#760: 63 targeted tests / 9 файлов PASS; web TypeScript
PASS, scoped lint без ошибок, карта архитектуры покрывает 1086 файлов.
Полный engine suite и аппаратная QA нового источника выполняются отдельно.
