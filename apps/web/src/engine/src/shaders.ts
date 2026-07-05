// Generates paper height map via GPU noise — no tiling, no sin() artifacts
export const PAPER_GEN_VERT = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

export const PAPER_GEN_FRAG = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_scale;    // base grain frequency (cells across canvas width)
  uniform float u_gain;     // per-octave amplitude falloff
  uniform float u_contrast;
  uniform float u_warp;     // domain warp strength

  // Artifact-free hash — no sin(), no diagonal banding (Inigo Quilez)
  float hash(vec2 p) {
    p = 17.0 * fract(p * 0.3183099 + vec2(0.11, 0.17));
    return fract(p.x * p.y * (p.x + p.y));
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),              hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // 4-octave fBm (WebGL1: fixed loop count)
  float fbm(vec2 p) {
    float v=0., a=0.5, s=0., f=1.;
    v+=a*vnoise(p*f); s+=a; a*=u_gain; f*=2.1;
    v+=a*vnoise(p*f); s+=a; a*=u_gain; f*=2.1;
    v+=a*vnoise(p*f); s+=a; a*=u_gain; f*=2.1;
    v+=a*vnoise(p*f); s+=a;
    return v / s;
  }

  void main() {
    // u_scale = how many grain cells fit across canvas width
    // e.g. scale=200 → cell = canvasWidth/200 ≈ 5px physical (for 1000px canvas)
    vec2 uv = gl_FragCoord.xy / u_resolution * u_scale;

    // Domain warping: displace uv by another noise pass
    // This breaks up any grid/banding artifacts and creates organic fiber-like look
    vec2 q = vec2(
      fbm(uv + vec2(0.0,  0.0)),
      fbm(uv + vec2(3.7,  5.4))
    );
    float h = fbm(uv + u_warp * q);

    // Contrast: >1 sharpens peaks (rougher feel), <1 softens
    h = pow(clamp(h, 0.0, 1.0), 1.0 / u_contrast);
    gl_FragColor = vec4(h, h, h, 1.0);
  }
