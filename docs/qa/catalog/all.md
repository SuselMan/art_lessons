# Общий список тесткейсов Grafetto

375 самостоятельных определений:152 браузерных/API с 180 вариантами, 195 исторических/контрактных и 28 специальных акварельных/device сценариев. Ещё 38 старых ID сохранены как обзорные группы и в это число не входят.

Фильтровать поиском по странице, ID, теме или файлу. Это определения, не результат исполнения. Для текущей версии NOT RUN до отдельного run; [известные результаты](results.md). [Наборы](suites.md) и [запуск](execution.md).

| ID | Тема / проверка | Тип автоматизации |
|---|---|---|
| [QA-025](watercolor.md#qa-025) | акварель/device — Живые вода и пигмент до отпускания пера | special harness / ручная подготовка |
| [QA-026](watercolor.md#qa-026) | акварель/device — Чужой пигмент зависит от воды автора | special harness / ручная подготовка |
| [QA-027](watercolor.md#qa-027) | акварель/device — Один жест из нескольких принятых частей | special harness / ручная подготовка |
| [QA-028](watercolor.md#qa-028) | акварель/device — Послойная сушка и переход через её границу | special harness / ручная подготовка |
| [QA-029](watercolor.md#qa-029) | акварель/device — Ластик над сухой подложкой и мокрой акварелью | special harness / ручная подготовка |
| [QA-030](watercolor.md#qa-030) | акварель/device — Несколько мокрых слоёв и выгрузка | special harness / ручная подготовка |
| [QA-031](watercolor.md#qa-031) | акварель/device — Следующее действие не стирается поздней акварелью | special harness / ручная подготовка |
| [QA-032](watercolor.md#qa-032) | акварель/device — Живой обычный мазок во время Undo и snapshot | special harness / ручная подготовка |
| [QA-033](watercolor.md#qa-033) | акварель/device — Отключение после UP при живой соседней вкладке | special harness / ручная подготовка |
| [QA-034](watercolor.md#qa-034) | акварель/device — Позднее подтверждение после ухода с доски | special harness / ручная подготовка |
| [QA-035](watercolor.md#qa-035) | акварель/device — Устаревшее восстановление снимка | special harness / ручная подготовка |
| [QA-036](watercolor.md#qa-036) | акварель/device — Пустой и частичный снимок, холодный хвост, Undo головы | special harness / ручная подготовка |
| [QA-037](watercolor.md#qa-037) | акварель/device — Защищённая вода переживает обратимую границу | special harness / ручная подготовка |
| [QA-038](watercolor.md#qa-038) | акварель/device — Переход естественного времени через 120 секунд | special harness / ручная подготовка |
| [QA-039](watercolor.md#qa-039) | акварель/device — Потеря GPU-контекста с входящими действиями | special harness / ручная подготовка |
| [QA-040](watercolor.md#qa-040) | акварель/device — Заполненная мокрая комната | special harness / ручная подготовка |
| [QA-041](watercolor.md#qa-041) | акварель/device — Видимая стоимость Undo100 | special harness / ручная подготовка |
| [QA-042](watercolor.md#qa-042) | акварель/device — Один M70-журнал на разных GPU | special harness / ручная подготовка |
| [QA-043](watercolor.md#qa-043) | акварель/device — Смена доски и проверка своего replay | special harness / ручная подготовка |
| [QA-044](watercolor.md#qa-044) | акварель/device — Подтверждённый checkpoint обгоняет pending мазки | special harness / ручная подготовка |
| [QA-045](watercolor.md#qa-045) | акварель/device — Восстановление отвергнутого рисунка и несколько пачек | special harness / ручная подготовка |
| [QA-046](watercolor.md#qa-046) | акварель/device — Две модели акварели на разных слоях | special harness / ручная подготовка |
| [QA-047](watercolor.md#qa-047) | акварель/device — Реальный получасовой онлайн soak | special harness / ручная подготовка |
| [QA-048](watercolor.md#qa-048) | акварель/device — Непрерывная мокрая эпоха без Dry | special harness / ручная подготовка |
| [QA-049](watercolor.md#qa-049) | акварель/device — Размер страницы и границы тайлов M70 | special harness / ручная подготовка |
| [QA-050](watercolor.md#qa-050) | акварель/device — Загрузка по готовому review export без replay | special harness / ручная подготовка |
| [QA-051](watercolor.md#qa-051) | акварель/device — Аппаратное перо, ладонь и жесты | special harness / ручная подготовка |
| [QA-052](watercolor.md#qa-052) | акварель/device — Настоящий урок и длительная touch-серия | special harness / ручная подготовка |
| [QA-201](browser.md#qa-201) | браузер — Каждый материал онлайн | точный E2E/API тест |
| [QA-202](browser.md#qa-202) | браузер — Вход по ссылке review | точный E2E/API тест |
| [QA-203](browser.md#qa-203) | браузер — Перо аннотаций | точный E2E/API тест |
| [QA-204](browser.md#qa-204) | браузер — Текстовая аннотация | точный E2E/API тест |
| [QA-205](browser.md#qa-205) | браузер — Ластик аннотаций | точный E2E/API тест |
| [QA-206](browser.md#qa-206) | браузер — Камера после создания доски | точный E2E/API тест |
| [QA-207](browser.md#qa-207) | браузер — Следование по доскам | точный E2E/API тест |
| [QA-208](browser.md#qa-208) | браузер — Цикл работы в классе | точный E2E/API тест |
| [QA-209](browser.md#qa-209) | браузер — Paste после закрытия рамки | точный E2E/API тест |
| [QA-210](browser.md#qa-210) | браузер — Paste в другую комнату | точный E2E/API тест |
| [QA-211](browser.md#qa-211) | браузер — Paste в исходную комнату | точный E2E/API тест |
| [QA-212](browser.md#qa-212) | браузер — Clipboard в уже открытой вкладке | точный E2E/API тест |
| [QA-213](browser.md#qa-213) | браузер — Сходимость при росте участников | точный E2E/API тест |
| [QA-214](browser.md#qa-214) | браузер — Разные материалы одновременно | точный E2E/API тест |
| [QA-215](browser.md#qa-215) | браузер — Цвет из палитры | точный E2E/API тест |
| [QA-216](browser.md#qa-216) | браузер — Цвет при активном ластике | точный E2E/API тест |
| [QA-217](browser.md#qa-217) | браузер — Цвет выключенной заливки фигуры | точный E2E/API тест |
| [QA-218](browser.md#qa-218) | браузер — Цвет в общей палитре | точный E2E/API тест |
| [QA-219](browser.md#qa-219) | браузер — Открытие и закрытие color well | точный E2E/API тест |
| [QA-220](browser.md#qa-220) | браузер — Пиксели после GPU restore | точный E2E/API тест |
| [QA-221](browser.md#qa-221) | браузер — Undo после GPU restore | точный E2E/API тест |
| [QA-222](browser.md#qa-222) | браузер — Жест прерван потерей GPU | точный E2E/API тест |
| [QA-223](browser.md#qa-223) | браузер — Входящий штрих во время GPU loss | точный E2E/API тест |
| [QA-224](browser.md#qa-224) | браузер — Жёсткость цифровой кисти | точный E2E/API тест |
| [QA-225](browser.md#qa-225) | браузер — Opacity цифровой кисти | точный E2E/API тест |
| [QA-226](browser.md#qa-226) | браузер — Первый штрих | точный E2E/API тест |
| [QA-227](browser.md#qa-227) | браузер — Второй штрих | точный E2E/API тест |
| [QA-228](browser.md#qa-228) | браузер — Сквозной ластик и Undo | точный E2E/API тест |
| [QA-229](browser.md#qa-229) | браузер — Хоткей сквозного ластика | точный E2E/API тест |
| [QA-230](browser.md#qa-230) | браузер — Обычный ластик | точный E2E/API тест |
| [QA-231](browser.md#qa-231) | браузер — Пипетка возвращает инструмент | точный E2E/API тест |
| [QA-232](browser.md#qa-232) | браузер — Заливка замкнутой области | точный E2E/API тест |
| [QA-233](browser.md#qa-233) | браузер — Заливка заблокированного слоя | точный E2E/API тест |
| [QA-234](browser.md#qa-234) | браузер — Заливка в нижней части листа | точный E2E/API тест |
| [QA-235](browser.md#qa-235) | браузер — Волосная линия гибкой кисти | точный E2E/API тест |
| [QA-236](browser.md#qa-236) | браузер — Тап с дрейфом по панели | точный E2E/API тест |
| [QA-237](browser.md#qa-237) | браузер — Перетаскивание за пределы кнопки | точный E2E/API тест |
| [QA-238](browser.md#qa-238) | браузер — Drag тела панели | точный E2E/API тест |
| [QA-239](browser.md#qa-239) | браузер — Тап пустого слота | точный E2E/API тест |
| [QA-240](browser.md#qa-240) | браузер — Hold пустого слота | точный E2E/API тест |
| [QA-241](browser.md#qa-241) | браузер — Начальная раскладка панели | точный E2E/API тест |
| [QA-242](browser.md#qa-242) | браузер — Состав chooser слота | точный E2E/API тест |
| [QA-243](browser.md#qa-243) | браузер — Назначение инструмента слоту | точный E2E/API тест |
| [QA-244](browser.md#qa-244) | браузер — Перенос назначения | точный E2E/API тест |
| [QA-245](browser.md#qa-245) | браузер — Очистка слота | точный E2E/API тест |
| [QA-246](browser.md#qa-246) | браузер — Группа следует внешнему выбору | точный E2E/API тест |
| [QA-247](browser.md#qa-247) | браузер — Повторный тап группы | точный E2E/API тест |
| [QA-248](browser.md#qa-248) | браузер — Hold группы меняет слот | точный E2E/API тест |
| [QA-249](browser.md#qa-249) | браузер — Тап действует без chooser | точный E2E/API тест |
| [QA-250](browser.md#qa-250) | браузер — Раскладка между комнатами | точный E2E/API тест |
| [QA-251](browser.md#qa-251) | браузер — Неизвестный инструмент в сохранённой раскладке | точный E2E/API тест |
| [QA-252](browser.md#qa-252) | браузер — Миграция старой раскладки | точный E2E/API тест |
| [QA-253](browser.md#qa-253) | браузер — Рамка импортированной картинки | точный E2E/API тест |
| [QA-254](browser.md#qa-254) | браузер — Импорт при выделении | точный E2E/API тест |
| [QA-255](browser.md#qa-255) | браузер — Бесконечная комната | точный E2E/API тест |
| [QA-256](browser.md#qa-256) | браузер — Мышь не перехватывает перо | точный E2E/API тест |
| [QA-257](browser.md#qa-257) | браузер — Комната без пароля | точный E2E/API тест |
| [QA-258](browser.md#qa-258) | браузер — Пароль после отказа | точный E2E/API тест |
| [QA-259](browser.md#qa-259) | браузер — Встречные переносы папок | точный E2E/API тест |
| [QA-260](browser.md#qa-260) | браузер — Конкурирующие свойства слоя | точный E2E/API тест |
| [QA-261](browser.md#qa-261) | браузер — Переименование выделяет имя | точный E2E/API тест |
| [QA-262](browser.md#qa-262) | браузер — Группировка выделенных слоёв | точный E2E/API тест |
| [QA-263](browser.md#qa-263) | браузер — Gaussian Blur и отмена | точный E2E/API тест |
| [QA-264](browser.md#qa-264) | браузер — Cancel фильтра | точный E2E/API тест |
| [QA-265](browser.md#qa-265) | браузер — HSL lightness | точный E2E/API тест |
| [QA-266](browser.md#qa-266) | браузер — Чужой штрих во время preview | точный E2E/API тест |
| [QA-267](browser.md#qa-267) | браузер — Удалённая цель фильтра | точный E2E/API тест |
| [QA-268](browser.md#qa-268) | браузер — Локальный Solo | точный E2E/API тест |
| [QA-269](browser.md#qa-269) | браузер — Жесты Solo | точный E2E/API тест |
| [QA-270](browser.md#qa-270) | браузер — Удаление Solo-слоя | точный E2E/API тест |
| [QA-271](browser.md#qa-271) | браузер — Подтверждение выхода | точный E2E/API тест |
| [QA-272](browser.md#qa-272) | браузер — Back внутри редактора | точный E2E/API тест |
| [QA-273](browser.md#qa-273) | браузер — Freeze комнаты | точный E2E/API тест |
| [QA-274](browser.md#qa-274) | браузер — Freeze участника | точный E2E/API тест |
| [QA-275](browser.md#qa-275) | браузер — Открытие закрытого урока | точный E2E/API тест |
| [QA-276](browser.md#qa-276) | браузер — Reopen до broadcast | точный E2E/API тест |
| [QA-277](browser.md#qa-277) | браузер — Копия ученика | точный E2E/API тест |
| [QA-278](browser.md#qa-278) | браузер — Запрет во время жеста | точный E2E/API тест |
| [QA-279](browser.md#qa-279) | браузер — Задержка пера у участника | точный E2E/API тест |
| [QA-280](browser.md#qa-280) | браузер — Потерянная цель offline операции | точный E2E/API тест |
| [QA-281](browser.md#qa-281) | браузер — Ошибка бумаги и retry | точный E2E/API тест |
| [QA-282](browser.md#qa-282) | браузер — Paste обновляет уменьшенный вид | точный E2E/API тест |
| [QA-283](browser.md#qa-283) | браузер — История до прихода | точный E2E/API тест |
| [QA-284](browser.md#qa-284) | браузер — Новый штрих у наблюдателя | точный E2E/API тест |
| [QA-285](browser.md#qa-285) | браузер — Ошибка сборки комнаты | точный E2E/API тест |
| [QA-286](browser.md#qa-286) | браузер — Следование камере другого | точный E2E/API тест |
| [QA-287](browser.md#qa-287) | браузер — Телефонный список и удаление | точный E2E/API тест |
| [QA-288](browser.md#qa-288) | браузер — Карточка создаваемой копии | точный E2E/API тест |
| [QA-289](browser.md#qa-289) | браузер — Ошибка копии в списке | точный E2E/API тест |
| [QA-290](browser.md#qa-290) | браузер — Копия среди поисковых результатов | точный E2E/API тест |
| [QA-291](browser.md#qa-291) | браузер — Ошибка copy-and-open | точный E2E/API тест |
| [QA-292](browser.md#qa-292) | браузер — Loader до входа в копию | точный E2E/API тест |
| [QA-293](browser.md#qa-293) | браузер — Обрыв при входе в копию | точный E2E/API тест |
| [QA-294](browser.md#qa-294) | браузер — Позднее продолжение вытесненной заливки | точный E2E/API тест |
| [QA-295](browser.md#qa-295) | браузер — Собственный offline штрих | точный E2E/API тест |
| [QA-296](browser.md#qa-296) | браузер — Работа других пока offline | точный E2E/API тест |
| [QA-297](browser.md#qa-297) | браузер — Offline удаление общего слоя | точный E2E/API тест |
| [QA-298](browser.md#qa-298) | браузер — Запоминание материала | точный E2E/API тест |
| [QA-299](browser.md#qa-299) | браузер — Временный жест не запоминается | точный E2E/API тест |
| [QA-300](browser.md#qa-300) | браузер — Быстрый review до слоёв | точный E2E/API тест |
| [QA-301](browser.md#qa-301) | браузер — Upload review не удался | точный E2E/API тест |
| [QA-302](browser.md#qa-302) | браузер — Новый user gesture для Share | точный E2E/API тест |
| [QA-303](browser.md#qa-303) | браузер — Legacy preview без export | точный E2E/API тест |
| [QA-304](browser.md#qa-304) | браузер — Review текущей доски | точный E2E/API тест |
| [QA-305](browser.md#qa-305) | браузер — Rename сохраняет урок | точный E2E/API тест |
| [QA-306](browser.md#qa-306) | браузер — Отмена rename | точный E2E/API тест |
| [QA-307](browser.md#qa-307) | браузер — Rotation lock | точный E2E/API тест |
| [QA-308](browser.md#qa-308) | браузер — Возврат 100% zoom | точный E2E/API тест |
| [QA-309](browser.md#qa-309) | браузер — Узкая шапка | точный E2E/API тест |
| [QA-310](browser.md#qa-310) | браузер — Повторный вход в метриках | точный E2E/API тест |
| [QA-311](browser.md#qa-311) | браузер — Медленный вход завершился | точный E2E/API тест |
| [QA-312](browser.md#qa-312) | браузер — Поздний finish метрики | точный E2E/API тест |
| [QA-313](browser.md#qa-313) | браузер — Превью обычной комнаты | точный E2E/API тест |
| [QA-314](browser.md#qa-314) | браузер — Новая линейка | точный E2E/API тест |
| [QA-315](browser.md#qa-315) | браузер — Перенос линейки | точный E2E/API тест |
| [QA-316](browser.md#qa-316) | браузер — Поворот конца линейки | точный E2E/API тест |
| [QA-317](browser.md#qa-317) | браузер — Delete выделения | точный E2E/API тест |
| [QA-318](browser.md#qa-318) | браузер — Cut выделения | точный E2E/API тест |
| [QA-319](browser.md#qa-319) | браузер — Delete на locked слое | точный E2E/API тест |
| [QA-320](browser.md#qa-320) | браузер — Многоугольное лассо | точный E2E/API тест |
| [QA-321](browser.md#qa-321) | браузер — Кнопки выделения | точный E2E/API тест |
| [QA-322](browser.md#qa-322) | браузер — Finger tap снимает выделение | точный E2E/API тест |
| [QA-323](browser.md#qa-323) | браузер — Тап внутри выделения | точный E2E/API тест |
| [QA-324](browser.md#qa-324) | браузер — Pan сохраняет выделение | точный E2E/API тест |
| [QA-325](browser.md#qa-325) | браузер — Редактируемый прямоугольник | точный E2E/API тест |
| [QA-326](browser.md#qa-326) | браузер — Клик фигурой без drag | точный E2E/API тест |
| [QA-327](browser.md#qa-327) | браузер — Esc незаконченной фигуры | точный E2E/API тест |
| [QA-328](browser.md#qa-328) | браузер — Handles после UP | точный E2E/API тест |
| [QA-329](browser.md#qa-329) | браузер — Shift квадрат | точный E2E/API тест |
| [QA-330](browser.md#qa-330) | браузер — Рисование каждым типом фигуры | точный E2E/API тест |
| [QA-331](browser.md#qa-331) | браузер — Растушёвка на шве | точный E2E/API тест |
| [QA-332](browser.md#qa-332) | браузер — Вход из snapshot | точный E2E/API тест |
| [QA-333](browser.md#qa-333) | браузер — Недоступный snapshot blob | точный E2E/API тест |
| [QA-334](browser.md#qa-334) | браузер — HTTP доступ без socket | точный E2E/API тест |
| [QA-335](browser.md#qa-335) | браузер — Одна кнопка материалов | точный E2E/API тест |
| [QA-336](browser.md#qa-336) | браузер — Два тапа группы | точный E2E/API тест |
| [QA-337](browser.md#qa-337) | браузер — Выбор материала группы | точный E2E/API тест |
| [QA-338](browser.md#qa-338) | браузер — Hold группы без смены | точный E2E/API тест |
| [QA-339](browser.md#qa-339) | браузер — Группа фигур | точный E2E/API тест |
| [QA-340](browser.md#qa-340) | браузер — Единственный материал | точный E2E/API тест |
| [QA-341](browser.md#qa-341) | браузер — Вкладка настроек следует инструменту | точный E2E/API тест |
| [QA-342](browser.md#qa-342) | браузер — Размер store доходит до движка | точный E2E/API тест |
| [QA-343](browser.md#qa-343) | браузер — Смена инструмента доходит до движка | точный E2E/API тест |
| [QA-344](browser.md#qa-344) | браузер — Transform после UP | точный E2E/API тест |
| [QA-345](browser.md#qa-345) | браузер — Undo незавершённого move | точный E2E/API тест |
| [QA-346](browser.md#qa-346) | браузер — Resample на границе тайлов | точный E2E/API тест |
| [QA-347](browser.md#qa-347) | браузер — Поздний seq своего штриха | точный E2E/API тест |
| [QA-348](browser.md#qa-348) | браузер — Рука в телефонных аннотациях | точный E2E/API тест |
| [QA-349](browser.md#qa-349) | браузер — Minimal UI по умолчанию | точный E2E/API тест |
| [QA-350](browser.md#qa-350) | браузер — Базовый Undo/Redo | точный E2E/API тест |
| [QA-351](browser.md#qa-351) | браузер — Версия в Settings | точный E2E/API тест |
| [QA-352](browser.md#qa-352) | браузер — Версия в globalThis | точный E2E/API тест |
| [QA-401](historical.md#qa-401) | auth — Вход гостя и устаревшая cookie | unit-support + ручной acceptance |
| [QA-402](historical.md#qa-402) | auth — Запрос кода email | unit-support + ручной acceptance |
| [QA-403](historical.md#qa-403) | auth — Неверный email и отказ провайдера | unit-support + ручной acceptance |
| [QA-404](historical.md#qa-404) | auth — Код только своему браузеру | unit-support + ручной acceptance |
| [QA-405](historical.md#qa-405) | auth — Одноразовость и срок кода | unit-support + ручной acceptance |
| [QA-406](historical.md#qa-406) | auth — Неверные попытки кода | unit-support + ручной acceptance |
| [QA-407](historical.md#qa-407) | auth — Cooldown повторного письма | unit-support + ручной acceptance |
| [QA-408](historical.md#qa-408) | auth — Rate limit почты и IP | unit-support + ручной acceptance |
| [QA-409](historical.md#qa-409) | auth — Гость становится аккаунтом | unit-support + ручной acceptance |
| [QA-410](historical.md#qa-410) | auth — Смена email при входе | unit-support + ручной acceptance |
| [QA-411](historical.md#qa-411) | auth — Код не выдаётся production клиенту | unit-support + ручной acceptance |
| [QA-412](historical.md#qa-412) | auth — Бан до и после отправки кода | unit-support + ручной acceptance |
| [QA-413](historical.md#qa-413) | auth — Отзыв сессий | unit-support + ручной acceptance |
| [QA-414](historical.md#qa-414) | auth — Идентификатор устройства и IP | unit-support + ручной acceptance |
| [QA-415](historical.md#qa-415) | access — Владелец не определяется гонкой join | unit-support + ручной acceptance |
| [QA-416](historical.md#qa-416) | access — Открытая комната с паролем | unit-support + ручной acceptance |
| [QA-417](historical.md#qa-417) | access — Приглашение по email | unit-support + ручной acceptance |
| [QA-418](historical.md#qa-418) | access — Очередь ожидания | unit-support + ручной acceptance |
| [QA-419](historical.md#qa-419) | access — Отказ запроса и чужой requestId | unit-support + ручной acceptance |
| [QA-420](historical.md#qa-420) | access — Invitation разрешает ожидающий запрос | unit-support + ручной acceptance |
| [QA-421](historical.md#qa-421) | access — Block участника и unblock | unit-support + ручной acceptance |
| [QA-422](historical.md#qa-422) | access — Owner не блокирует себя | unit-support + ручной acceptance |
| [QA-423](historical.md#qa-423) | access — Изменение режима и password | unit-support + ручной acceptance |
| [QA-424](historical.md#qa-424) | access — Контент дочерней доски | unit-support + ручной acceptance |
| [QA-426](historical.md#qa-426) | access — Доступ после удаления пользователя | unit-support + ручной acceptance |
| [QA-427](historical.md#qa-427) | projects — Список только своих уроков | unit-support + ручной acceptance |
| [QA-428](historical.md#qa-428) | projects — Папки списка и права | unit-support + ручной acceptance |
| [QA-429](historical.md#qa-429) | projects — Цикл папок проектов | unit-support + ручной acceptance |
| [QA-430](historical.md#qa-430) | projects — Удаление непустой папки проектов | unit-support + ручной acceptance |
| [QA-431](historical.md#qa-431) | projects — Выход участника из коллекции | unit-support + ручной acceptance |
| [QA-433](historical.md#qa-433) | projects — Копия в исходной папке | unit-support + ручной acceptance |
| [QA-434](historical.md#qa-434) | projects — Права и настройки копии | unit-support + ручной acceptance |
| [QA-435](historical.md#qa-435) | projects — Новые ID операций копии | unit-support + ручной acceptance |
| [QA-436](historical.md#qa-436) | projects — Структурные операции в копии | unit-support + ручной acceptance |
| [QA-437](historical.md#qa-437) | projects — Копия тяжёлой комнаты без полной кучи | unit-support + ручной acceptance |
| [QA-438](historical.md#qa-438) | projects — Копия урока со всеми досками | unit-support + ручной acceptance |
| [QA-439](historical.md#qa-439) | projects — Превью после ухода socket | unit-support + ручной acceptance |
| [QA-440](historical.md#qa-440) | projects — Валидация и кеширование thumbnail | unit-support + ручной acceptance |
| [QA-441](historical.md#qa-441) | layers — Drop слоя в закрытую папку | unit-support + ручной acceptance |
| [QA-442](historical.md#qa-442) | layers — Перенос папки с содержимым | unit-support + ручной acceptance |
| [QA-443](historical.md#qa-443) | layers — Вложенные папки и запрет цикла | unit-support + ручной acceptance |
| [QA-444](historical.md#qa-444) | layers — Merge внутри папки | unit-support + ручной acceptance |
| [QA-445](historical.md#qa-445) | layers — Merge/delete с чужим содержимым | unit-support + ручной acceptance |
| [QA-446](historical.md#qa-446) | layers — Восстановление слоя после merge/delete | unit-support + ручной acceptance |
| [QA-447](historical.md#qa-447) | layers — Undo удаления в серверном зеркале | unit-support + ручной acceptance |
| [QA-448](historical.md#qa-448) | layers — Hidden слой не принимает рисунок | unit-support + ручной acceptance |
| [QA-449](historical.md#qa-449) | layers — Локальный и владельческий замок | unit-support + ручной acceptance |
| [QA-450](historical.md#qa-450) | layers — Замок всех редакторских действий | unit-support + ручной acceptance |
| [QA-451](historical.md#qa-451) | layers — Дубликат слоя и папки | unit-support + ручной acceptance |
| [QA-452](historical.md#qa-452) | layers — Активный слой после reload | unit-support + ручной acceptance |
| [QA-453](historical.md#qa-453) | engine — Смена цвета не перекрашивает прошлое | unit-support + ручной acceptance |
| [QA-454](historical.md#qa-454) | engine — Острый угол быстрого штриха | unit-support + ручной acceptance |
| [QA-455](historical.md#qa-455) | engine — Плотность не зависит от report rate | unit-support + ручной acceptance |
| [QA-456](historical.md#qa-456) | engine — Скорость по timestamp пера | unit-support + ручной acceptance |
| [QA-457](historical.md#qa-457) | engine — Прерывания длинного жеста на zoom | unit-support + ручной acceptance |
| [QA-458](historical.md#qa-458) | engine — Наклон пера и азимут хвата | unit-support + ручной acceptance |
| [QA-459](historical.md#qa-459) | engine — Крупный твёрдый карандаш | unit-support + ручной acceptance |
| [QA-460](historical.md#qa-460) | engine — Равномерный маркер внутри жеста | unit-support + ручной acceptance |
| [QA-461](historical.md#qa-461) | engine — Конец сегмента маркера | unit-support + ручной acceptance |
| [QA-462](historical.md#qa-462) | engine — Маркер не делает подложку непрозрачной | unit-support + ручной acceptance |
| [QA-463](historical.md#qa-463) | engine — Стык чанков маркера | unit-support + ручной acceptance |
| [QA-464](historical.md#qa-464) | engine — Растушёвка без белого ореола | unit-support + ручной acceptance |
| [QA-465](historical.md#qa-465) | engine — Preview peer тем же материалом | unit-support + ручной acceptance |
| [QA-466](historical.md#qa-466) | engine — Переход импорта к следующей операции | unit-support + ручной acceptance |
| [QA-467](historical.md#qa-467) | engine — Undo импортированной картинки | unit-support + ручной acceptance |
| [QA-468](historical.md#qa-468) | engine — Изображение за границей холста | unit-support + ручной acceptance |
| [QA-469](historical.md#qa-469) | engine — Размер и hit area gizmo | unit-support + ручной acceptance |
| [QA-470](historical.md#qa-470) | engine — Второй жест transform-сессии | unit-support + ручной acceptance |
| [QA-471](historical.md#qa-471) | engine — Transform pending ACK и Esc | unit-support + ручной acceptance |
| [QA-472](historical.md#qa-472) | engine — Transform reload и тап вне рамки | unit-support + ручной acceptance |
| [QA-473](historical.md#qa-473) | paper — Зерно world-space на infinite | unit-support + ручной acceptance |
| [QA-474](historical.md#qa-474) | paper — Масштаб графита и бумаги | unit-support + ручной acceptance |
| [QA-475](historical.md#qa-475) | paper — Шов baked paper | unit-support + ручной acceptance |
| [QA-476](historical.md#qa-476) | paper — Вид бумаги и качество на GPU | unit-support + ручной acceptance |
| [QA-477](historical.md#qa-477) | paper — Смена бумаги и загрузка кода | unit-support + ручной acceptance |
| [QA-478](historical.md#qa-478) | paper — Safari совместимость бумаги | unit-support + ручной acceptance |
| [QA-479](historical.md#qa-479) | snapshots — Снимок плюс Undo не стирают прошлое | unit-support + ручной acceptance |
| [QA-480](historical.md#qa-480) | snapshots — Слои вне окна server log | unit-support + ручной acceptance |
| [QA-481](historical.md#qa-481) | snapshots — Снимок пустой структуры не затирает живую | unit-support + ручной acceptance |
| [QA-482](historical.md#qa-482) | snapshots — Ошибка восстановления тайла видна | unit-support + ручной acceptance |
| [QA-483](historical.md#qa-483) | snapshots — Нижняя полоса clipped snapshot | unit-support + ручной acceptance |
| [QA-484](historical.md#qa-484) | snapshots — Первый слой после restore | unit-support + ручной acceptance |
| [QA-485](historical.md#qa-485) | snapshots — Потерянный commit seq не глушит bake | unit-support + ручной acceptance |
| [QA-486](historical.md#qa-486) | snapshots — Пустой bake допускает повтор | unit-support + ручной acceptance |
| [QA-487](historical.md#qa-487) | snapshots — Checkpoint без незаписанных чернил | unit-support + ручной acceptance |
| [QA-488](historical.md#qa-488) | snapshots — План восстановления без полной истории | unit-support + ручной acceptance |
| [QA-489](historical.md#qa-489) | snapshots — Сжатый blob и ETag | unit-support + ручной acceptance |
| [QA-490](historical.md#qa-490) | snapshots — Сверка независимых снимков | unit-support + ручной acceptance |
| [QA-491](historical.md#qa-491) | network — Outbox работает без IndexedDB | unit-support + ручной acceptance |
| [QA-492](historical.md#qa-492) | network — Outbox привязан к комнате | unit-support + ручной acceptance |
| [QA-493](historical.md#qa-493) | network — Операция до join получает ответ | unit-support + ручной acceptance |
| [QA-494](historical.md#qa-494) | network — Исключение при operation ACK | unit-support + ручной acceptance |
| [QA-495](historical.md#qa-495) | network — Повторная доставка и server seq | unit-support + ручной acceptance |
| [QA-496](historical.md#qa-496) | network — Permanent и retryable reject | unit-support + ручной acceptance |
| [QA-497](historical.md#qa-497) | network — Автовозврат после shutdown | unit-support + ручной acceptance |
| [QA-498](historical.md#qa-498) | network — Ошибка create/join видна человеку | unit-support + ручной acceptance |
| [QA-499](historical.md#qa-499) | network — Неправильная целевая структура | unit-support + ручной acceptance |
| [QA-500](historical.md#qa-500) | network — HTTP catchup пока socket отсутствует | unit-support + ручной acceptance |
| [QA-501](historical.md#qa-501) | canvas — Дробный zoom на шве тайлов | unit-support + ручной acceptance |
| [QA-502](historical.md#qa-502) | canvas — Экспорт вне viewport | unit-support + ручной acceptance |
| [QA-503](historical.md#qa-503) | canvas — Малый zoom infinite и LOD | unit-support + ручной acceptance |
| [QA-504](historical.md#qa-504) | canvas — Свёртка только когда нужна | unit-support + ручной acceptance |
| [QA-505](historical.md#qa-505) | canvas — Area clear на малом zoom | unit-support + ручной acceptance |
| [QA-506](historical.md#qa-506) | canvas — Большой bounded лист и memory | unit-support + ручной acceptance |
| [QA-507](historical.md#qa-507) | canvas — Восстановление многих слоёв без jetsam | unit-support + ручной acceptance |
| [QA-508](historical.md#qa-508) | canvas — Длинный replay без incomplete FBO | unit-support + ручной acceptance |
| [QA-509](historical.md#qa-509) | canvas — DPR и 100% нативного масштаба | unit-support + ручной acceptance |
| [QA-510](historical.md#qa-510) | canvas — Ось pinch при большом zoom | unit-support + ручной acceptance |
| [QA-511](historical.md#qa-511) | ui — Слайдер пером с ладонью | unit-support + ручной acceptance |
| [QA-512](historical.md#qa-512) | ui — Тап minimal UI и возврат оболочки | unit-support + ручной acceptance |
| [QA-513](historical.md#qa-513) | ui — Курсор кисти на бумаге | unit-support + ручной acceptance |
| [QA-514](historical.md#qa-514) | ui — Touch scroll списка проектов | unit-support + ручной acceptance |
| [QA-515](historical.md#qa-515) | ui — Picker меняет режим без скачка | unit-support + ручной acceptance |
| [QA-516](historical.md#qa-516) | ui — Fullscreen портальные элементы | unit-support + ручной acceptance |
| [QA-517](historical.md#qa-517) | ui — Тост поверх панелей | unit-support + ручной acceptance |
| [QA-518](historical.md#qa-518) | ui — Панель после смены ориентации | unit-support + ручной acceptance |
| [QA-519](historical.md#qa-519) | ui — Модалка перемещения проектов | unit-support + ручной acceptance |
| [QA-520](historical.md#qa-520) | ui — Иконки до загрузки шрифта | unit-support + ручной acceptance |
| [QA-521](historical.md#qa-521) | ui — Safari карточки бумаги | unit-support + ручной acceptance |
| [QA-522](historical.md#qa-522) | ui — Логотип и навигация входа | unit-support + ручной acceptance |
| [QA-523](historical.md#qa-523) | ui — Язык и сохранение настроек | unit-support + ручной acceptance |
| [QA-524](historical.md#qa-524) | ui — Настройки размера и цвета инструмента | unit-support + ручной acceptance |
| [QA-525](historical.md#qa-525) | ui — Hotkeys при текстовом вводе | unit-support + ручной acceptance |
| [QA-526](historical.md#qa-526) | pwa — Свежий документ после обновления | unit-support + ручной acceptance |
| [QA-527](historical.md#qa-527) | pwa — Возврат PWA из фона | unit-support + ручной acceptance |
| [QA-528](historical.md#qa-528) | pwa — SW не перехватывает API/socket | unit-support + ручной acceptance |
| [QA-529](historical.md#qa-529) | pwa — Старая доменная привязка SW | unit-support + ручной acceptance |
| [QA-530](historical.md#qa-530) | server — Ограниченное resident окно | unit-support + ручной acceptance |
| [QA-531](historical.md#qa-531) | server — Комнаты освобождаются после ухода | unit-support + ручной acceptance |
| [QA-532](historical.md#qa-532) | server — Отказ при memory pressure | unit-support + ручной acceptance |
| [QA-533](historical.md#qa-533) | server — Health зависит от БД | unit-support + ручной acceptance |
| [QA-534](historical.md#qa-534) | server — Порог диска и event loop | unit-support + ручной acceptance |
| [QA-535](historical.md#qa-535) | server — Graceful shutdown сохраняет результат | unit-support + ручной acceptance |
| [QA-536](historical.md#qa-536) | server — Бан аккаунта администратором | unit-support + ручной acceptance |
| [QA-537](historical.md#qa-537) | server — Временный IP ban и proxy | unit-support + ручной acceptance |
| [QA-538](historical.md#qa-538) | server — Sentry без чувствительных данных | unit-support + ручной acceptance |
| [QA-539](historical.md#qa-539) | server — Snapshot lag watcher | unit-support + ручной acceptance |
| [QA-540](historical.md#qa-540) | infra — Проверка backup восстановлением | unit-support + ручной acceptance |
| [QA-541](historical.md#qa-541) | infra — Сжатие статических ассетов | unit-support + ручной acceptance |
| [QA-542](historical.md#qa-542) | infra — Две последовательные выкатки | unit-support + ручной acceptance |
| [QA-543](historical.md#qa-543) | infra — Бюджет диска сборок | unit-support + ручной acceptance |
| [QA-544](historical.md#qa-544) | infra — Типизация служебных скриптов | unit-support + ручной acceptance |
| [QA-545](historical.md#qa-545) | engine — Задержка локальной линии | unit-support + ручной acceptance |
| [QA-546](historical.md#qa-546) | engine — Видимая стоимость обычного Undo | unit-support + ручной acceptance |
| [QA-547](historical.md#qa-547) | snapshots — Время входа legacy комнаты | unit-support + ручной acceptance |
| [QA-548](historical.md#qa-548) | engine — Нажим акварели и brushPen | unit-support + ручной acceptance |
| [QA-549](historical.md#qa-549) | ui — Сто коротких штрихов Apple Pencil | unit-support + ручной acceptance |
| [QA-550](historical.md#qa-550) | snapshots — Текст причины восстановления | unit-support + ручной acceptance |
| [QA-551](historical.md#qa-551) | engine — Мелкий chisel без дыр | unit-support + ручной acceptance |
| [QA-552](historical.md#qa-552) | engine — Chisel90° live против replay | unit-support + ручной acceptance |
| [QA-553](historical.md#qa-553) | engine — Антиалиасинг края маркерной ленты | unit-support + ручной acceptance |
| [QA-554](historical.md#qa-554) | ui — Создание без WebGL | unit-support + ручной acceptance |
| [QA-555](historical.md#qa-555) | ui — Неизвестный route | unit-support + ручной acceptance |
| [QA-556](historical.md#qa-556) | snapshots — Количество операций после rejoin | unit-support + ручной acceptance |
| [QA-557](historical.md#qa-557) | engine — Компиляция шейдеров Adreno | unit-support + ручной acceptance |
| [QA-558](historical.md#qa-558) | canvas — LOD маркера и brushPen | unit-support + ручной acceptance |
| [QA-559](historical.md#qa-559) | snapshots — Поздняя structural dependency snapshot | unit-support + ручной acceptance |
| [QA-560](historical.md#qa-560) | layers — Copy/merge мокрого canonical target | unit-support + ручной acceptance |
| [QA-561](historical.md#qa-561) | layers — Историческая копия после позднего Undo source | unit-support + ручной acceptance |
| [QA-562](historical.md#qa-562) | layers — Историческая копия и новый source snapshot | unit-support + ручной acceptance |
| [QA-563](historical.md#qa-563) | layers — Undo merge мокрых источников | unit-support + ручной acceptance |
| [QA-564](historical.md#qa-564) | engine — Новый ввод во время Dry другого слоя | unit-support + ручной acceptance |
| [QA-565](historical.md#qa-565) | engine — Prewarm на неподдержанной геометрии | unit-support + ручной acceptance |
| [QA-566](historical.md#qa-566) | network — Refused live tail после обычного UP | unit-support + ручной acceptance |
| [QA-567](historical.md#qa-567) | network — Flush при неподвижном удержании пера | unit-support + ручной acceptance |
| [QA-568](historical.md#qa-568) | snapshots — Пустой M70 prewarm не блокирует bake | unit-support + ручной acceptance |
| [QA-569](historical.md#qa-569) | network — Resize наблюдателя при held stroke | unit-support + ручной acceptance |
| [QA-570](historical.md#qa-570) | snapshots — Новый snapshot заменяет старую мокрую базу | unit-support + ручной acceptance |
| [QA-571](historical.md#qa-571) | canvas — Fit учитывает панели | unit-support + ручной acceptance |
| [QA-572](historical.md#qa-572) | engine — Deferred Dry не переходит на соседний слой | unit-support + ручной acceptance |
| [QA-573](historical.md#qa-573) | infra — Shared dist в server image | unit-support + ручной acceptance |
| [QA-574](historical.md#qa-574) | infra — Отказ offsite backup не зелёный | unit-support + ручной acceptance |
| [QA-575](historical.md#qa-575) | method — Offline probe действительно обрывает WebSocket | unit-support + ручной acceptance |
| [QA-576](historical.md#qa-576) | method — Bridge join с пустой формой | unit-support + ручной acceptance |
| [QA-577](historical.md#qa-577) | method — Oracle загрузки учитывает snapshot | unit-support + ручной acceptance |
| [QA-578](historical.md#qa-578) | method — M70 модель не теряется в стенде | unit-support + ручной acceptance |
| [QA-579](historical.md#qa-579) | infra — Архитектурная карта подсвечивает связи | unit-support + ручной acceptance |
| [QA-580](historical.md#qa-580) | projects — Создание с custom размером | unit-support + ручной acceptance |
| [QA-581](historical.md#qa-581) | projects — Бумага, цвет и enabled tools при создании | unit-support + ручной acceptance |
| [QA-582](historical.md#qa-582) | projects — Приглашение с другого устройства | unit-support + ручной acceptance |
| [QA-583](historical.md#qa-583) | projects — Создание и rename доски | unit-support + ручной acceptance |
| [QA-584](historical.md#qa-584) | projects — Порядок досок | unit-support + ручной acceptance |
| [QA-585](historical.md#qa-585) | projects — Удаление текущей доски | unit-support + ручной acceptance |
| [QA-586](historical.md#qa-586) | access — Личные доски и приватность класса | unit-support + ручной acceptance |
| [QA-587](historical.md#qa-587) | access — Live stroke чужой личной доски | unit-support + ручной acceptance |
| [QA-588](historical.md#qa-588) | projects — Опоздавший ученик получает работу | unit-support + ручной acceptance |
| [QA-589](historical.md#qa-589) | projects — Spotlight не меняет собственность доски | unit-support + ручной acceptance |
| [QA-590](historical.md#qa-590) | projects — Поднятая рука | unit-support + ручной acceptance |
| [QA-591](historical.md#qa-591) | ui — Пользовательская и общая палитра | unit-support + ручной acceptance |
| [QA-592](historical.md#qa-592) | ui — Калибровка нажима и размеры | unit-support + ручной acceptance |
| [QA-593](historical.md#qa-593) | ui — Числовой ввод параметра | unit-support + ручной acceptance |
| [QA-594](historical.md#qa-594) | ui — Линейка и сетка как выбранный инструмент | unit-support + ручной acceptance |
| [QA-595](historical.md#qa-595) | ui — Справка и поиск по задаче | unit-support + ручной acceptance |
| [QA-596](historical.md#qa-596) | ui — Звук карандаша и настройки | unit-support + ручной acceptance |
| [QA-597](historical.md#qa-597) | ui — Импорт референса не портит соседей | unit-support + ручной acceptance |

## Объединённые дубли

- [QA-425](historical.md#qa-425) → [QA-334](browser.md#qa-334); старый ID сохранён, повторно не считается.
- [QA-432](historical.md#qa-432) → [QA-305](browser.md#qa-305); старый ID сохранён, повторно не считается.

## Сохранённые обзорные группы

Они помогают найти более мелкие кейсы. Не запускать большую группу и её дочерние определения повторно ради увеличения числа проверок.

- [QA-001 — Вход и первые штрихи](../scenarios/collaboration.md#qa-001)
- [QA-002 — Одновременное рисование](../scenarios/collaboration.md#qa-002)
- [QA-003 — Материалы и перезаход](../scenarios/collaboration.md#qa-003)
- [QA-004 — Слои и локальный активный слой](../scenarios/collaboration.md#qa-004)
- [QA-005 — Конфликт структуры слоёв](../scenarios/collaboration.md#qa-005)
- [QA-006 — Авторские Undo/Redo](../scenarios/collaboration.md#qa-006)
- [QA-007 — Preview фильтра](../scenarios/collaboration.md#qa-007)
- [QA-008 — Отключение и возврат сети](../scenarios/collaboration.md#qa-008)
- [QA-009 — Фигуры и выделение онлайн](../scenarios/collaboration.md#qa-009)
- [QA-010 — Совместная мокрая акварель](../scenarios/collaboration.md#qa-010)
- [QA-011 — Рост числа участников](../scenarios/collaboration.md#qa-011)
- [QA-012 — Потеря графического контекста](../scenarios/collaboration.md#qa-012)
- [QA-013 — Несколько источников ввода в одном жесте](../scenarios/collaboration.md#qa-013)
- [QA-014 — Одновременная анимация входящих штрихов](../scenarios/collaboration.md#qa-014)
- [QA-015 — Удаление слоя во время настройки фильтра](../scenarios/collaboration.md#qa-015)
- [QA-016 — Запрет редактирования посреди живого жеста](../scenarios/collaboration.md#qa-016)
- [QA-017 — Разные инструменты на одной области](../scenarios/collaboration.md#qa-017)
- [QA-018 — Финальный кадр акварели на уменьшенном холсте](../scenarios/collaboration.md#qa-018)
- [QA-019 — Cache overflow при повторном построении акварели](../scenarios/collaboration.md#qa-019)
- [QA-020 — Один шаг фоновой выгрузки не блокирует кадр](../scenarios/collaboration.md#qa-020)
- [QA-021 — Локальный zoom при активной совместной комнате](../scenarios/collaboration.md#qa-021)
- [QA-022 — Одинаковый шум акварели и угля на разных GPU](../scenarios/collaboration.md#qa-022)
- [QA-023 — Сохранение всех буферов заливки без CPU-readback](../scenarios/collaboration.md#qa-023)
- [QA-024 — Маркерная лента у границы субпикселя](../scenarios/collaboration.md#qa-024)
- [QA-101 — Цвет, инструмент и его настройки](interface.md#qa-101)
- [QA-102 — Плавающая панель и пустые слоты](interface.md#qa-102)
- [QA-103 — Фигуры, заливка и цифровая кисть](interface.md#qa-103)
- [QA-104 — Выделение, Cut и clipboard между комнатами](interface.md#qa-104)
- [QA-105 — Импорт и преобразование без шва](interface.md#qa-105)
- [QA-106 — Пипетка, линейка и растушёвка](interface.md#qa-106)
- [QA-107 — Ластик через несколько слоёв](interface.md#qa-107)
- [QA-108 — Структура и локальное Solo](interface.md#qa-108)
- [QA-109 — Доски, камера и бесконечная комната](interface.md#qa-109)
- [QA-110 — Класс, ограничения урока и копия ученика](interface.md#qa-110)
- [QA-111 — Вход, пароль, бумага и снимки доступа](interface.md#qa-111)
- [QA-112 — Проекты, копии и превью](interface.md#qa-112)
- [QA-113 — Аннотация, ссылка и готовый review](interface.md#qa-113)
- [QA-114 — Заголовок, выход, версия и метрики входа](interface.md#qa-114)
