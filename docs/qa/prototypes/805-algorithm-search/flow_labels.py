"""Short Russian review labels. Parameters remain in evidence, never imply art acceptance."""
LABELS={
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
 if 'gain' in config:parts.append('подвижность ×'+str(config['gain']))
 if 'strength' in config:parts.append('без вихрей' if not config['strength'] else 'вихри '+str(config['strength']))
 if 'edgeStain' in config:parts.append('без осаждения' if not config['edgeStain'] else 'осаждение '+str(config['edgeStain']))
 if 'fineSteps' in config:parts.append('без мелкого переноса' if not config['fineSteps'] else str(config['fineSteps'])+' мелких шагов')
 if config.get('paperGain')==0:parts.append('без бумажного притяжения')
 if config.get('smooth')==0:parts.append('блочное отображение')
 if config.get('steps') in (256,384):parts.append(str(config['steps'])+' шагов')
 return label+(' · '+', '.join(parts) if parts else '')
