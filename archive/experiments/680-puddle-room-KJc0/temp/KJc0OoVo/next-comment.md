Продолжение каёмки: guarded plateau cap8 впервые убрал светлое кольцо на исходном seq27. Cap16 также убирает его, но сильнее уплотняет тело; выбрал8 как минимальный кандидат. Каждый промежуточный texel обязан иметьcost0, больших скачков через сухие разрывы нет.

Все3 GPU replay GL0/contextLostfalse. SourceP344435 и полный retainedV13764346 одинаковы; итогP1185422→1184900(−0.044%), saturation255 нет. Это измеренная RGBA8 погрешность, а не доказательство точной conservation. Внешний ROI pigment слегка уменьшается, поэтому сохранение растекания требует дополнительных controls.

Локальный кандидатa431c57e добавляетwet-eligibility черезeffectiveWet; dry-on-dry оставляет старый оператор. 22CPUshader testsPASS. GPUcontrols чистой воды/сухой кисти/rebuild/раздельных островов ещё впереди; sourceне опубликован. RawHOME:680-combined-stability/temp/KJc0OoVo/limit-8-16/. Chrome finally закрыт, слот освобождён.