`;

export const DAB_VERT = `
  attribute vec2 a_position;

  uniform vec2 u_dabCenter;
  uniform float u_dabRadius;
  uniform float u_angle;
  uniform float u_aspectRatio; // width / height, >1 means wider than tall (tilt effect)
  uniform vec2 u_resolution;

  varying vec2 v_localUV;

  void main() {
    v_localUV = a_position * 2.0;

    float c = cos(u_angle);
    float s = sin(u_angle);

    // Apply aspect ratio along local X axis (tilt makes pencil mark wider)
    vec2 scaled = vec2(a_position.x * u_aspectRatio, a_position.y);

    vec2 rotated = vec2(
      scaled.x * c - scaled.y * s,
      scaled.x * s + scaled.y * c
    );

    vec2 screenPos = rotated * u_dabRadius * 2.0 + u_dabCenter;
    vec2 clip = (screenPos / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

export const DAB_FRAG = `
  precision highp float;

  uniform sampler2D u_paperHeightMap;
  uniform float u_pressure;
  uniform float u_tiltX;
  uniform float u_tiltY;
  uniform float u_hardness;
  uniform float u_opacity;
  uniform vec2 u_resolution;
  uniform vec2 u_paperScale;
  uniform float u_aspectRatio;
  // 0=bristol (graphite fills valleys too, near-uniform deposit)
  // 1=rough   (graphite only on peaks, strong grain in stroke)
  uniform float u_paperRoughness;
  uniform float u_eraseMode; // 1.0 = eraser, 0.0 = pencil
  // Baked into the accumulation buffer per dab (premultiplied below) so each
  // stroke keeps the color it was drawn with — see u_graphiteColor's removal
  // from DISPLAY_FRAG for why color can no longer live at composite time.
  uniform vec3 u_color;

  varying vec2 v_localUV;

  #define PI 3.14159265

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = vec2(v_localUV.x / max(u_aspectRatio, 1.0), v_localUV.y);
    float dist = length(uv);
    if (dist > 1.0) discard;

    float innerEdge = u_hardness * 0.85;
    float shape = 1.0 - smoothstep(innerEdge, 1.0, dist);
    shape *= 1.0 - exp(-8.0 * (1.0 - dist));

    // Eraser: output alpha that drives ZERO,ONE_MINUS_SRC_ALPHA blend to clear graphite
    if (u_eraseMode > 0.5) {
      float eraseAmount = clamp(u_pressure * u_opacity * shape, 0.0, 1.0);
      gl_FragColor = vec4(0.0, 0.0, 0.0, eraseAmount);
      return;
    }

    vec2 screenUV = gl_FragCoord.xy / u_resolution;
    vec2 paperUV = screenUV * u_paperScale;

    float texelX = 1.0 / (u_resolution.x * u_paperScale.x);
    float texelY = 1.0 / (u_resolution.y * u_paperScale.y);
    float h   = texture2D(u_paperHeightMap, paperUV).r;
    float hDx = texture2D(u_paperHeightMap, paperUV + vec2(texelX, 0.0)).r;
    float hDy = texture2D(u_paperHeightMap, paperUV + vec2(0.0, texelY)).r;

    // Scale normal influence by roughness: rough paper has sharper peaks to catch
    float normalScale = mix(2.0, 10.0, u_paperRoughness);
    vec2 surfaceNormal = vec2(h - hDx, h - hDy) * normalScale;

    float tx = sin(u_tiltX * PI / 180.0);
    float ty = sin(u_tiltY * PI / 180.0);
    float tiltMag = sqrt(tx * tx + ty * ty);

    // paperCatch: how much graphite this surface point receives.
    // floor  = deposit even in deepest valley (high on smooth, low on rough)
    // power  = contrast of height response (high=strong grain, low=uniform fill)
    float floor_ = mix(0.82, 0.15, u_paperRoughness);
    float power  = mix(0.35, 2.8,  u_paperRoughness);

    float paperCatch;
    if (tiltMag < 0.05) {
      paperCatch = mix(floor_, 1.0, pow(h, power));
    } else {
      vec2 tiltDir = vec2(tx, ty) / tiltMag;
      float directionalHit = max(0.0, dot(tiltDir, surfaceNormal) * 3.0 + 0.5);
      float heightBase = mix(floor_, 1.0, pow(h, power));
      paperCatch = mix(heightBase, clamp(directionalHit, 0.0, 1.0), min(tiltMag * 1.5, 1.0));
    }

    float grain = hash(gl_FragCoord.xy * 0.5) * 0.12 - 0.06;
    float deposit = clamp(u_pressure * u_opacity * paperCatch * shape + grain * shape, 0.0, 1.0);
    // Premultiplied by deposit, matching the ONE,ONE_MINUS_SRC_ALPHA "over"
    // blend AccumulationBuffer.beginDraw() sets up — this is what lets dabs of
    // different colors composite correctly over each other and over earlier
    // strokes instead of one uniform tint being reapplied to everything.
    gl_FragColor = vec4(u_color * deposit, deposit);
  }
`;

export const DISPLAY_VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Composites one layer onto the composite FBO with opacity.
// Blend mode: ONE, ONE_MINUS_SRC_ALPHA  →  Porter-Duff "over"
// Passes the layer's own premultiplied color through (scaled by opacity)
// rather than discarding it — each layer's accumulation buffer already
// carries the real per-stroke colors baked in by DAB_FRAG.
export const LAYER_COMPOSITE_FRAG = `
  precision mediump float;
  uniform sampler2D u_layer;
  uniform float u_opacity;
  varying vec2 v_uv;
  void main() {
    vec4 c = texture2D(u_layer, v_uv);
    gl_FragColor = vec4(c.rgb * u_opacity, c.a * u_opacity);
  }
`;

export const DISPLAY_FRAG = `
  precision highp float;

  uniform sampler2D u_accumulation;
  uniform sampler2D u_paperMap;
  uniform vec3 u_paperColor;
  uniform vec2 u_paperScale;

  varying vec2 v_uv;

  void main() {
    // composite FBO stores premultiplied graphite color in .rgb, coverage in .a
    vec4 acc = texture2D(u_accumulation, v_uv);
    float graphite = acc.a;
    vec3 strokeColor = graphite > 0.001 ? acc.rgb / graphite : vec3(0.0);

    vec2 paperUV = v_uv * u_paperScale;
    float paperHeight = texture2D(u_paperMap, paperUV).r;

    // Paper color varies slightly with texture (highlights on raised areas).
    // Kept subtle (#95, further softened per follow-up feedback) — real
    // paper grain reads as a faint variation, not a visible bas-relief.
    vec3 paperTone = u_paperColor * (0.965 + 0.03 * paperHeight);

    // Graphite shows paper texture through it — in valleys paper peeks through even in dark areas.
    // Blending toward paperTone (rather than scaling strokeColor toward black) is what actually
    // models "paper peeking through" for any stroke color — a multiplicative darken only looked
    // right for the old fixed dark-graphite tone; on a light/white color it read as gray blotches.
    float graphiteTexture = mix(1.0, paperHeight * 0.5 + 0.2, graphite * 0.25);
    vec3 graphiteTone = mix(paperTone, strokeColor, graphiteTexture);

    // Final composite
    vec3 color = mix(paperTone, graphiteTone, graphite);

    gl_FragColor = vec4(color, 1.0);
  }
`;
