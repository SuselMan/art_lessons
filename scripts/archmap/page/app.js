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
    if (metric === 'understanding') {
      // (#628) The first person's best topic score for this module; a red stub means "nobody
      // on the team can explain this yet".
      var who = D.understanding && D.understanding.people[0];
      var sc = who ? who.moduleScore[m.id] || 0 : 0;
      return {
        v: Math.max(sc, 0.06),
        col: sc >= 1 ? 'var(--ok)' : sc >= 0.5 ? 'var(--in)' : sc > 0 ? 'var(--out)' : 'var(--warn)',
      };
    }
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

  /* (#632) Names of types and functions the map mentions become clickable; the click shows the
   * declaration lifted from the code at build time (D.symbols). Delegated on the document, so
   * panels that re-render their HTML need no wiring of their own. */
  var SYMBOLS = D.symbols || {};

  function symText(str) {
    return String(str).split(/(\b[A-Za-z_]\w{2,}\b)/).map(function (part, i) {
      if (i % 2 && Object.prototype.hasOwnProperty.call(SYMBOLS, part)) {
        return '<span class="sym" data-sym="' + part + '">' + part + '</span>';
      }
      return esc(part);
    }).join('');
  }

  /* Syntax colouring for the snippets. A tokenizer of our own rather than a library: the map
   * has to open offline from a file, and a highlighter that builds its own spans would fight
   * the clickable-name spans above. TypeScript declarations and Prisma models are all it sees,
   * so comments, strings, keywords, type names and property keys are enough. */
  var KEYWORDS = new Set(('export type interface const let function class enum extends implements import from ' +
    'readonly declare keyof typeof as return if else new void null undefined true false in of ' +
    'public private protected static async await model').split(' '));
  var BUILTINS = new Set(('string number boolean unknown any never object bigint symbol Record Partial Pick ' +
    'Omit Readonly ReadonlyArray ReadonlySet ReadonlyMap Array Promise Set Map Date Uint8Array Float32Array ' +
    'Int String Boolean Json Bytes DateTime Float BigInt Decimal').split(' '));
  var TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(@@?\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

  function highlight(src) {
    var out = '', last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      out += esc(src.slice(last, m.index));
      last = TOKEN.lastIndex;
      var t = m[0];
      if (m[1]) out += '<span class="hl-c">' + symText(t) + '</span>';
      else if (m[2]) out += '<span class="hl-s">' + esc(t) + '</span>';
      else if (m[3]) out += '<span class="hl-a">' + esc(t) + '</span>';
      else if (m[4]) out += '<span class="hl-n">' + t + '</span>';
      else if (Object.prototype.hasOwnProperty.call(SYMBOLS, t)) out += '<span class="sym hl-t" data-sym="' + t + '">' + t + '</span>';
      // A key before `:` is a property even when it is spelled like a keyword (`type: 'stroke'`).
      else if (/^\s*\??:/.test(src.slice(last, last + 3))) out += '<span class="hl-p">' + esc(t) + '</span>';
      else if (KEYWORDS.has(t)) out += '<span class="hl-k">' + t + '</span>';
      else if (BUILTINS.has(t)) out += '<span class="hl-b">' + t + '</span>';
      else if (/^[A-Z]/.test(t)) out += '<span class="hl-t">' + esc(t) + '</span>';
      else out += esc(t);
    }
    return out + esc(src.slice(last));
  }

  var symPop = document.createElement('div');
  symPop.className = 'sym-pop';
  symPop.hidden = true;
  document.body.appendChild(symPop);

  function showSymbol(name, x, y) {
    var decls = SYMBOLS[name] || [];
    var h = ['<button class="sym-close" aria-label="закрыть">×</button>'];
    decls.forEach(function (d) {
      h.push('<div class="sym-head"><b>' + esc(name) + '</b> <span class="tag">' + esc(d.kind) + '</span> ' +
        '<a class="link path" target="_blank" rel="noreferrer" href="' + REPO + '/' + d.path + '#L' + d.line + '">' +
        esc(d.path) + ':' + d.line + ' ↗</a></div>' +
        '<pre><code>' + highlight(d.snippet) + '</code></pre>' +
        (d.truncated ? '<p class="num" style="float:none">… обрезано — целиком по ссылке</p>' : ''));
    });
    if (decls.length > 1) {
      h.splice(1, 0, '<p class="sym-many">Одно имя — ' + decls.length + ' объявления. Часто разница между ними и есть суть.</p>');
    }
    symPop.innerHTML = h.join('');
    symPop.hidden = false;
    var w = Math.min(640, window.innerWidth - 24);
    symPop.style.width = w + 'px';
    symPop.style.left = Math.max(12, Math.min(x - 20, window.innerWidth - w - 12)) + 'px';
    // Below the click when there is room, otherwise above it; never past the viewport edge.
    var below = y + 14, above = y - 14, H = window.innerHeight;
    var top = H - below - 12 >= 320 || H - below > above ? below : 12;
    symPop.style.top = top + 'px';
    symPop.style.maxHeight = Math.max(160, (top === below ? H - below : above) - 12) + 'px';
    symPop.scrollTop = 0;
  }

  document.addEventListener('click', function (ev) {
    var sym = ev.target.closest && ev.target.closest('.sym');
    if (sym) {
      ev.stopPropagation();
      showSymbol(sym.getAttribute('data-sym'), ev.clientX, ev.clientY);
      return;
    }
    if (ev.target.closest && ev.target.closest('.sym-close')) { symPop.hidden = true; return; }
    if (!symPop.hidden && !symPop.contains(ev.target)) symPop.hidden = true;
  }, true);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') symPop.hidden = true; });

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

    h.push('<p class="owns">' + symText(m.owns) + '</p>');
    m.notes.forEach(function (n) { h.push('<p class="note">' + symText(n) + '</p>'); });
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
          '<div class="body"><h4>' + symText(s.title) + '</h4><p>' + symText(s.detail) + '</p>' +
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

  /* ------------------------------------------------------------------ runtime tab (#624)
   *
   * Processes and stores, laid out on a hand-picked grid per zone; zones sharing a `col`
   * stack vertically. Links are curves between node centres — parallel links between the
   * same pair fan out — and the nodes are drawn on top, so a curve's ends tuck under them.
   */

  var rtSelect = null; // set once the runtime tab is drawn, so other tabs can jump to a link

  var CONTRACT = {
    bound: {
      title: 'связан',
      text: 'Одно объявление на канал, компилятор проверяет по нему обе стороны. ' +
        'Переименуешь поле — typecheck упадёт и там, и там.',
    },
    named: {
      title: 'назван',
      text: 'Обе стороны берут тип из shared, но связь «этот маршрут — этот тип» каждая пишет сама. ' +
        'Ошибиться на одной стороне компилятор не помешает.',
    },
    'one-side': {
      title: 'с одной стороны',
      text: 'Тип объявлен только у одной стороны или приведён кастом (as). ' +
        'Расхождение не ловится ничем, кроме падения на живых данных.',
    },
    opaque: {
      title: 'без типа',
      text: 'Байты, текстуры, файлы, чужой API. Компилятор тут не помощник по самой природе канала.',
    },
  };
  var KIND = { process: 'процесс', store: 'хранилище', external: 'внешний сервис' };

  function renderRuntime() {
    var host = document.getElementById('view-runtime');
    var R = D.runtime;
    if (!R) {
      host.innerHTML = '<div class="health"><p class="lede">docs/architecture/runtime.yaml не найден.</p></div>';
      return;
    }
    var nodeById = new Map(R.nodes.map(function (n) { return [n.id, n]; }));
    var linkById = new Map(R.links.map(function (l) { return [l.id, l]; }));

    var CELL_W = 300, CELL_H = 150, NODE_W = 196, NODE_H = 62, PAD = 26, HEAD = 40, GAP_X = 110, GAP_Y = 36;

    // Zones → columns → stacked boxes.
    var cols = [];
    R.zones.forEach(function (z, i) {
      var c = z.col !== undefined ? z.col : i;
      (cols[c] = cols[c] || []).push(z);
    });
    var zoneBox = new Map();
    var x = 20;
    cols.forEach(function (zs) {
      if (!zs) return;
      var y = 20, colW = 0;
      zs.forEach(function (z) {
        var nodes = R.nodes.filter(function (n) { return n.zone === z.id; });
        var nc = 1 + Math.max.apply(null, nodes.map(function (n) { return n.at[0]; }).concat([0]));
        var nr = 1 + Math.max.apply(null, nodes.map(function (n) { return n.at[1]; }).concat([0]));
        var w = nc * CELL_W + PAD * 2 - (CELL_W - NODE_W);
        var h = HEAD + nr * CELL_H + PAD - (CELL_H - NODE_H);
        zoneBox.set(z.id, { x: x, y: y, w: w, h: h, z: z });
        y += h + GAP_Y;
        colW = Math.max(colW, w);
      });
      zs.forEach(function (z) { zoneBox.get(z.id).w = colW; });
      x += colW + GAP_X;
    });
    var W = x - GAP_X + 20;
    var H = 40 + Math.max.apply(null, Array.from(zoneBox.values()).map(function (b) { return b.y + b.h; }));

    var pos = new Map();
    R.nodes.forEach(function (n) {
      var b = zoneBox.get(n.zone);
      var nx = b.x + PAD + n.at[0] * CELL_W;
      var ny = b.y + HEAD + n.at[1] * CELL_H;
      pos.set(n.id, { x: nx, y: ny, cx: nx + NODE_W / 2, cy: ny + NODE_H / 2 });
    });

    host.innerHTML =
      '<div class="rt-wrap">' +
      '<div class="rt-canvas"><div class="rt-legend"></div><svg id="rt-svg"></svg></div>' +
      '<aside class="rt-panel"></aside></div>';
    var legend = host.querySelector('.rt-legend');
    legend.innerHTML = Object.keys(CONTRACT).map(function (k) {
      return '<span class="rt-key" data-contract="' + k + '"><svg width="34" height="10"><line x1="1" y1="5" x2="33" y2="5" /></svg>' +
        esc(CONTRACT[k].title) + '</span>';
    }).join('') + '<span class="rt-key-note">цвет и штрих линии — сила контракта</span>';

    var s = host.querySelector('#rt-svg');
    s.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    // Fit the width of the pane; never blow up past natural size on a wide screen.
    s.style.maxWidth = W + 'px';

    zoneBox.forEach(function (b) {
      var g = el('g', { class: 'rt-zone' }, s);
      el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 14 }, g);
      text(g, b.x + 16, b.y + 22, 'rt-zone-title', b.z.title);
      if (b.z.note) tip(g, b.z.note);
    });

    // Parallel links between the same pair fan out around the straight line.
    var pairCount = new Map(), pairSeen = new Map();
    R.links.forEach(function (l) {
      var k = [l.from, l.to].sort().join('|');
      pairCount.set(k, (pairCount.get(k) || 0) + 1);
    });
    var gLinks = el('g', {}, s);
    var gNodesRt = el('g', {}, s);
    // Labels go on top of the nodes: between neighbours the midpoint can sit on a box's edge.
    var gLabels = el('g', {}, s);
    R.links.forEach(function (l) {
      var a = pos.get(l.from), b = pos.get(l.to);
      var k = [l.from, l.to].sort().join('|');
      var i = pairSeen.get(k) || 0;
      pairSeen.set(k, i + 1);
      var off = (i - (pairCount.get(k) - 1) / 2) * 58 + (l.bend || 0);
      var dx = b.cx - a.cx, dy = b.cy - a.cy, len = Math.hypot(dx, dy) || 1;
      // Keep the normal pointing the same way whichever end is `from`, so a fan stays a fan.
      var sign = l.from < l.to ? 1 : -1;
      var nx = (-dy / len) * sign, ny = (dx / len) * sign;
      var mx = (a.cx + b.cx) / 2 + nx * off * 2, my = (a.cy + b.cy) / 2 + ny * off * 2;
      var g = el('g', { class: 'rt-link', 'data-id': l.id, 'data-contract': l.contract }, gLinks);
      var d = 'M' + a.cx + ',' + a.cy + ' Q' + mx + ',' + my + ' ' + b.cx + ',' + b.cy;
      el('path', { d: d, class: 'rt-hit' }, g);
      el('path', { d: d, class: 'rt-line' }, g);
      // Midpoint of the quadratic curve.
      var lx = 0.25 * a.cx + 0.5 * mx + 0.25 * b.cx, ly = 0.25 * a.cy + 0.5 * my + 0.25 * b.cy;
      var label = el('g', { class: 'rt-label', 'data-id': l.id, 'data-contract': l.contract }, gLabels);
      var t = text(label, lx, ly + 4, 'rt-label-text', clip(l.summary, 34));
      t.setAttribute('text-anchor', 'middle');
      var tw = Math.min(l.summary.length, 34) * 6.3 + 18;
      label.insertBefore(el('rect', { x: lx - tw / 2, y: ly - 10, width: tw, height: 20, rx: 10 }), t);
      tip(label, l.channel + ' · ' + l.messages.length + ' сообщ.');
    });

    R.nodes.forEach(function (n) {
      var p = pos.get(n.id);
      var g = el('g', { class: 'rt-node', 'data-id': n.id, 'data-kind': n.kind }, gNodesRt);
      el('rect', { x: p.x, y: p.y, width: NODE_W, height: NODE_H, rx: n.kind === 'store' ? 4 : 11 }, g);
      if (n.kind === 'store') el('line', { x1: p.x, y1: p.y + 7, x2: p.x + NODE_W, y2: p.y + 7, class: 'rt-store-lid' }, g);
      text(g, p.x + 14, p.y + 28, 'rt-node-title', clip(n.title, 24));
      text(g, p.x + 14, p.y + 46, 'rt-node-kind', KIND[n.kind] || n.kind);
    });

    var panel = host.querySelector('.rt-panel');
    var selected = null; // { type: 'node' | 'link', id }

    function linkify(str) {
      return symText(str).replace(/#(\d{2,4})/g, function (_, n) {
        var title = D.issues && D.issues[n];
        return '<a class="link" target="_blank" rel="noreferrer" href="' + D.issuesBase + n + '">#' + n +
          (title ? ' (' + esc(title) + ')' : '') + '</a>';
      });
    }

    function badge(c) {
      return '<span class="rt-badge" data-contract="' + c + '">' + esc(CONTRACT[c].title) + '</span>';
    }

    function linkRow(l, fromId) {
      var other = l.from === fromId ? l.to : l.from;
      return '<li><span class="link" data-rt-link="' + l.id + '">' + esc(l.channel) + '</span> ' + badge(l.contract) +
        '<br><span class="num">' + (l.from === fromId ? '→ ' : '← ') + esc(nodeById.get(other).title) + ' · ' +
        l.messages.length + ' сообщ.</span></li>';
    }

    function renderRtPanel() {
      var h = [];
      if (!selected) {
        h.push('<h2>Исполнение</h2><p class="owns">Что живёт, когда программа запущена, и что эти части шлют друг другу. ' +
          'Вкладка «Структура» отвечает на вопрос «кто кого импортирует»; здесь вопрос другой — клиент и сервер ' +
          'друг друга не импортируют, но разговаривают весь урок.</p>');
        h.push('<h3>Как читать</h3><ul class="list">' +
          '<li><b>Прямоугольник</b> — процесс: код, который выполняется.</li>' +
          '<li><b>С крышкой</b> — хранилище: данные лежат, пока их не спросят.</li>' +
          '<li><b>Пунктирная рамка</b> — чужая система.</li>' +
          '<li><b>Линия</b> — канал. Подпись на ней — главные типы, которые по нему ходят. Клик — полный список ' +
          'сообщений с направлением и типом.</li></ul>');
        h.push('<h3>Сила контракта</h3>');
        Object.keys(CONTRACT).forEach(function (k) {
          h.push('<p class="note">' + badge(k) + ' ' + esc(CONTRACT[k].text) + '</p>');
        });
        h.push('<p class="owns" style="color:var(--ink-2)">Проверка в рантайме — отдельная ось. Даже «связан» значит ' +
          'только проверку при компиляции: пришедший по сети пакет с типом никто не сверяет, кроме пары ' +
          'мест — они помечены в сообщениях.</p>');
        h.push('<h3>Все каналы</h3><ul class="list">');
        var order = ['bound', 'named', 'one-side', 'opaque'];
        R.links.slice().sort(function (a, b) { return order.indexOf(a.contract) - order.indexOf(b.contract); })
          .forEach(function (l) {
            h.push('<li><span class="link" data-rt-link="' + l.id + '">' + esc(nodeById.get(l.from).title) + ' — ' +
              esc(nodeById.get(l.to).title) + '</span> ' + badge(l.contract) + '<br><span class="num">' +
              esc(l.channel) + '</span></li>');
          });
        h.push('</ul>');
      } else if (selected.type === 'node') {
        var n = nodeById.get(selected.id);
        var z = zoneBox.get(n.zone).z;
        h.push('<h2>' + esc(n.title) + '</h2><span class="layer-tag">' + esc(KIND[n.kind]) + ' · ' + esc(z.title) + '</span>');
        h.push('<p class="owns">' + linkify(n.owns) + '</p>');
        if (n.modules && n.modules.length) {
          h.push('<h3>Из каких модулей собран</h3><ul class="list">');
          n.modules.forEach(function (id) {
            h.push('<li><span class="link" data-jump="' + id + '">' + esc((byId.get(id) || {}).title || id) + '</span></li>');
          });
          h.push('</ul>');
        }
        var mine = R.links.filter(function (l) { return l.from === n.id || l.to === n.id; });
        h.push('<h3>Каналы · ' + mine.length + '</h3><ul class="list">');
        mine.forEach(function (l) { h.push(linkRow(l, n.id)); });
        h.push('</ul>');
      } else {
        var l = linkById.get(selected.id);
        var from = nodeById.get(l.from), to = nodeById.get(l.to);
        h.push('<h2>' + esc(l.channel) + '</h2><span class="layer-tag"><span class="link" data-rt-node="' + from.id + '">' +
          esc(from.title) + '</span> ⇄ <span class="link" data-rt-node="' + to.id + '">' + esc(to.title) + '</span></span>');
        h.push('<p class="note">' + badge(l.contract) + ' ' + esc(CONTRACT[l.contract].text) + '</p>');
        if (l.note) h.push('<p class="owns">' + linkify(l.note) + '</p>');
        h.push('<h3>Сообщения · ' + l.messages.length + '</h3><table class="rt-msgs"><tbody>');
        l.messages.forEach(function (m) {
          var target = m.dir === '→' ? to.title : from.title;
          h.push('<tr><td class="rt-dir" title="к: ' + esc(target) + '">' + m.dir + '</td><td><code>' + symText(m.name) +
            '</code><div class="rt-type">' + symText(m.type) + '</div>' +
            (m.note ? '<div class="rt-mnote">' + linkify(m.note) + '</div>' : '') +
            (m.runtime ? '<div class="rt-runtime">в рантайме: ' + symText(m.runtime) + '</div>' : '') +
            '</td></tr>');
        });
        h.push('</tbody></table><p class="num" style="float:none">→ от «' + esc(from.title) + '» к «' + esc(to.title) +
          '», ← обратно.</p>');
      }
      if (selected) h.unshift('<p><span class="link" data-rt-clear>← как читать эту вкладку</span></p>');
      panel.innerHTML = h.join('');
      panel.querySelectorAll('[data-rt-link]').forEach(function (e) {
        e.addEventListener('click', function () { select({ type: 'link', id: e.getAttribute('data-rt-link') }); });
      });
      panel.querySelectorAll('[data-rt-node]').forEach(function (e) {
        e.addEventListener('click', function () { select({ type: 'node', id: e.getAttribute('data-rt-node') }); });
      });
      panel.querySelectorAll('[data-rt-clear]').forEach(function (e) {
        e.addEventListener('click', function () { select(null); });
      });
      wireJumps(panel);
    }

    function select(sel) {
      selected = sel;
      var liveNodes = new Set(), liveLinks = new Set();
      if (sel && sel.type === 'node') {
        liveNodes.add(sel.id);
        R.links.forEach(function (l) {
          if (l.from === sel.id || l.to === sel.id) { liveLinks.add(l.id); liveNodes.add(l.from); liveNodes.add(l.to); }
        });
      } else if (sel) {
        var l = linkById.get(sel.id);
        liveLinks.add(l.id); liveNodes.add(l.from); liveNodes.add(l.to);
      }
      s.querySelectorAll('.rt-node').forEach(function (e) {
        var id = e.getAttribute('data-id');
        e.setAttribute('data-dim', String(!!sel && !liveNodes.has(id)));
        e.setAttribute('data-sel', String(!!sel && sel.type === 'node' && sel.id === id));
      });
      s.querySelectorAll('.rt-link, .rt-label').forEach(function (e) {
        var id = e.getAttribute('data-id');
        e.setAttribute('data-dim', String(!!sel && !liveLinks.has(id)));
        e.setAttribute('data-sel', String(!!sel && sel.type === 'link' && sel.id === id));
      });
      renderRtPanel();
    }

    s.addEventListener('click', function (ev) {
      var hit = ev.target.closest('.rt-node, .rt-link, .rt-label');
      if (!hit) return select(null);
      var id = hit.getAttribute('data-id');
      select({ type: hit.classList.contains('rt-node') ? 'node' : 'link', id: id });
    });
    select(null);
    rtSelect = select;
  }

  /* ------------------------------------------------------------------ understanding tab (#628) */

  var STATUS_CLASS = { 'не отмечено': 's0', 'слышал': 's1', 'понимаю': 's2', 'объясню сам': 's3' };

  function renderUnderstanding() {
    var host = document.getElementById('view-understanding');
    var U = D.understanding;
    if (!U || !U.people.length) {
      host.innerHTML = '<div class="health"><p class="lede">docs/architecture/understanding.yaml не найден или в нём нет людей.</p></div>';
      return;
    }
    var c = U.people[0];
    var topicById = new Map(U.topics.map(function (t) { return [t.id, t]; }));
    var pct = function (a, b) { return b ? Math.round((a / b) * 100) : 0; };
    var h = ['<div class="health und">'];
    h.push('<h2>Понимание — ' + esc(U.names[c.person] || c.person) + '</h2>');
    h.push('<p class="lede">Что из архитектуры человек может объяснить сам. Баллы: «понимаю» — 0,5, «объясню сам» — 1; ' +
      '«объясню сам» ставится только после задачи на понимание. Уровни считаются отдельно, чтобы дыра в обзоре ' +
      'не пряталась за деталями. Код — доля строк в модулях, которые покрывает понятая тема; знание подсистемы в ' +
      'общих чертах даёт модулю половину балла. Данные — <code>docs/architecture/understanding.yaml</code>.</p>');

    h.push('<div class="und-tiles">');
    c.levels.forEach(function (l, i) {
      var p = pct(l.score, l.topics);
      h.push('<div class="und-tile"><span>' + i + ' · ' + esc(l.title) + '</span><b>' + p + ' %</b>' +
        '<div class="und-bar"><i style="width:' + p + '%"></i></div><em>' + l.topics + ' тем</em></div>');
    });
    [['Код', c.code.loc, c.code.total, 'строк'], ['Код по правкам', c.code.churn, c.code.churnTotal, 'правок за полгода']]
      .forEach(function (r) {
        var p = pct(r[1], r[2]);
        h.push('<div class="und-tile code"><span>' + r[0] + '</span><b>' + p + ' %</b>' +
          '<div class="und-bar"><i style="width:' + p + '%"></i></div><em>из ' + Math.round(r[2]).toLocaleString('ru') +
          ' ' + r[3] + '</em></div>');
      });
    h.push('</div>');

    h.push('<h3>Изучать дальше</h3><p class="lede">Темы, до которых уже можно дойти: их родитель понят или его нет.</p><ul class="und-next">');
    c.next.slice(0, 6).forEach(function (id) { h.push('<li>' + topicLine(topicById.get(id))); });
    h.push('</ul>');

    if (c.hotspots.length) {
      h.push('<h3>Часто меняются, но непонятны</h3><p class="lede">Модули с наибольшим числом правок за полгода, ' +
        'которые не покрыты темой на уровне «понимаю». Сюда агенты пишут чаще всего — а проверить их некому.</p>');
      h.push('<table><thead><tr><th>модуль</th><th class="r">правок</th><th class="r">строк</th></tr></thead><tbody>');
      c.hotspots.forEach(function (id) {
        var m = byId.get(id);
        h.push('<tr><td><span class="link" data-jump="' + id + '">' + esc(m.title) + '</span></td><td class="r">' +
          m.churn + '</td><td class="r">' + m.loc.toLocaleString('ru') + '</td></tr>');
      });
      h.push('</tbody></table>');
    }

    h.push('<h3>Дерево тем</h3>');
    function branch(parentId) {
      var kids = U.topics.filter(function (t) { return (t.parent || null) === parentId; });
      if (!kids.length) return '';
      return '<ul class="und-tree">' + kids.map(function (t) {
        return '<li>' + topicLine(t, true) + branch(t.id) + '</li>';
      }).join('') + '</ul>';
    }
    h.push(branch(null));

    if (c.unreached.length) {
      h.push('<h3>Модули, до которых не дотягивается ни одна тема · ' + c.unreached.length + '</h3>' +
        '<p class="lede">Дыра не в понимании, а в самом списке тем.</p><p>' +
        c.unreached.map(function (id) {
          return '<span class="link" data-jump="' + id + '">' + esc((byId.get(id) || {}).title || id) + '</span>';
        }).join(' · ') + '</p>');
    }
    h.push('</div>');
    host.innerHTML = h.join('');
    wireJumps(host);
    host.querySelectorAll('[data-rt]').forEach(function (n) {
      n.addEventListener('click', function () {
        document.querySelector('.tabs button[data-tab="runtime"]').click();
        if (rtSelect) rtSelect({ type: 'link', id: n.getAttribute('data-rt') });
      });
    });
    host.querySelectorAll('[data-flows]').forEach(function (n) {
      n.addEventListener('click', function () { document.querySelector('.tabs button[data-tab="flows"]').click(); });
    });

    function topicLine(t, withRefs) {
      var st = c.status[t.id];
      var out = '<span class="und-status ' + STATUS_CLASS[st] + '">' + esc(st) + '</span> <b>' + esc(t.title) + '</b>' +
        ' <span class="tag">' + esc(U.levels[t.level]) + '</span>';
      if (t.issue) {
        out += ' <a class="link" target="_blank" rel="noreferrer" href="' + D.issuesBase + t.issue + '">#' + t.issue + '</a>';
      }
      if (t.why) out += '<div class="und-why">' + symText(t.why) + '</div>';
      if (withRefs) {
        var refs = [];
        (t.layers || []).forEach(function (id) { refs.push('слой ' + esc((layerById.get(id) || {}).title || id)); });
        (t.modules || []).forEach(function (id) {
          refs.push('<span class="link" data-jump="' + id + '">' + esc((byId.get(id) || {}).title || id) + '</span>');
        });
        (t.links || []).forEach(function (id) {
          var l = D.runtime && D.runtime.links.filter(function (x) { return x.id === id; })[0];
          refs.push('<span class="link" data-rt="' + id + '">⇄ ' + esc(l ? l.channel : id) + '</span>');
        });
        (t.flows || []).forEach(function (id) {
          var f = D.flows.filter(function (x) { return x.id === id; })[0];
          refs.push('<span class="link" data-flows>↓ ' + esc(f ? f.title : id) + '</span>');
        });
        (t.adr || []).forEach(function (id) {
          refs.push('<a class="link" target="_blank" rel="noreferrer" href="' + REPO + '/docs/adr/' + id + '.md">ADR ' +
            esc(id.slice(0, 3)) + '</a>');
        });
        if (refs.length) out += '<div class="und-refs">' + refs.join(' · ') + '</div>';
      }
      return out;
    }
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
  renderRuntime();
  renderHealth();
  renderUnderstanding();
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
