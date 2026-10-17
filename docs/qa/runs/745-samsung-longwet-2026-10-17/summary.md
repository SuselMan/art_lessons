#787: длинная мокрая история на Samsung

6/6 strict exact PASS на runtime `6cd49722`, но загрузка1000операций заметно медленная: внутренний replay12.816/12.836с, RoomOpen ready13.647/13.616с normal/review. Подробные границы и ограничения: [issue-body.md](issue-body.md).

| Случай | Seed ms | RoomOpen ready ms | Engine ms¹ | History ms¹ | Target ms¹ | Oracle verify ms² | Last-material age ms | Diff |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
|100-normal|596|1565|8784|9003|9719|2316|16393|0|
|100-review|567|1764|10802|10999|11678|2329|19069|0|
|300-normal|1748|4287|11416|11619|12361|5260|19701|0|
|300-review|1083|4091|11186|12099|12399|5632|19464|0|
|1000-normal|3793|13647|22211|22711|23223|15958|33387|0|
|1000-review|3553|13616|21620|22191|22600|16371|33262|0|

¹ Wall от начала room-navigation, включая admission/форму; это не внутренний UI ready. ² Отдельная проверка после actual capture, не включена в время готовности. Каждый45с предел соблюдён.

Записанный span для100/300/1000:178200/538200/1798200мс. По10авторов×8dabs, одна связная512²область, без Dry. Это ускоренный recorded-time сценарий, не реальный30-минутный soak. Review — настоящий annotation mode с аннотацией, fallback без cached review image. Snapshot отсутствует, все API IDs присутствуют. FullAPI inputs2812операций независимо проверены по count/uniqueID/contentSHA; report сохраняет каждый ID/hash и16ROI hashes на случай, не только сумму насыщенного изображения.

Частичная видимость отслеживалась _display+2RAF, не screenshot. Для1000 first-visible proxy8.915/8.333с documenttime при submit7.665/7.125с. Полная каноническая готовность наступает позже. Longtasks/maxblock не записаны. Shared QA нагрузка, один прогон на случай: не isolated benchmark.

Cleanup: все6ownedroomsDELETE200, browsercontexts/sockets закрыты finally, исходная вкладка восстановлена, private auth удалён. Только собственный SSH PID4057604/session96718 остановлен; remote9235 и пользовательский Chrome не затронуты. Battery100%AC38.3→38.2°C. Сырой disposable cache `745-samsung-longwet-20261017` сохранён только до guarded finish: unprivileged finish вернул `protected: active process`; root запрошен на штатный privileged finish.
