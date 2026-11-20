import { renderBrushSample } from './engine/brushSample'
// Dedicated static entry for the server worker: no app, room, identity or API bootstrap.
window.renderGrafettoBrushSample = renderBrushSample
