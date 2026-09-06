/* Architecture map — rendering and interaction. Data is injected as window.__ARCH__. */
(function () {
  'use strict';

  var D = window.__ARCH__;
  var REPO = D.repo; // https://github.com/owner/name/blob/main
  var byId = new Map(D.modules.map(function (m) { return [m.id, m]; }));
  var layerById = new Map(D.layers.map(function (l) { return [l.id, l]; }));
  var groupById = new Map(D.groups.map(function (g) { return [g.id, g]; }));
  var rank = new Map(D.layers.map(function (l, i) { return [l.id, i]; }));

  var outEdges = new Map();
  var inEdges = new Map();
  var neighbours = new Map();
  D.edges.forEach(function (e) {
    if (!outEdges.has(e.from)) outEdges.set(e.from, []);
    if (!inEdges.has(e.to)) inEdges.set(e.to, []);
    outEdges.get(e.from).push(e);
    inEdges.get(e.to).push(e);
    if (!neighbours.has(e.from)) neighbours.set(e.from, new Set());
    if (!neighbours.has(e.to)) neighbours.set(e.to, new Set());
    neighbours.get(e.from).add(e.to);
    neighbours.get(e.to).add(e.from);
  });

  var violationsByModule = new Map();
  D.health.violations.forEach(function (v) {
    [v.fromModule, v.toModule].forEach(function (id) {
      if (!id) return;
      if (!violationsByModule.has(id)) violationsByModule.set(id, []);
      if (violationsByModule.get(id).indexOf(v) < 0) violationsByModule.get(id).push(v);
    });
  });

  var clonesByModule = new Map();
  D.health.clones.forEach(function (c) {
    [c.aModule, c.bModule].forEach(function (id) {
      if (!id) return;
      if (!clonesByModule.has(id)) clonesByModule.set(id, []);
      if (clonesByModule.get(id).indexOf(c) < 0) clonesByModule.get(id).push(c);
    });
  });

  var maxLoc = Math.max.apply(null, D.modules.map(function (m) { return m.loc; }).concat([1]));
  var maxChurn = Math.max.apply(null, D.modules.map(function (m) { return m.churn; }).concat([1]));
  var maxDebt = Math.max.apply(null, D.modules.map(function (m) {
    return (violationsByModule.get(m.id) || []).length;
  }).concat([1]));

  /* ------------------------------------------------------------------ what is on screen
   *
   * Three independent ways to thin the map out, applied in this order:
   *   hiddenLayers   — a whole column folded to a strip (click its heading)
   *   hiddenModules  — individual squares put away (side panel, or "keep what was found")
   *   focus          — keep one module and everything within N hops of it
   * The focused module always survives, so focusing can never blank the screen.
   */

  var STORE_KEY = 'archmap.filter.v1';
  var hiddenLayers = new Set();
  var hiddenModules = new Set();
  var focus = null; // { id, depth }

  function loadFilter() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      (saved.layers || []).forEach(function (id) { if (layerById.has(id)) hiddenLayers.add(id); });
      (saved.modules || []).forEach(function (id) { if (byId.has(id)) hiddenModules.add(id); });
    } catch (e) { /* private mode, cleared storage — start with everything shown */ }
  }

  function saveFilter() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        layers: Array.from(hiddenLayers),
        modules: Array.from(hiddenModules),
      }));
    } catch (e) { /* nothing to do — the filter just won't survive a reload */ }
  }

  function neighbourhood(id, depth) {
    var seen = new Set([id]);
    var frontier = [id];
    for (var d = 0; d < depth; d++) {
      var next = [];
      frontier.forEach(function (cur) {
        (neighbours.get(cur) || new Set()).forEach(function (n) {
          if (seen.has(n)) return;
          seen.add(n);
          next.push(n);
        });
      });
      frontier = next;
    }
    return seen;
  }

  var visible = new Set();

  function computeVisible() {
    visible = new Set();
    D.modules.forEach(function (m) {
      if (hiddenLayers.has(m.layer) || hiddenModules.has(m.id)) return;
      visible.add(m.id);
    });
    if (focus) {
      var keep = neighbourhood(focus.id, focus.depth);
      visible = new Set(Array.from(visible).filter(function (id) { return keep.has(id); }));
      visible.add(focus.id);
    }
  }

  /** Bring a module back whichever filter is hiding it — used by every cross-link. */
  function reveal(id) {
    var m = byId.get(id);
    if (!m) return;
    hiddenModules.delete(id);
    hiddenLayers.delete(m.layer);
    if (focus && !neighbourhood(focus.id, focus.depth).has(id)) focus = null;
    saveFilter();
    refresh();
  }

  function resetFilter() {
    hiddenLayers.clear();
    hiddenModules.clear();
    focus = null;
    saveFilter();
    refresh();
  }

  /* ------------------------------------------------------------------ layout */

  var CARD_W = 208;
  var COL_W = 240;
  var STRIP_W = 34;
  var GAP_Y = 11;
  var TOP = 74;      // room for the band + layer headings
  var LEFT = 24;

  var pos = new Map();
  var cols = [];
  var bands = [];
  var canvasW = 0;
  var canvasH = 0;

  function cardHeight(m) {
    return Math.max(46, Math.min(112, 42 + Math.sqrt(m.loc) * 2.1));
  }

  function computeLayout() {
    pos.clear();
    cols = [];
    bands = [];
    var x = LEFT;
    var maxBottom = TOP;

    D.layers.forEach(function (layer) {
      var all = D.modules.filter(function (m) { return m.layer === layer.id; });
      var mods = all.filter(function (m) { return visible.has(m.id); });
      if (!mods.length) {
        // Folded to a strip rather than dropped: a column you cannot see is one you cannot
        // get back, and the strip is the only affordance saying it still exists.
        cols.push({
          layer: layer, x: x, w: STRIP_W, collapsed: true, shown: 0, total: all.length,
          // Folded by hand, or emptied by the focus? The strip has to undo the right one.
          folded: hiddenLayers.has(layer.id),
        });
        x += STRIP_W + 6;
        return;
      }
      // Heaviest first — the thing you should look at sits at eye level.
      mods.sort(function (a, b) { return b.loc - a.loc; });
      var y = TOP;
      mods.forEach(function (m) {
        var h = cardHeight(m);
        pos.set(m.id, { x: x + (COL_W - CARD_W) / 2, y: y, w: CARD_W, h: h });
        y += h + GAP_Y;
      });
      cols.push({ layer: layer, x: x, w: COL_W, collapsed: false, shown: mods.length, total: all.length });
      maxBottom = Math.max(maxBottom, y);
      x += COL_W;
    });

    D.groups.forEach(function (g) {
      var own = cols.filter(function (c) { return c.layer.group === g.id; });
      if (!own.length) return;
      var x0 = Math.min.apply(null, own.map(function (c) { return c.x; }));
      var x1 = Math.max.apply(null, own.map(function (c) { return c.x + c.w; }));
      bands.push({ group: g, x: x0, w: x1 - x0 });
    });

    canvasW = x + LEFT;
    canvasH = Math.max(maxBottom + 40, 380);
  }

  /* ------------------------------------------------------------------ svg */

  var svg = document.getElementById('graph');
  var NS = 'http://www.w3.org/2000/svg';
  var gRoot, gBands, gEdges, gNodes;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function text(parent, x, y, cls, str) {
    var t = el('text', { x: x, y: y, class: cls }, parent);
    t.textContent = str;
    return t;
  }

  function tip(node, str) {
    var t = el('title', {}, node);
    t.textContent = str;
  }

  function clip(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function edgePath(a, b) {
    var x1 = a.x + a.w, y1 = a.y + a.h / 2;
    var x2 = b.x, y2 = b.y + b.h / 2;
    if (b.x > a.x) {
      var dx = Math.max(40, (x2 - x1) * 0.45);
      return 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ',' + (x2 - dx) + ' ' + y2 + ',' + x2 + ' ' + y2;
    }
    // Backwards or sideways: leave the right edge, loop under, come back to the right edge.
    var xr = b.x + b.w;
    var lift = 26 + Math.min(90, Math.abs(y2 - y1) * 0.25);
    return 'M' + x1 + ' ' + y1 +
      ' C' + (x1 + 60) + ' ' + (y1 + lift) + ',' + (xr + 60) + ' ' + (y2 + lift) + ',' + xr + ' ' + y2;
  }

  function drawGraph() {
    svg.innerHTML = '';
    gRoot = el('g', {}, svg);
    gBands = el('g', {}, gRoot);
    gEdges = el('g', {}, gRoot);
    gNodes = el('g', {}, gRoot);

    bands.forEach(function (b) {
      el('rect', { x: b.x + 3, y: 12, width: b.w - 6, height: canvasH - 24, rx: 14, class: 'band' }, gBands);
      text(gBands, b.x + 14, 32, 'band-title', b.group.title);
    });

    cols.forEach(function (c) {
      if (c.collapsed) {
        var strip = el('g', {
          class: 'strip', 'data-layer': c.layer.id, 'data-folded': c.folded ? 'true' : 'false',
        }, gBands);
        el('rect', { x: c.x, y: TOP - 26, width: c.w, height: canvasH - TOP - 4, rx: 8 }, strip);
        var t = text(strip, 0, 0, 'strip-title', c.layer.title + ' · ' + c.total);
        t.setAttribute('transform',
          'translate(' + (c.x + c.w / 2 + 4) + ',' + (canvasH - 26) + ') rotate(-90)');
        tip(strip, c.folded
          ? 'Развернуть слой «' + c.layer.title + '»'
          : 'Слой пуст из-за фокуса — вернуть его целиком');
        return;
      }
      var head = el('g', { class: 'layer-head', 'data-layer': c.layer.id }, gBands);
      el('rect', {
        x: c.x + (COL_W - CARD_W) / 2 - 7, y: TOP - 30, width: CARD_W + 14, height: 23,
        rx: 6, class: 'layer-head-hit',
      }, head);
      var label = c.layer.title + (c.shown < c.total ? ' · ' + c.shown + '/' + c.total : '');
      text(head, c.x + (COL_W - CARD_W) / 2, TOP - 14, 'layer-title', label);
      tip(head, 'Свернуть слой «' + c.layer.title + '»');
    });

    D.edges.forEach(function (e) {
      var a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return;
      var back = (rank.get(byId.get(e.to).layer) || 0) < (rank.get(byId.get(e.from).layer) || 0);
      el('path', {
        class: 'edge',
        d: edgePath(a, b),
        'data-from': e.from,
        'data-to': e.to,
        'data-back': back ? 'true' : 'false',
        'data-type': e.typeOnly ? 'true' : 'false',
      }, gEdges);
    });

    D.modules.forEach(function (m) {
      var p = pos.get(m.id);
      if (!p) return;
      var g = el('g', { class: 'node', 'data-id': m.id }, gNodes);
      el('rect', { x: p.x, y: p.y, width: p.w, height: p.h }, g);
      wrap(m.title, 24).slice(0, 2).forEach(function (ln, i) {
        text(g, p.x + 12, p.y + 21 + i * 15, 'title', ln);
      });
      var vio = (violationsByModule.get(m.id) || []).length;
      text(g, p.x + 12, p.y + p.h - 20, 'meta',
        m.loc.toLocaleString('ru') + ' стр · ' + m.fileCount + ' ф' + (vio ? ' · ⚠' + vio : ''));
      el('rect', { x: p.x + 12, y: p.y + p.h - 11, width: p.w - 24, height: 4, rx: 2, class: 'bar-bg' }, g);
      el('rect', { x: p.x + 12, y: p.y + p.h - 11, width: 0, height: 4, rx: 2, class: 'bar' }, g);
      if (focus && focus.id === m.id) g.setAttribute('data-focus', 'true');
      // Selection happens in the svg-level pointerup, not here: panning can start on a card
      // too, so a click is only distinguishable from a drag once the pointer comes back up.
      g.addEventListener('mouseenter', function () { if (!selected) highlight(m.id); });
      g.addEventListener('mouseleave', function () { if (!selected) highlight(null); });
    });

    paintMetric();
    applySearch();
  }

  function wrap(str, max) {
    var words = str.split(' ');
    var lines = [];
    var cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
      else cur = (cur ? cur + ' ' : '') + w;
    });
    if (cur) lines.push(cur);
    if (lines.length > 2) { lines = [lines[0], clip(lines.slice(1).join(' '), max)]; }
    return lines;
  }

  /** Re-run everything downstream of a filter change. */
  function refresh(keepView) {
    computeVisible();
    computeLayout();
    drawGraph();
    renderFilterBar();
    if (selected) { highlight(selected); renderPanel(selected); }
    if (!keepView) fit();
  }

  /* ------------------------------------------------------------------ metric colouring */

  var metric = 'size';

  function metricValue(m) {
    if (metric === 'size') return { v: m.loc / maxLoc, col: 'var(--accent)' };
    if (metric === 'tests') {
      var ratio = m.loc ? m.testLoc / m.loc : 0;
      return { v: Math.min(1, ratio), col: ratio >= 0.25 ? 'var(--ok)' : ratio > 0 ? 'var(--out)' : 'var(--warn)' };
    }
    if (metric === 'churn') return { v: m.churn / maxChurn, col: 'var(--out)' };
    var n = (violationsByModule.get(m.id) || []).length + (clonesByModule.get(m.id) || []).length;
    return { v: Math.min(1, n / Math.max(maxDebt, 3)), col: n ? 'var(--warn)' : 'var(--line)' };
  }

  function paintMetric() {
    D.modules.forEach(function (m) {
      var g = gNodes.querySelector('[data-id="' + m.id + '"]');
      if (!g) return;
      var bar = g.querySelectorAll('rect')[2];
      var p = pos.get(m.id);
      var mv = metricValue(m);
      bar.setAttribute('width', Math.max(0, Math.round((p.w - 24) * mv.v)));
      bar.setAttribute('fill', mv.col);
    });
  }

  /* ------------------------------------------------------------------ selection & highlight */

  var selected = null;

  function highlight(id) {
    var ins = new Set(), outs = new Set();
    if (id) {
      (inEdges.get(id) || []).forEach(function (e) { ins.add(e.from); });
      (outEdges.get(id) || []).forEach(function (e) { outs.add(e.to); });
    }
    gNodes.querySelectorAll('.node').forEach(function (n) {
      var nid = n.getAttribute('data-id');
      n.removeAttribute('data-rel');
      n.setAttribute('data-sel', String(nid === id));
      if (!id) { n.removeAttribute('data-dim'); return; }
      if (nid === id) n.removeAttribute('data-dim');
      else if (ins.has(nid)) { n.setAttribute('data-rel', 'in'); n.removeAttribute('data-dim'); }
      else if (outs.has(nid)) { n.setAttribute('data-rel', 'out'); n.removeAttribute('data-dim'); }
      else n.setAttribute('data-dim', 'true');
    });
    gEdges.querySelectorAll('.edge').forEach(function (p) {
      p.removeAttribute('data-rel');
      if (!id) { p.removeAttribute('data-dim'); return; }
      var f = p.getAttribute('data-from'), t = p.getAttribute('data-to');
      if (t === id) { p.setAttribute('data-rel', 'in'); p.removeAttribute('data-dim'); }
      else if (f === id) { p.setAttribute('data-rel', 'out'); p.removeAttribute('data-dim'); }
      else p.setAttribute('data-dim', 'true');
    });
    var node = id && gNodes.querySelector('[data-id="' + id + '"]');
    if (node) gNodes.appendChild(node);
  }

  function select(id) {
    selected = id;
    highlight(id);
    renderPanel(id);
    // The page also ships as a published snapshot, where the embedding frame can refuse
    // history writes — a deep link is a nicety, not a reason to break selection.
    try {
      history.replaceState(null, '', id ? '#' + id : location.pathname + location.search);
    } catch (e) { /* opaque origin */ }
  }

  /* ------------------------------------------------------------------ side panel */

  var aside = document.getElementById('panel');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fileLink(path, line) {
    var href = REPO + '/' + path + (line ? '#L' + line : '');
    return '<a class="link path" href="' + href + '" target="_blank" rel="noreferrer">' + esc(path) + '</a>';
  }

  function moduleLink(id) {
    var m = byId.get(id);
    var off = visible.has(id) ? '' : ' off';
    return '<span class="link' + off + '" data-goto="' + id + '">' + esc(m ? m.title : id) + '</span>';
  }

  function renderPanel(id) {
    if (!id) {
      aside.className = 'empty';
      aside.innerHTML =
        '<h3>Как читать</h3>' +
        '<p>Столбцы — слои, слева направо в порядке зависимости: чем правее, тем «глубже» ' +
        'и тем меньше модуль знает об остальном приложении. Полосы сверху — крупные части системы.</p>' +
        '<p>Ткни в квадрат, чтобы увидеть, за что он отвечает, из чего состоит и кто на него ' +
        'опирается. <b>Синие</b> связи входят в выбранный модуль, <b>оранжевые</b> — выходят из него. ' +
        '<b>Красная</b> связь идёт против порядка слоёв: что-то глубокое тянется наверх. ' +
        'Пунктир — импорт только типов.</p>' +
        '<h3>Как убрать лишнее</h3>' +
        '<p>Клик по <b>заголовку слоя</b> сворачивает весь столбец в полоску; клик по полоске ' +
        'разворачивает обратно.</p>' +
        '<p>У выбранного модуля есть <b>«только соседи»</b> — оставить на экране его и то, ' +
        'с чем он связан напрямую (<b>«соседи ×2»</b> — плюс ещё шаг), и <b>«скрыть»</b> для ' +
        'одного квадрата. Поиск умеет оставить только найденное.</p>' +
        '<p>Сколько показано — слева внизу, там же «показать всё». Ссылка на скрытый модуль ' +
        'в этой панели показана тускло и возвращает его на экран по клику. Esc сбрасывает ' +
        'поиск и фокус. Что скрыто, переживает перезагрузку страницы.</p>' +
        '<p>Колесо — масштаб, перетаскивание — панорама, двойной клик по фону — вписать целиком.</p>';
      return;
    }
    var m = byId.get(id);
    var layer = layerById.get(m.layer);
    var group = groupById.get(layer.group);
    var outs = (outEdges.get(id) || []).slice().sort(function (a, b) { return b.weight - a.weight; });
    var ins = (inEdges.get(id) || []).slice().sort(function (a, b) { return b.weight - a.weight; });
    var vios = violationsByModule.get(id) || [];
    var cls = clonesByModule.get(id) || [];
    var focused = focus && focus.id === id;
    var h = [];

    aside.className = '';
    h.push('<h2>' + esc(m.title) + '</h2>');
    h.push('<div class="layer-tag">' + esc(group.title) + ' · ' + esc(layer.title) + '</div>');

    h.push('<div class="actions">' +
      '<button data-act="focus1"' + (focused && focus.depth === 1 ? ' aria-pressed="true"' : '') +
      '>только соседи</button>' +
      '<button data-act="focus2"' + (focused && focus.depth === 2 ? ' aria-pressed="true"' : '') +
      '>соседи ×2</button>' +
      '<button data-act="hide">скрыть</button>' +
      (focus && !focused ? '<button data-act="unfocus">сбросить фокус</button>' : '') +
      '</div>');

    h.push('<p class="owns">' + esc(m.owns) + '</p>');
    m.notes.forEach(function (n) { h.push('<p class="note">' + esc(n) + '</p>'); });
    if (m.tags.length) {
      h.push('<div style="margin-top:10px">' + m.tags.map(function (t) {
        return '<span class="tag">' + esc(t) + '</span>';
      }).join('') + '</div>');
    }

    h.push('<div class="stats">' +
      stat(m.loc.toLocaleString('ru'), 'строк') +
      stat(m.fileCount, 'файлов') +
      stat(m.testCount ? m.testCount : '—', 'тестов') +
      stat(m.churn, 'правок / 6 мес') +
      '</div>');

    if (m.adr.length || m.issues.length) {
      h.push('<h3>Решения</h3><ul class="list">');
      m.adr.forEach(function (a) {
        h.push('<li><a class="link" target="_blank" rel="noreferrer" href="' + REPO +
          '/docs/adr/' + a + '.md">ADR ' + esc(a) + '</a> — ' + esc(D.adr[a] || '') + '</li>');
      });
      m.issues.forEach(function (n) {
        h.push('<li><a class="link" target="_blank" rel="noreferrer" href="' + D.issuesBase + n +
          '">#' + n + '</a> — ' + esc(D.issues[String(n)] || 'без названия в кэше') + '</li>');
      });
      h.push('</ul>');
    }

    if (outs.length) {
      h.push('<h3>Опирается на · ' + outs.length + '</h3><ul class="list">');
      outs.forEach(function (e) {
        h.push('<li><span class="num">' + e.weight + (e.typeOnly ? ' типы' : '') + '</span>' +
          moduleLink(e.to) + '</li>');
      });
      h.push('</ul>');
    }
    if (ins.length) {
      h.push('<h3>На него опираются · ' + ins.length + '</h3><ul class="list">');
      ins.forEach(function (e) {
        h.push('<li><span class="num">' + e.weight + (e.typeOnly ? ' типы' : '') + '</span>' +
          moduleLink(e.from) + '</li>');
      });
      h.push('</ul>');
    }

    if (vios.length) {
      h.push('<h3>Нарушения правил · ' + vios.length + '</h3><ul class="list">');
      vios.forEach(function (v) {
        h.push('<li><span class="tag warn">' + esc(v.rule) + '</span><br>' +
          fileLink(v.from) + ' → ' + fileLink(v.to) + '</li>');
      });
      h.push('</ul>');
    }

    if (cls.length) {
      h.push('<h3>Совпадающие куски · ' + cls.length + '</h3><ul class="list">');
      cls.slice(0, 12).forEach(function (c) {
        h.push('<li><span class="num">' + c.lines + ' стр</span>' +
          fileLink(c.a.path, c.a.startLine) + '<br>' + fileLink(c.b.path, c.b.startLine) + '</li>');
      });
      h.push('</ul>');
    }

    h.push('<h3>Файлы · ' + m.files.length + '</h3><ul class="list">');
    m.files.forEach(function (f) {
      var badge = f.kind === 'test' ? ' <span class="tag">тест</span>' : f.kind === 'style' ? ' <span class="tag">css</span>' : '';
      h.push('<li><span class="num">' + f.loc + '</span>' + fileLink(f.path) + badge + '</li>');
    });
    h.push('</ul>');

    aside.innerHTML = h.join('');
    aside.scrollTop = 0;
    aside.querySelectorAll('[data-goto]').forEach(function (n) {
      n.addEventListener('click', function () {
        var target = n.getAttribute('data-goto');
        if (!visible.has(target)) reveal(target);
        select(target);
        centerOn(target);
      });
    });
    aside.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { moduleAction(b.getAttribute('data-act'), id); });
    });
  }

  function moduleAction(act, id) {
    if (act === 'hide') {
      hiddenModules.add(id);
      if (focus && focus.id === id) focus = null;
      saveFilter();
      selected = null;
      refresh();
      select(null);
      return;
    }
    if (act === 'unfocus') focus = null;
    else if (act === 'focus1') focus = focus && focus.id === id && focus.depth === 1 ? null : { id: id, depth: 1 };
    else if (act === 'focus2') focus = focus && focus.id === id && focus.depth === 2 ? null : { id: id, depth: 2 };
    refresh();
    if (focus) centerOn(id);
  }

  function stat(v, label) {
    return '<div class="stat"><b>' + v + '</b><span>' + label + '</span></div>';
  }

  /* ------------------------------------------------------------------ filter bar */

  var filterCount = document.getElementById('filter-count');
  var filterKeep = document.getElementById('filter-keep');
  var filterReset = document.getElementById('filter-reset');

  function renderFilterBar() {
    var shown = visible.size;
    var total = D.modules.length;
    filterCount.textContent = 'показано ' + shown + ' из ' + total +
      (focus ? ' · фокус: ' + ((byId.get(focus.id) || {}).title || '') + ' ×' + focus.depth : '');
    filterReset.hidden = shown === total && !focus;
  }

  filterReset.addEventListener('click', resetFilter);
  filterKeep.addEventListener('click', function () {
    var hits = searchHits();
    if (!hits.size) return;
    focus = null;
    hiddenLayers.clear();
    hiddenModules = new Set(D.modules
      .filter(function (m) { return !hits.has(m.id); })
      .map(function (m) { return m.id; }));
    saveFilter();
    refresh();
  });

  /* ------------------------------------------------------------------ pan & zoom */

  var view = { x: 0, y: 0, k: 1 };

  function applyView() {
    gRoot.setAttribute('transform', 'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')');
  }

  function fit() {
    var r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var k = Math.min(r.width / canvasW, r.height / canvasH);
    view.k = Math.max(0.12, Math.min(1.4, k));
    view.x = (r.width - canvasW * view.k) / 2;
    view.y = (r.height - canvasH * view.k) / 2;
    applyView();
  }

  function centerOn(id) {
    var p = pos.get(id);
    if (!p) return;
    var r = svg.getBoundingClientRect();
    view.k = Math.max(view.k, 0.55);
    view.x = r.width / 2 - (p.x + p.w / 2) * view.k;
    view.y = r.height / 2 - (p.y + p.h / 2) * view.k;
    applyView();
  }

  svg.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var r = svg.getBoundingClientRect();
    var mx = ev.clientX - r.left, my = ev.clientY - r.top;
    var f = Math.exp(-ev.deltaY * 0.0016);
    var k2 = Math.max(0.08, Math.min(3, view.k * f));
    view.x = mx - (mx - view.x) * (k2 / view.k);
    view.y = my - (my - view.y) * (k2 / view.k);
    view.k = k2;
    applyView();
  }, { passive: false });

  // No setPointerCapture here: capturing retargets the subsequent click at the svg, which is
  // how card clicks got swallowed. Panning listens on the window instead, and a pointerup that
  // never moved is treated as a click on whatever is under it.
  var drag = null;
  svg.addEventListener('pointerdown', function (ev) {
    drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, moved: false, target: ev.target };
    svg.classList.add('dragging');
  });
  window.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    view.x = drag.vx + dx;
    view.y = drag.vy + dy;
    applyView();
  });
  window.addEventListener('pointerup', function () {
    if (!drag) return;
    var moved = drag.moved;
    var target = drag.target;
    drag = null;
    svg.classList.remove('dragging');
    if (moved || !target || !target.closest) return;

    var strip = target.closest('.strip');
    if (strip) {
      if (strip.getAttribute('data-folded') === 'true') {
        hiddenLayers.delete(strip.getAttribute('data-layer'));
        saveFilter();
      } else {
        focus = null; // the column is empty only because a focus is narrowing the map
      }
      refresh();
      return;
    }
    var head = target.closest('.layer-head');
    if (head) {
      hiddenLayers.add(head.getAttribute('data-layer'));
      saveFilter();
      refresh();
      return;
    }
    var node = target.closest('.node');
    select(node ? node.getAttribute('data-id') : null);
  });
  svg.addEventListener('dblclick', function () { fit(); });

  /* ------------------------------------------------------------------ search */

  var search = document.getElementById('search');

  function searchHits() {
    var q = search.value.trim().toLowerCase();
    var hits = new Set();
    if (!q) return hits;
    D.modules.forEach(function (m) {
      if (m.title.toLowerCase().indexOf(q) >= 0 ||
        m.id.indexOf(q) >= 0 ||
        m.owns.toLowerCase().indexOf(q) >= 0 ||
        m.tags.join(' ').toLowerCase().indexOf(q) >= 0 ||
        m.files.some(function (f) { return f.path.toLowerCase().indexOf(q) >= 0; })) hits.add(m.id);
    });
    return hits;
  }

  function applySearch() {
    var q = search.value.trim();
    var hits = searchHits();
    filterKeep.hidden = !q || !hits.size;
    filterKeep.textContent = 'оставить найденное · ' + hits.size;
    gNodes.querySelectorAll('.node').forEach(function (n) {
      var hit = hits.has(n.getAttribute('data-id'));
      n.setAttribute('data-hit', String(q ? hit : false));
      if (q) n.setAttribute('data-dim', String(!hit));
      else if (!selected) n.removeAttribute('data-dim');
    });
    if (!q && selected) highlight(selected);
  }

  search.addEventListener('input', applySearch);

  document.querySelectorAll('[data-metric]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      metric = btn.getAttribute('data-metric');
      document.querySelectorAll('[data-metric]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      paintMetric();
    });
  });

  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-tab');
      document.querySelectorAll('.tabs button').forEach(function (b) {
        b.setAttribute('aria-selected', String(b === btn));
      });
      document.querySelectorAll('.view').forEach(function (v) {
        v.setAttribute('data-active', String(v.id === 'view-' + id));
      });
      aside.style.display = id === 'structure' ? '' : 'none';
      if (id === 'structure') fit();
    });
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      search.value = '';
      applySearch();
      if (focus) { focus = null; refresh(); }
      select(null);
    }
    if (ev.key === '/' && document.activeElement !== search) { ev.preventDefault(); search.focus(); }
  });

  /* ------------------------------------------------------------------ jumps from other tabs */

  function wireJumps(host) {
    host.querySelectorAll('[data-jump]').forEach(function (n) {
      n.addEventListener('click', function () {
        var id = n.getAttribute('data-jump');
        document.querySelector('.tabs button[data-tab="structure"]').click();
        setTimeout(function () {
          if (!visible.has(id)) reveal(id);
          select(id);
          centerOn(id);
        }, 0);
      });
    });
  }

  /* ------------------------------------------------------------------ flows tab */

  function renderFlows() {
    var host = document.getElementById('view-flows');
    var h = ['<div class="flow-wrap">'];
    D.flows.forEach(function (f) {
      h.push('<section class="flow"><h2>' + esc(f.title) + '</h2>');
      if (f.intro) h.push('<p class="intro">' + esc(f.intro) + '</p>');
      h.push('<div class="steps">');
      f.steps.forEach(function (s) {
        h.push('<div class="step" data-side="' + esc(s.side || 'client') + '">' +
          '<div class="rail"><div class="dot"></div><div class="stem"></div></div>' +
          '<div class="body"><h4>' + esc(s.title) + '</h4><p>' + esc(s.detail) + '</p>' +
          (s.module ? '<div class="where">→ <span class="link" data-jump="' + s.module + '">' +
            esc((byId.get(s.module) || {}).title || s.module) + '</span></div>' : '') +
          '</div></div>');
      });
      h.push('</div></section>');
    });
    h.push('</div>');
    host.innerHTML = h.join('');
    wireJumps(host);
  }

  /* ------------------------------------------------------------------ health tab */

  function renderHealth() {
    var host = document.getElementById('view-health');
    var h = ['<div class="health">'];
    h.push('<h2>Здоровье</h2><p class="lede">Всё на этой вкладке пересчитывается из кода при каждой сборке карты. ' +
      'Ничего из этого нельзя «забыть обновить» — можно только починить или сознательно оставить.</p>');

    var byRule = {};
    D.health.violations.forEach(function (v) { (byRule[v.rule] = byRule[v.rule] || []).push(v); });
    h.push('<h3>Нарушения архитектурных правил · ' + D.health.violations.length + '</h3>');
    h.push('<p class="lede">Правила описаны в <code>.dependency-cruiser.cjs</code>. Каждое — граница, ' +
      'которую CLAUDE.md или ADR уже объявляет словами.</p>');
    if (!D.health.violations.length) h.push('<p class="empty-note">Чисто.</p>');
    Object.keys(byRule).sort().forEach(function (rule) {
      var list = byRule[rule];
      h.push('<h3>' + esc(rule) + ' · ' + list.length + ' <span class="tag ' +
        (list[0].severity === 'error' ? 'warn' : '') + '">' + esc(list[0].severity) + '</span></h3>');
      h.push('<table><tbody>');
      list.forEach(function (v) {
        h.push('<tr><td>' + (v.cycle ? esc(v.cycle.join(' → ')) : fileLink(v.from) + ' → ' + fileLink(v.to)) + '</td></tr>');
      });
      h.push('</tbody></table>');
    });

    var cross = D.health.clones.filter(function (c) { return c.crossModule; });
    h.push('<h3>Повторяющийся код между модулями · ' + cross.length + '</h3>');
    h.push('<p class="lede">jscpd, порог 60 токенов. Совпадения внутри одного модуля скрыты — ' +
      'интересно именно то, что разъехалось по разным местам.</p>');
    if (!cross.length) h.push('<p class="empty-note">Между модулями совпадений нет.</p>');
    else {
      h.push('<table><thead><tr><th class="r">стр</th><th>здесь</th><th>и здесь</th></tr></thead><tbody>');
      cross.slice(0, 60).forEach(function (c) {
        h.push('<tr><td class="r">' + c.lines + '</td><td>' + fileLink(c.a.path, c.a.startLine) +
          '<br><span class="tag">' + esc((byId.get(c.aModule) || {}).title || '') + '</span></td>' +
          '<td>' + fileLink(c.b.path, c.b.startLine) +
          '<br><span class="tag">' + esc((byId.get(c.bModule) || {}).title || '') + '</span></td></tr>');
      });
      h.push('</tbody></table>');
    }

    var heavy = D.modules.slice().sort(function (a, b) { return b.loc - a.loc; }).slice(0, 15);
    h.push('<h3>Самые крупные модули</h3><table><thead><tr><th>модуль</th><th class="r">строк</th>' +
      '<th class="r">файлов</th><th class="r">тестов, стр</th><th class="r">правок</th></tr></thead><tbody>');
    heavy.forEach(function (m) {
      h.push('<tr><td><span class="link" data-jump="' + m.id + '">' + esc(m.title) + '</span></td>' +
        '<td class="r">' + m.loc.toLocaleString('ru') + '</td><td class="r">' + m.fileCount +
        '</td><td class="r">' + m.testLoc.toLocaleString('ru') + '</td><td class="r">' + m.churn + '</td></tr>');
    });
    h.push('</tbody></table>');

    var biggestFiles = [];
    D.modules.forEach(function (m) {
      m.files.forEach(function (f) { if (f.kind === 'code') biggestFiles.push({ f: f, m: m }); });
    });
    biggestFiles.sort(function (a, b) { return b.f.loc - a.f.loc; });
    h.push('<h3>Самые крупные файлы</h3><table><thead><tr><th>файл</th><th>модуль</th>' +
      '<th class="r">строк</th><th class="r">импортов</th></tr></thead><tbody>');
    biggestFiles.slice(0, 20).forEach(function (r) {
      h.push('<tr><td>' + fileLink(r.f.path) + '</td><td><span class="link" data-jump="' + r.m.id + '">' +
        esc(r.m.title) + '</span></td><td class="r">' + r.f.loc.toLocaleString('ru') +
        '</td><td class="r">' + r.f.out + '</td></tr>');
    });
    h.push('</tbody></table>');

    if (D.health.orphans.length) {
      h.push('<h3>Ни на что не ссылаются · ' + D.health.orphans.length + '</h3>' +
        '<p class="lede">Либо точка входа, либо мёртвый код.</p><table><tbody>');
      D.health.orphans.forEach(function (p) { h.push('<tr><td>' + fileLink(p) + '</td></tr>'); });
      h.push('</tbody></table>');
    }

    h.push('</div>');
    host.innerHTML = h.join('');
    wireJumps(host);
  }

  /* ------------------------------------------------------------------ boot */

  loadFilter();
  computeVisible();
  computeLayout();
  drawGraph();
  renderFilterBar();
  renderFlows();
  renderHealth();
  renderPanel(null);
  fit();
  window.addEventListener('resize', function () { if (!selected) fit(); });

  var hash = location.hash.slice(1);
  if (hash && byId.has(hash)) {
    if (!visible.has(hash)) reveal(hash);
    select(hash);
    centerOn(hash);
  }
})();
