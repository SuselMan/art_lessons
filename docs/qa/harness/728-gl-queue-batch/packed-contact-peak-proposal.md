# Fusion упаковки B и поиска peak: CPU-only

Фактический путь GL: eager brushDragContacts/brushDragField, candidate brushDragFieldHoisted, lazy brushDragFieldWork → CanonicalWatercolorSettlePlan.contactOps → brushDragMaxExposure. Один exp уже общий vx/vy/weight; perellipse bounds уже ограничены. Выявлено только дополнительное линейное чтение encoded B после packing.

Prototype PackedContactPeak.mjs считает peak из УЖЕ СОХРАНЁННОГО Uint8Array байта, не исходного float/Math.round: NaN→0, modulo256, negative/wrap сохраняются. Exposure использует тот же peak0→+0, −log(max(1−peak/255,1/255)); никаких FP reassociation или изменения substeps/gain.

Private WeakMap certificate не обнаруживает внешнюю мутацию typed array. Поэтому trusted путь ДОПУСТИМ ТОЛЬКО если свежий payload остаётся закрытым между packing и contactOps, не выдаётся observer/cache/caller/worker и не используется изменяемое shared backing. Опция exclusiveUnexposedPayload в harness — явная предпосылка, не runtime guard. Expose/mutation должно revoke; untrusted/copied/cache/legacy fields fallback к полному scan. Заморозить непустой typedarray Object.freeze нельзя; checksum проверка уничтожит выигрыш.

Предложение integration после review: certified поле у fresh private producer result; consumption непосредственно до первого bind/upload; все eager/lazy/hoist producers должны одинаково выдавать storedBytePeak. Более безопасная альтернатива без certificate API — считать exposure внутри producer и сразу передать owned scalar в закрытой closure contactOps, не менять external brushDragField API. Отдельные float workspace массивы можно переиспользовать: packed pixels каждый раз отдельный Uint8Array, качество и очередность30uploads не меняются. Shader/pulses/canonical untouched.

4 CPU tests PASS: stored conversion finite/NaN/Infinity/±0/wrap/256byte domain, identical complete RGBA packing, invalidated/untrusted/copied fallback, workspace reuse. Не actualGPU/artistquality proof.

Один bounded VPS synthetic benchmark (30fields/side, fixed order): 128² pack+scan15.56ms vs fused13.75; 256²63.31 vs71.29 (ХУЖЕ); 384²154.06 vs145.91. Не суммировать как реальный corpus: размеры synthetic. Вывод неоднозначный, не внедрять по обещанию производительности. Всеcontact Math.exp/raster/realdevice вне измерения. Runtime edits отсутствуют.
