# #748: отрицательный эксперимент DITHER

На runtime `1e521993` выполнено8 проверок: Intel Surface/AMD Vega × default/off ×2 свежих повтора. Вход — исходные пять операций из `final-disjoint-input.json`, бумагаfine512². Каждый replay выполнен в отдельном пустом disposable-room/browsercontext.

Ветка off отключала DITHER при возврате нового WebGLcontext, до engineconstructor и любых materialclear/render. Проверены раннее true→false, сохранение false до конца и GLerrors0. Приложение и approvedsolver не менялись. Измерения latency не проводились.

На каждом устройстве одинаковы все четыре drytarget и все доступные rawP/C/coverage/solvent и goalP/C/coverage. SameGPU повторяемость точная. МежGPU в обоих режимах остаётся то же расхождение:

| Режим | Отличий каналов | Максимум | >4 | >16 | Alpha |
|---|---:|---:|---:|---:|---:|
| default |2909|14|137|0|934|
| off |2909|14|137|0|934|

AMDtarget `9d3aa5ecb32af53b1ddea80b17be96dec5ec9a8b37d9f7019d814d892ab79ddc`, Inteltarget `2d5bebe503d733ede35a380a3e109b4a004a716d925a729c2d2045412cad501a` — точные прежние baseline. Различия присутствуют уже в исходных rawплоскостях материала, подаваемых в fluid solver; это сужает дальнейшую диагностику до deposition/ribbon и последующего усиления различий.

В этом сценарии отключение DITHER ничего не изменило. Гипотеза не устраняет #748; изменения модели не приняты. Детали: `comparison.json`, `surface.json`, `vega.json`. Это один фиксированный вход, результат не обобщается на все материалы/драйверы.

Восемь собственных disposable-комнат удалены ownerAPI (HTTP200), authкаталоги удалены. Серверная история каждого изолированного replay оставалась пустой: сетевого echo не было. Новый Surface QAChrome/profile/forward убраны. Vega547580/19333 пока сохранён для последней проверки #757; сырые target.bin временно остаются в зарегистрированном TTLcache до его завершения.
