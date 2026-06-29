export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

export function createProgram(gl, vertSrc, fragSrc) {
  const vert = createShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${info}`);
  }
  return program;
}

export function getUniforms(gl, program, names) {
  const locs = {};
  for (const name of names) {
    locs[name] = gl.getUniformLocation(program, name);
  }
  return locs;
}

// Create a unit quad buffer: two triangles covering -0.5..0.5
export function createQuadBuffer(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5,
     0.5, -0.5,
    -0.5,  0.5,
    -0.5,  0.5,
     0.5, -0.5,
     0.5,  0.5,
  ]), gl.STATIC_DRAW);
  return buf;
}

// Full-screen quad: -1..1
export function createFullscreenQuad(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1,
  ]), gl.STATIC_DRAW);
  return buf;
}
