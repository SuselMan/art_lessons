"""Short Russian review labels. Parameters remain in evidence, never imply art acceptance."""
LABELS={
 'wgsl-macro-physical-dt-fine':'Крупный шаг с бумажной фактурой',
 'wgsl-macro-coherent-physical-dt':'Вихри — более крупный шаг расчёта',
 'wgsl-macro-coherent-gated-exchange':'Вихри с разной частотой смешения',
 'wgsl-macro-packed-aux-coherent-fine':'Та же мелкая бумага — компактная память',
 'wgsl-macro-packed-carrier-coherent-fine':'Та же мелкая бумага — меньше памяти',
 'wgsl-macro-terminal-rim-coherent-fine':'Местное накопление у мокрой кромки',
 'wgsl-macro-limited-coherent-advection':'Перенос с ограничением размытия',
 'wgsl-macro-true-coherent-fine':'Вихри и мелкая бумага — проверенная связка',
 'wgsl-macro-coherent-safe-dither':'Водные вихри без мелкой фактуры',
 'wgsl-macro-coherent-fast-initial':'Те же вихри — быстрая подготовка',
 'wgsl-macro-fast-coherent-smooth-fine-paper':'Вихри и фактура — быстрая подготовка',
 'wgsl-macro-soft-paper-coherent-fine':'Вихри и мягкая бумажная фактура',
 'wgsl-macro-coherent-smooth-fine-paper':'Водные вихри и плавная мелкая бумага',
 'wgsl-macro-integer-dynamic':'Движение воды без нового смешения',
 'wgsl-macro-integer-smooth-control':'Плавное отображение без нового смешения',
 'wgsl-macro-integer-mixing-smooth':'Общая вода и смешение',
 'wgsl-macro-integer-smooth-dither':'Округление с ошибкой — отклонён',
 'wgsl-macro-integer-smooth-safe-dither':'Смешение без цветовых полос',
 'wgsl-macro-local-smooth-control':'Смешение с локальным восстановлением',
 'wgsl-macro-wetness-conductance':'Перенос зависит от количества воды',
 'wgsl-macro-mobility-calibration':'Усиленная подвижность воды',
 'wgsl-macro-wetting-front-deposition':'Осаждение у наступающего мокрого края',
 'wgsl-macro-integer-fine-paper':'Перераспределение по мелкой бумаге',
 'wgsl-macro-integer-safe-fine-paper':'Мелкая бумага без ошибки округления',
 'wgsl-macro-mobility-safe-fine-paper':'Подвижная вода и мелкая бумага',
 'wgsl-macro-mobility-smooth-fine-paper':'Подвижная вода и плавная мелкая бумага',
 'wgsl-macro-coherent-advection':'Перенос краски водными вихрями',
 'wgsl-macro-dynamic-wetness-smooth-dither':'Плавное растекание без цветовых полос',
 'wgsl-macro-integer-exact-program':'Точная оптимизация — выигрыша не найдено',
 'wgsl-macro-integer-exact-fused':'Объединённые шаги — выигрыша не найдено',
}
def review_label(algorithm,config,fallback=None):
 label=LABELS.get(algorithm,fallback or algorithm)
 parts=[]
 if 'mobilityGain' in config:parts.append('подвижность ×'+str(config['mobilityGain']))
 elif 'gain' in config:parts.append('подвижность ×'+str(config['gain']))
 if 'curlStrength' in config:parts.append('без вихрей' if not config['curlStrength'] else 'вихри '+str(config['curlStrength']))
 elif 'strength' in config:parts.append('без вихрей' if not config['strength'] else 'вихри '+str(config['strength']))
 if 'eddyCells' in config:parts.append('масштаб поля '+str(config['eddyCells']*8)+' px')
 if 'affinityBase' in config:parts.append('бумага '+str(config.get('paperGain',0))+'/'+str(config['affinityBase']))
 if 'exchangeActiveSteps' in config:parts.append('смешение '+str(config['exchangeActiveSteps'])+'/256')
 if 'limiter' in config:parts.append('реконструкция включена' if config['limiter'] else 'контроль без реконструкции')
 if 'rimStrength' in config:parts.append('без кромки' if not config['rimStrength'] else 'кромка '+str(config['rimStrength']))
 if 'edgeStain' in config:parts.append('без осаждения' if not config['edgeStain'] else 'осаждение '+str(config['edgeStain']))
 if 'fineSteps' in config:parts.append('без мелкого переноса' if not config['fineSteps'] else str(config['fineSteps'])+' мелких шагов')
 if config.get('paperGain')==0:parts.append('без бумажного притяжения')
 if config.get('smooth')==0:parts.append('блочное отображение')
 if 'physicalDt' in config:parts.append('шаг ×'+str(config['physicalDt']))
 if 'steps' in config:parts.append(str(config['steps'])+' шагов')
 return label+(' · '+', '.join(parts) if parts else '')
