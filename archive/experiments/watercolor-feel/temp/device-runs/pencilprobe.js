const e = window.__engine
const layerId = e._activeId
const dab = (x, y) => ({ x, y, pressure: 1, tiltX: 0, tiltY: 0, size: 120, aspectRatio: 1, angle: 0, opacity: 1, t: 0 })
const n = Math.floor(Math.random() * 1e6)
const dabs = []; for (let x = 300; x <= 900; x += 7.2) dabs.push(dab(x, 500 + (n % 5) * 30))
e.appendOperation({ id: 'probe-' + n, type: 'stroke', userId: 'e2e', timestamp: Date.now(), layerId, tool: "pencil", preset: "6B", color: [0.1, 0.1, 0.1], dabs, strokeId: 'pg-' + n })
const c = e.pickColor(600, 500 + (n % 5) * 30)
return JSON.stringify({ c, layerId })
