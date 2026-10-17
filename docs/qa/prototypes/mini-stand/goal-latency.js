/* Read-only Mini telemetry. No engine/controller wrappers or GPU calls. */
(function () {
  'use strict';
  if (window.__miniGoalLatency) return;
  var pending=null,down=null,knownController=null,results=[],phase='idle',message='Нарисуйте мазок: измерим время от отрыва пера до готовой цели.',sequence=0,raf=0,stopped=false;
  var bar=document.createElement('section');bar.id='miniGoalLatency';bar.setAttribute('aria-label','Время расчёта акварели');bar.setAttribute('role','status');
  var text=document.createElement('strong'),note=document.createElement('span');note.textContent='Анимация отдельно — до 120 с. Это время браузера, не чистое GPU-время.';bar.append(text,note);
  var style=document.createElement('style');style.textContent='#miniGoalLatency{flex:none;grid-column:1/-1;min-height:48px;padding:8px 14px;background:#222630;border-top:1px solid #596174;color:#f4f5f8;display:flex;flex-wrap:wrap;align-items:center;gap:4px 14px;font:13px/1.35 system-ui,sans-serif}#miniGoalLatency strong{font-weight:600}#miniGoalLatency span{font-size:11px;color:#c4c9d4}@media(orientation:landscape){body:has(#miniGoalLatency){grid-template-rows:minmax(0,1fr) auto}body:has(#miniGoalLatency)>#controlsPanel,body:has(#miniGoalLatency)>main{height:100%!important;min-height:0}}';
  document.head.append(style);document.body.append(bar);
  function show(next,label){phase=next;message=label;text.textContent=label;bar.dataset.phase=next;}
  function stateOf(controller){try{return controller&&controller.state}catch(_error){return null}}
  function tuningKey(){try{return JSON.stringify(window.__miniTuning||null)}catch(_error){return 'unavailable'}}
  function invalidate(reason){pending=null;down=null;show('cancelled',reason);}
  function canvasEvent(event){return event.target===document.getElementById('paper')}
  function onDown(event){if(!event.isTrusted||!canvasEvent(event))return;var cancelled=!!pending;pending=null;var controller=window.__miniPuddle,state=stateOf(controller);down={pointerId:event.pointerId,controller:controller,epoch:state&&state.epoch};show('drawing',(cancelled?'Предыдущий замер отменён. ':'')+'Рисование… замер начнётся при отрыве пера.');}
  function onUp(event){if(!event.isTrusted||!down||event.pointerId!==down.pointerId)return;var start=performance.now(),held=down;down=null;var controller=window.__miniPuddle,state=stateOf(controller);if(!controller||controller!==held.controller||!state||!state.drawing||!Number.isSafeInteger(state.epoch)||state.epoch===held.epoch){invalidate('Замер не начат: контроллер ещё не принял этот мазок.');return}pending={id:++sequence,upAt:start,epoch:state.epoch,controller:controller,version:window.__wcReviewVersion||null,tuning:tuningKey(),stableFrames:0,sawNotReady:!state.goalReady};show('calculating','Считается цель…');}
  function onCancel(event){if(event.isTrusted&&down&&event.pointerId===down.pointerId)invalidate('Жест отменён; время цели не измерялось.');}
  function onControl(event){var target=event.target&&event.target.closest&&event.target.closest('input,select,button');if(!target||!target.closest('#controlsPanel'))return;if(['save','copyTuning','protectExit'].indexOf(target.id)!==-1)return;if(event.type==='click'&&target.tagName!=='BUTTON')return;invalidate('Настройки или лист изменены. Нарисуйте новый мазок для замера.');}
  function tick(){if(stopped)return;var controller=window.__miniPuddle,state=stateOf(controller);if(knownController&&controller!==knownController)invalidate('Контроллер сменился. Нарисуйте новый мазок для замера.');knownController=controller||null;
    if(pending){var p=pending;if(controller!==p.controller||!state||state.epoch!==p.epoch||window.__wcReviewVersion!==p.version&&!(window.__wcReviewVersion==null&&p.version===null)||tuningKey()!==p.tuning){invalidate('Замер отменён: изменилась цель или её настройки.');}
      else if(state.drawing){invalidate('Замер отменён новым жестом.');}
      else {if(!state.goalReady||state.calculating)p.sawNotReady=true;var complete=p.sawNotReady&&state.goalReady===true&&state.calculating===false&&state.drawing===false&&state.target&&state.target.done===true;p.stableFrames=complete?p.stableFrames+1:0;
        if(p.stableFrames>=2){var now=performance.now(),result={id:p.id,epoch:p.epoch,version:p.version,pointerUpAt:p.upAt,goalReadyAt:now,latencyMs:now-p.upAt,confirmationFrames:2};results.unshift(result);results=results.slice(0,5);pending=null;show('ready','Цель готова за '+Math.round(result.latencyMs)+' мс.');}
        else if(state.live===false&&!state.calculating&&!state.effectRequested&&!state.goalReady){pending=null;show('not-requested','Цель пока не запрошена в этом режиме. Замер ждёт нового мазка в живом режиме.');}
      }
    }raf=requestAnimationFrame(tick);
  }
  window.addEventListener('pointerdown',onDown,true);window.addEventListener('pointerup',onUp,true);window.addEventListener('pointercancel',onCancel,true);
  ['input','change','click'].forEach(function(type){window.addEventListener(type,onControl,true)});
  window.addEventListener('pagehide',function(event){pending=null;down=null;if(event.persisted){show('cancelled','Возврат на лист: нарисуйте новый мазок для замера.');return}stopped=true;cancelAnimationFrame(raf);});
  var api=Object.freeze({snapshot:function(){var s=stateOf(window.__miniPuddle);return{phase:phase,message:message,pending:pending?{id:pending.id,epoch:pending.epoch,pointerUpAt:pending.upAt,stableFrames:pending.stableFrames}:null,latest:results.length?Object.assign({},results[0]):null,results:results.map(function(r){return Object.assign({},r)}),controller:s?{epoch:s.epoch,drawing:s.drawing,goalReady:s.goalReady,calculating:s.calculating,targetDone:!!(s.target&&s.target.done),animationProgress:s.progress}:null,qualification:'trusted pointerup capture → controller goalReady + target.done, confirmed on two RAF; includes handler/browser wait, excludes waiting for animation.done; no GPU reads or forced finish'}}});
  Object.defineProperty(window,'__miniGoalLatency',{value:api,configurable:false,writable:false});show('idle',message);raf=requestAnimationFrame(tick);
})();
