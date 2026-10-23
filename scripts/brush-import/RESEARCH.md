# Исследование форматов и формул, 23.10.2026

В работе использованы публичные описания параметров и факты о структурах файлов.
Код Krita и конвертера Freya Lupen в Grafetto не копировался; читатели и renderer
реализованы самостоятельно. Коммерческие изображения кистей остаются вне Git.

## Проверенные источники

- [Procreate Brush Studio](https://help.procreate.com/procreate/handbook/5.4/brushes/brush-studio-settings): назначение параметров, зависимость от пера, Wet Mix, grain, taper.
- [Procreate Dual Brush](https://help.procreate.com/procreate/handbook/5.3/brushes/dual-brush): два независимо настраиваемых компонента и Combine Mode.
- [Freya Lupen: Procreate → Krita](https://invent.kde.org/freyalupen/procreate-to-krita-brush-converter), исследован commit `e4015e7a994a0bcca05daed842e5dab195f1be39`: числовые идентификаторы blend modes и имена полей. Сам автор помечает ряд transfer functions неизвестными и Wet Mix неподдержанным. Это не опубликованная формула движка Procreate.
- [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/): уравнения стандартных режимов, включая Soft Light и неразделимые Hue/Saturation/Color/Luminosity. Наши реализации дополнительно сравниваются с независимым Canvas2D compositor.
- [ag-psd ABR](https://github.com/Agamnentzar/ag-psd/blob/master/src/abr.ts) и [pattern reader](https://github.com/Agamnentzar/ag-psd/blob/master/src/psdReader.ts): Action Descriptors, VMAL и indexed palette. MIT.
- [BrushBox: ABR structure](https://github.com/Stef4678/brushbox/blob/main/docs/abr-format-spec.md): структура legacy/modern records. Вычисляемые legacy records там также остаются непрозрачными, поэтому мы не подменяем их круглой кистью.
- [Krita presets](https://docs.krita.org/en/reference_manual/resource_management/paintoppresets.html): KPP — PNG с XML, миниатюра не является наконечником.
- [Krita preset format](https://github.com/KDE/krita/blob/master/libs/image/brushengine/kis_paintop_preset.cpp): расположение preset/version и встроенных ресурсов версии5.0. PNG допускает текст после IDAT; reader должен загрузить изображение перед чтением info.
- [Krita setting identifiers](https://github.com/KDE/krita/blob/master/libs/image/brushengine/KisPaintopSettingsIds.cpp): префикс `MaskingBrush/Preset/`, режим маски и отношение размеров.
- [Krita GBR](https://github.com/KDE/krita/blob/master/libs/brush/kis_gbr_brush.cpp): поля заголовка и положительное покрытие одноканального GBR.

## Что удалось уточнить

Вместо общей подстановки Normal/Multiply читаются известные режимы Procreate.
Неизвестный числовой код остаётся явным compatibility warning, включая некоторые
режимы высоты зерна. Гамма-корректное смешивание использует линейный sRGB; исходный
ICC profile стороннего приложения оно не воспроизводит.

Азимут считается из записанных наклонов пера через их тангенсы, отдельно от
направления движения. Наклон и скорость могут одновременно менять размер,
прозрачность, подачу, форму и глубину зерна. Pressure roundness и pressure transfer
больше не теряются. Неизвестные шкалы исходных ползунков обозначаются приближением.

У второго компонента отдельная последовательность отпечатков, flow, динамики,
зерно, оптическое покрытие и ограниченный хвост; он использует тот же renderer.
На мокром родителе компонент действует через отдельную маску, а подбор цвета с
холста остаётся у родительского резервуара. Это ещё не доказанная модель двух
независимых цветовых резервуаров Procreate. Обратная перекомпозиция уже положенного
мокрого штриха ради вторичного end taper также не заявляется.

## Граница доказательств

Проверки Grafetto доказывают согласованность live/peer/chunks/undo/replay и
отсутствие ошибок GL в проверенных случаях. Эталонные штрихи Photoshop/Procreate
не предоставлены; Илья перенёс сравнение в приложениях на следующий день.
Точная vendor pixel equivalence не заявляется. Отсутствующие bundled изображения
Procreate нельзя восстановить только по имени; такие пресеты пропускаются.

## Krita sensor follow-up, rendering version4

Primary sources read: [KisKritaSensorPack.cpp](https://github.com/KDE/krita/blob/master/plugins/paintops/libpaintop/KisKritaSensorPack.cpp),
[KisSensorData.cpp](https://github.com/KDE/krita/blob/master/plugins/paintops/libpaintop/KisSensorData.cpp),
[KisDynamicSensorIds.h](https://github.com/KDE/krita/blob/master/plugins/paintops/libpaintop/KisDynamicSensorIds.h),
[KisScatterOptionData.cpp](https://github.com/KDE/krita/blob/master/plugins/paintops/libpaintop/KisScatterOptionData.cpp).
Read for serialized identifiers and format semantics; no implementation code copied.

Single sensors and ChildSensor lists, UseSameCurve/commonCurve, legacy Curve<Option>
and product combination mode0 are decoded. Size/Opacity/Flow/Scatter use the common
runtime modulation contract (up to4 supported sensors). Pressure, elevation, X/Y tilt,
azimuth, speed and drawing direction retain individual transfer points. Curve points
are linearly interpolated; Krita cubic interpolation and speed scaling are approximate.
Twist, tangential pressure, time, fuzzy and distance/fade are explicitly unsupported
in this importer. Non-product combinations are reported rather than silently multiplied.
[KoCompositeOpRegistry.h](https://github.com/KDE/krita/blob/master/libs/pigment/KoCompositeOpRegistry.h) provides native blend IDs, including spaces in `linear light`, `hard mix`, `darker color` and `lighter color`.
Scatter radius is bounded to the shared limit4, with source distribution/axis orientation
reported as approximate. Krita descriptor version4 distinguishes this conversion;
other format converters remain rendering version3.
