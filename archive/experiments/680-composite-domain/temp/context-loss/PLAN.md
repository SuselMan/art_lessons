# Context loss: подготовка, ещё не GPU QA

Источник для запуска — ночная копия 5305 с 9eb2a6fe или явно сверенный последующий release. Не подменять исходники старой локальной 1e49. Один собственный Chrome, новая тестовая комната, wall timeout180s, finally browser.close. Samsung/публичные комнаты не используются.

install-probe.js синтаксически проверен Node. Использует настоящий WEBGL_lose_context; фиксирует события, observed settle и yield реального foreign source. Никакой имитации потерянного контекста через приватный handler. Инструментация не меняет источник P/C/V. Пока не запускалась, готовность сценария не доказана.

1. Обычный settle: native мокрый штрих → pen-up → операция в журнале, дождаться ACK, подтвердить settle ещё активен. Если завершился раньше ACK, сценарий не покрыт: не терять контекст уже после idle и не объявлять overlap PASS. poll() запрашивает loseContext только при реально активном settle.
2. Foreign import: сначала отдельная свежая вода и подтверждённый ACK. Новая wash через штатную смену инструмента. Импорт целевого пигментного штриха лучше запускать из уже ACKed peer operation, а не терять локальное перо до создания его операции. Подтвердить different wash IDs и selected source, arm foreign-import перед обработкой ACKed operation. Первый yielded source вызывает реальную потерю. Не считать незафиксированную native операцию restore oracle.
3. Записать до/после userId/session, engine identity, ordered ids/seq/pending, extension/vendor и все GL ошибки. Restore через300ms. Дождаться contextrestored, !contextLost, solver/queue/rebuild/reveals idle +2rAF, paper-ready и canonical export.
4. Требовать ненулевую alpha до сравнения. Новый Room reader из того же подтверждённого server journal; exact RGBA SHA и dimensions. Отдельно loss/recovery механизма и равенство server replay. Если native initial differed before loss, не смешивать этот известный остаток с восстановлением.
5. cold compile на Adreno здесь не покрыт. Source stamp/checksum, события и PNG/JSON сохранять на диске.
