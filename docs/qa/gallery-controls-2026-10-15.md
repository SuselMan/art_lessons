# Копирование и сравнение версий галереи

По запросу Ильи15.10.2026: кнопка копирования commit SHA у селектора и отдельная versions.html для всех доступных версий выбранного мазка. На странице сравнения: название, version ID, commit, копирование хэша/названия, открытие полной картинки и соседние мазки. Существующее оформление сохранено, изображения в одном ряду выровнены.

Source9d6dacac, ветка agents/728-watercolor-room-integration. UI overlay61efc9da67d5bada публикует3файла отдельно от immutable архива через linux-setup/scripts/gallery/publish_ui.py. Data SHA comments/rendered до/после равны; изображения и история не пересчитывались. Перезапущена только служба галереи для нового read-only UI route.

Chromium до публикации и по живому HTTPS,390/1280px:18доступных версий первого мазка; правильный выбранный8-символьныйSHA и полный40-символьныйSHA, native Clipboard API и fallback внутри modal (буфер предварительно заменён sentinel), копирование названия, открытие новой вкладки, все картинки декодируются, нет горизонтального overflow, переход к соседнему мазку и неизвестный query, pageerrors0/POST0. Audit1885ссылок архива:missing[]. Node syntax и Python compile проверки прошли.

[Browser proof и screenshots](runs/gallery-controls-2026-10-15/live-report.json). Временный browser закрыт; QA disposable удалён после сохранения доказательств. Новых постоянных сервисов нет; UI snapshot остаётся опубликованным. Push не выполнялся.
