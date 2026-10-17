# Macro3 fine-paper candidate: масса вместо декоративной текстуры

`webgpu/macro3-fine-paper.ts`, export `finePaperDefinitions`. Новыйstandaloneпуть, frozenv3 не меняется. Coarse positive implicit concentration solve переносит пигмент; затем fine1024 рекonstrukция использует **реальные исходные** water/paper bytes. Capacity q=W*(.5+paperGain*(1−height)). В каждой admittedcoarsecell веса q/mean(q), их сумма равначислуfinepixels до f32rounding. Поэтому reconstructedfine mass = coarseaverage*cellarea, а не additive/post-noise brightness. Initial harddisk fraction отсутствует.

Дальше8/12малыхfineшагов меняют массу facefluxом Fij=rate*min(qi,qj)*(Mj/qj−Mi/qi). PairFij=−Fji обеспечивает conservation видеальнойарифметике; rate≤.24 ичетыресоседа даютoutweight≤.96, positive/mass-preserving componentwise operator. ВсеRGB/A используютодникоэффициенты, premultiplication не исправляетсяclampом. Capacity0 — nopass face, rawpixelsизexcludedcoarsecells literaloriginal вфинальномpack. Избыточнаяконсервативностьinitialall-fine-wetadmission сохраняется изv1, wetedgeможетсузиться.

Это affinityproxy поheight, а не измереннаяпоглощающаяспособностьбумаги. Наflatpapergaindoesnothingкромеглобальнойcapacityнормализации; нуженреальныйgallerypaperдляхудожественнойоценки. Фактуранепоявитсяизничего наканарейке. Finegrainвлияетнаspatialcarrierdistribution, ненаpreparedcolorпослерасчёта.

Стоимость:2*cycles+fineSteps+2dispatch;при256/3/8 —16dispatch. Finepingpong2×16MiB,capacity8MiB,original4MiB,output+staging8MiB+coarsescratch≈52MiB (actualmetadataсчитаетвсеGPUBuffer.size). ПовторныхCPUreadbackдофиналанет; compile/allocbeforetiming, capacityupload/CPUprepвtotalReady. Неclaimбыстрееbaseline безаппаратногоизмерения. FinalRGBA8rounding/saturation всёещётребуютотдельногоконтроля, идеальнаяconservationнеуниверсальныйbitmasscertificate.

5CPUtestsPASS: normalizedpercellmass/actualpaperresponse,12finefluxstepspositivity+mass+equilibrium+drywall,excludedcellweights0,complete146reservedWGSLscan,nativecandidateallocation/dispatch/lifecycle. Stricttsc/oxlintPASS. GPU/изображения/qualityпокаpending. Новых устройств/процессов/сервисов не создано.
