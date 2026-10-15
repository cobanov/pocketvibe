// WebGL 2 for three.js on the PS5, built on OpenGL 4.6 Core entry points that
// the native host binds by name (__glBind, see app/main.c). Most WebGL calls
// are the GL call itself; the rest translate WebGL's objects, overloads and
// pixel-store flags. Handles are objects with an `id` (three.js keys WeakMaps
// on them); the native bridge reads `id` when an object is passed as an int.
// Uniform locations are plain numbers, -1 when missing (GL ignores -1).

(() => {
  const C = globalThis.GL_CONSTANTS;
  const bind = (name, sig) => __glBind(name, sig);

  class GLHandle {
    constructor(id) { this.id = id; }
  }

  // [WebGL name, signature]: calls whose WebGL and GL forms take the same arguments.
  const direct = {
    activeTexture: 'v:i', attachShader: 'v:ii', bindAttribLocation: 'v:iis', bindBuffer: 'v:ii',
    bindBufferBase: 'v:iii', bindBufferRange: 'v:iiill', bindRenderbuffer: 'v:ii',
    bindTexture: 'v:ii', bindSampler: 'v:ii', blendColor: 'v:ffff', blendEquation: 'v:i',
    blendEquationSeparate: 'v:ii', blendFunc: 'v:ii', blendFuncSeparate: 'v:iiii',
    blitFramebuffer: 'v:iiiiiiiiii', checkFramebufferStatus: 'u:i', clear: 'v:i',
    clearColor: 'v:ffff', clearDepth: 'v:d', clearStencil: 'v:i', colorMask: 'v:bbbb',
    compileShader: 'v:i', copyBufferSubData: 'v:iilll', copyTexSubImage2D: 'v:iiiiiiii',
    cullFace: 'v:i', deleteProgram: 'v:i', deleteShader: 'v:i', depthFunc: 'v:i',
    depthMask: 'v:b', depthRange: 'v:dd', detachShader: 'v:ii', disable: 'v:i',
    disableVertexAttribArray: 'v:u', drawArrays: 'v:iii', drawArraysInstanced: 'v:iiii',
    drawElements: 'v:iiip', drawElementsInstanced: 'v:iiipi', drawRangeElements: 'v:iuuiip',
    enable: 'v:i', enableVertexAttribArray: 'v:u', finish: 'v:', flush: 'v:',
    framebufferRenderbuffer: 'v:iiii', framebufferTexture2D: 'v:iiiii',
    framebufferTextureLayer: 'v:iiiii', frontFace: 'v:i', generateMipmap: 'v:i',
    getError: 'u:', getAttribLocation: 'i:is', getUniformLocation: 'i:is',
    getUniformBlockIndex: 'u:is', hint: 'v:ii', isEnabled: 'b:i', lineWidth: 'v:f',
    linkProgram: 'v:i', polygonOffset: 'v:ff', renderbufferStorage: 'v:iiii',
    renderbufferStorageMultisample: 'v:iiiii', sampleCoverage: 'v:fb', scissor: 'v:iiii',
    stencilFunc: 'v:iiu', stencilFuncSeparate: 'v:iiiu', stencilMask: 'v:u',
    stencilMaskSeparate: 'v:iu', stencilOp: 'v:iii', stencilOpSeparate: 'v:iiii',
    texParameterf: 'v:iif', texParameteri: 'v:iii', texStorage2D: 'v:iiiii',
    texStorage3D: 'v:iiiiii', uniform1f: 'v:if', uniform2f: 'v:iff', uniform3f: 'v:ifff',
    uniform4f: 'v:iffff', uniform1i: 'v:ii', uniform2i: 'v:iii', uniform3i: 'v:iiii',
    uniform4i: 'v:iiiii', uniform1ui: 'v:iu', uniform2ui: 'v:iuu', uniform3ui: 'v:iuuu',
    uniform4ui: 'v:iuuuu', uniformBlockBinding: 'v:iuu', useProgram: 'v:i',
    validateProgram: 'v:i', vertexAttrib1f: 'v:uf', vertexAttrib2f: 'v:uff',
    vertexAttrib3f: 'v:ufff', vertexAttrib4f: 'v:uffff', vertexAttribDivisor: 'v:uu',
    vertexAttribIPointer: 'v:uiiip', vertexAttribPointer: 'v:uiibip', viewport: 'v:iiii',
    beginQuery: 'v:ii', endQuery: 'v:i',
  };
  const glName = (name) => `gl${name[0].toUpperCase()}${name.slice(1)}`;

  const gl = { ...C };
  for (const [name, sig] of Object.entries(direct)) {
    const fn = bind(glName(name), sig);
    if (fn) gl[name] = fn;
  }

  // Raw entry points the wrappers below build on.
  const raw = {};
  for (const [name, sig] of Object.entries({
    glGenBuffers: 'v:ip', glGenTextures: 'v:ip', glGenFramebuffers: 'v:ip',
    glGenRenderbuffers: 'v:ip', glGenVertexArrays: 'v:ip', glGenQueries: 'v:ip',
    glGenSamplers: 'v:ip', glDeleteBuffers: 'v:ip', glDeleteTextures: 'v:ip',
    glDeleteFramebuffers: 'v:ip', glDeleteRenderbuffers: 'v:ip', glDeleteVertexArrays: 'v:ip',
    glDeleteQueries: 'v:ip', glDeleteSamplers: 'v:ip', glCreateShader: 'u:i',
    glCreateProgram: 'u:', glShaderSource: 'v:iiSp', glGetShaderiv: 'v:iip',
    glGetProgramiv: 'v:iip', glGetShaderInfoLog: 'v:iipp', glGetProgramInfoLog: 'v:iipp',
    glGetActiveUniform: 'v:iuipppp', glGetActiveAttrib: 'v:iuipppp',
    glGetShaderPrecisionFormat: 'v:iipp', glGetIntegerv: 'v:ip', glGetFloatv: 'v:ip',
    glGetBooleanv: 'v:ip', glGetString: 's:i', glBindFramebuffer: 'v:ii',
    glBindVertexArray: 'v:i', glBufferData: 'v:ilpi', glBufferSubData: 'v:illp',
    glTexImage2D: 'v:iiiiiiiip', glTexSubImage2D: 'v:iiiiiiiip',
    glTexImage3D: 'v:iiiiiiiiip', glTexSubImage3D: 'v:iiiiiiiiiip',
    glCompressedTexImage2D: 'v:iiiiiiip', glReadPixels: 'v:iiiiiip', glPixelStorei: 'v:ii',
    glDrawBuffers: 'v:ip', glReadBuffer: 'v:i', glInvalidateFramebuffer: 'v:iip',
    glClearBufferfv: 'v:iip', glClearBufferiv: 'v:iip', glClearBufferuiv: 'v:iip',
    glClearBufferfi: 'v:iifi', glFenceSync: 'x:ii', glClientWaitSync: 'u:xil',
    glDeleteSync: 'v:x', glUniform1fv: 'v:iip', glUniform2fv: 'v:iip', glUniform3fv: 'v:iip',
    glUniform4fv: 'v:iip', glUniform1iv: 'v:iip', glUniform2iv: 'v:iip', glUniform3iv: 'v:iip',
    glUniform4iv: 'v:iip', glUniform1uiv: 'v:iip', glUniform2uiv: 'v:iip',
    glUniform3uiv: 'v:iip', glUniform4uiv: 'v:iip', glUniformMatrix2fv: 'v:iibp',
    glUniformMatrix3fv: 'v:iibp', glUniformMatrix4fv: 'v:iibp',
  })) raw[name] = bind(name, sig);

  const u32 = new Uint32Array(4);
  const i32 = new Int32Array(4);
  const f32 = new Float32Array(4);

  const gen = (fn) => () => { fn(1, u32); return new GLHandle(u32[0]); };
  const del = (fn) => (h) => { if (h) { u32[0] = h.id; fn(1, u32); } };
  Object.assign(gl, {
    createBuffer: gen(raw.glGenBuffers), createTexture: gen(raw.glGenTextures),
    createFramebuffer: gen(raw.glGenFramebuffers), createRenderbuffer: gen(raw.glGenRenderbuffers),
    createVertexArray: gen(raw.glGenVertexArrays), createQuery: gen(raw.glGenQueries),
    createSampler: gen(raw.glGenSamplers),
    deleteBuffer: del(raw.glDeleteBuffers), deleteTexture: del(raw.glDeleteTextures),
    deleteFramebuffer: del(raw.glDeleteFramebuffers), deleteRenderbuffer: del(raw.glDeleteRenderbuffers),
    deleteVertexArray: del(raw.glDeleteVertexArrays), deleteQuery: del(raw.glDeleteQueries),
    deleteSampler: del(raw.glDeleteSamplers),
    createShader: (type) => new GLHandle(raw.glCreateShader(type)),
    createProgram: () => new GLHandle(raw.glCreateProgram()),
  });

  const ascii = (bytes, n) => {
    let s = '';
    for (let i = 0; i < n; i += 8192) s += String.fromCharCode(...bytes.subarray(i, Math.min(n, i + 8192)));
    return s;
  };

  // Shaders: three.js writes GLSL ES 3.00. Mesa takes it in a core context
  // when it has ARB_ES3_compatibility; otherwise the header is swapped for
  // desktop GLSL, which accepts ES precision qualifiers.
  const sources = new WeakMap();
  let esShaders = true;
  const shaderSource = (shader, src) => {
    sources.set(shader, src);
    raw.glShaderSource(shader, 1, esShaders ? src : src.replace(/^\s*#version 300 es/, '#version 330 core'), null);
  };
  const compiles = (src) => {
    const s = raw.glCreateShader(C.VERTEX_SHADER);
    raw.glShaderSource(s, 1, src, null);
    gl.compileShader(s);
    raw.glGetShaderiv(s, C.COMPILE_STATUS, i32);
    gl.deleteShader(s);
    return i32[0] === 1;
  };
  esShaders = compiles('#version 300 es\nprecision highp float;\nin vec3 p;\nvoid main() { gl_Position = vec4(p, 1.0); }\n');
  console.log(`webgl: GLSL ES 3.00 ${esShaders ? 'native' : 'translated to 330 core'}`);

  const infoLog = (getiv, getLog) => (h) => {
    getiv(h, C.INFO_LOG_LENGTH, i32);
    const n = i32[0];
    if (n <= 1) return '';
    const buf = new Uint8Array(n);
    getLog(h, n, null, buf);
    return ascii(buf, n - 1);
  };
  const active = (fn) => {
    const name = new Uint8Array(256);
    const len = new Int32Array(1);
    const size = new Int32Array(1);
    const type = new Uint32Array(1);
    return (program, index) => {
      fn(program, index, 256, len, size, type, name);
      return len[0] > 0 ? { name: ascii(name, len[0]), size: size[0], type: type[0] } : null;
    };
  };
  const BOOL_PARAMS = new Set([C.COMPILE_STATUS, C.LINK_STATUS, C.DELETE_STATUS, C.VALIDATE_STATUS]);
  Object.assign(gl, {
    shaderSource,
    getShaderSource: (s) => sources.get(s) ?? null,
    getShaderParameter(s, p) { raw.glGetShaderiv(s, p, i32); return BOOL_PARAMS.has(p) ? i32[0] === 1 : i32[0]; },
    getProgramParameter(p, q) { raw.glGetProgramiv(p, q, i32); return BOOL_PARAMS.has(q) ? i32[0] === 1 : i32[0]; },
    getShaderInfoLog: infoLog(raw.glGetShaderiv, raw.glGetShaderInfoLog),
    getProgramInfoLog: infoLog(raw.glGetProgramiv, raw.glGetProgramInfoLog),
    getActiveUniform: active(raw.glGetActiveUniform),
    getActiveAttrib: active(raw.glGetActiveAttrib),
    getShaderPrecisionFormat(shaderType, precisionType) {
      raw.glGetShaderPrecisionFormat(shaderType, precisionType, i32, i32.subarray(2));
      return { rangeMin: i32[0], rangeMax: i32[1], precision: i32[2] };
    },
  });

  // Vector uniforms: WebGL takes the data (and an optional range); GL a count.
  const view = (data, Type, offset = 0, length) => {
    const v = ArrayBuffer.isView(data) ? data : new Type(data);
    return offset || length ? v.subarray(offset, length ? offset + length : undefined) : v;
  };
  for (const [suffix, Type] of [['f', Float32Array], ['i', Int32Array], ['ui', Uint32Array]]) {
    for (const n of [1, 2, 3, 4]) {
      const fn = raw[`glUniform${n}${suffix}v`];
      gl[`uniform${n}${suffix}v`] = (loc, data, offset, length) => {
        const v = view(data, Type, offset, length);
        fn(loc, v.length / n, v);
      };
    }
  }
  for (const n of [2, 3, 4]) {
    const fn = raw[`glUniformMatrix${n}fv`];
    gl[`uniformMatrix${n}fv`] = (loc, transpose, data, offset, length) => {
      const v = view(data, Float32Array, offset, length);
      fn(loc, v.length / (n * n), transpose, v);
    };
  }

  const bytes = (data, offset = 0, length) => {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (!offset && !length) return data;
    return data.subarray(offset, length ? offset + length : undefined);
  };
  gl.bufferData = (target, data, usage, offset, length) => {
    if (typeof data === 'number') return raw.glBufferData(target, data, null, usage);
    const v = bytes(data, offset, length);
    raw.glBufferData(target, v.byteLength, v, usage);
  };
  gl.bufferSubData = (target, dst, data, offset, length) => {
    const v = bytes(data, offset, length);
    raw.glBufferSubData(target, dst, v.byteLength, v);
  };

  // Textures. Pixel-store flags that only WebGL has are kept here: flipY is
  // applied to typed-array uploads (three.js sets it for image textures).
  const unpack = { [C.UNPACK_FLIP_Y_WEBGL]: false, [C.UNPACK_PREMULTIPLY_ALPHA_WEBGL]: false, [C.UNPACK_COLORSPACE_CONVERSION_WEBGL]: C.BROWSER_DEFAULT_WEBGL };
  gl.pixelStorei = (p, v) => { if (p in unpack) unpack[p] = v; else raw.glPixelStorei(p, v); };

  const COMPONENTS = { [C.RED]: 1, [C.RED_INTEGER]: 1, [C.RG]: 2, [C.RG_INTEGER]: 2, [C.RGB]: 3, [C.RGB_INTEGER]: 3, [C.RGBA]: 4, [C.RGBA_INTEGER]: 4, [C.DEPTH_COMPONENT]: 1, [C.DEPTH_STENCIL]: 1, [C.LUMINANCE]: 1, [C.LUMINANCE_ALPHA]: 2, [C.ALPHA]: 1 };
  const TYPE_BYTES = { [C.UNSIGNED_BYTE]: 1, [C.BYTE]: 1, [C.UNSIGNED_SHORT]: 2, [C.SHORT]: 2, [C.HALF_FLOAT]: 2, [C.UNSIGNED_INT]: 4, [C.INT]: 4, [C.FLOAT]: 4, [C.UNSIGNED_INT_24_8]: 4 };
  const PACKED = new Set([C.UNSIGNED_SHORT_5_6_5, C.UNSIGNED_SHORT_4_4_4_4, C.UNSIGNED_SHORT_5_5_5_1]);
  const pixelBytes = (format, type) => (PACKED.has(type) ? 2 : (COMPONENTS[format] ?? 4) * (TYPE_BYTES[type] ?? 1));

  const flipRows = (data, w, h, depth, format, type) => {
    const row = w * pixelBytes(format, type);
    const src = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const out = new Uint8Array(src.length);
    for (let z = 0; z < depth; z++) {
      const base = z * row * h;
      for (let y = 0; y < h; y++) out.set(src.subarray(base + y * row, base + (y + 1) * row), base + (h - 1 - y) * row);
    }
    return out;
  };
  const pixels = (data, w, h, depth, format, type, offset) => {
    if (data == null || typeof data === 'number') return data ?? null;
    const v = offset ? data.subarray(offset) : data;
    return unpack[C.UNPACK_FLIP_Y_WEBGL] ? flipRows(v, w, h, depth, format, type) : v;
  };
  // 2D canvases and ImageData give their pixels; images and bitmaps have none
  // yet (shortcut: blank until image decoding lands in Faz 1).
  let blank = new Uint8Array(0);
  const sourcePixels = (source, format, type) => {
    const data = source?.ctx2d?.data ?? source?.data;
    if (data && ArrayBuffer.isView(data)) return pixels(data, source.width, source.height, 1, format, type);
    const n = (source?.width ?? 1) * (source?.height ?? 1) * pixelBytes(format, type);
    if (blank.length < n) blank = new Uint8Array(n);
    return blank;
  };
  gl.texImage2D = (target, level, internal, a, b, c, d, e, f, g) => {
    if (f !== undefined || typeof c === 'number') {
      raw.glTexImage2D(target, level, internal, a, b, c, d, e, pixels(f, a, b, 1, d, e, g));
    } else {
      raw.glTexImage2D(target, level, internal, c?.width ?? 1, c?.height ?? 1, 0, a, b, sourcePixels(c, a, b));
    }
  };
  gl.texSubImage2D = (target, level, x, y, a, b, c, d, e, f) => {
    if (e !== undefined || typeof c === 'number') {
      raw.glTexSubImage2D(target, level, x, y, a, b, c, d, pixels(e, a, b, 1, c, d, f));
    } else {
      raw.glTexSubImage2D(target, level, x, y, c?.width ?? 1, c?.height ?? 1, a, b, sourcePixels(c, a, b));
    }
  };
  gl.texImage3D = (target, level, internal, w, h, depth, border, format, type, data, offset) =>
    raw.glTexImage3D(target, level, internal, w, h, depth, border, format, type, pixels(data, w, h, depth, format, type, offset));
  gl.texSubImage3D = (target, level, x, y, z, w, h, depth, format, type, data, offset) =>
    raw.glTexSubImage3D(target, level, x, y, z, w, h, depth, format, type, pixels(data, w, h, depth, format, type, offset));
  gl.compressedTexImage2D = (target, level, internal, w, h, border, data) =>
    raw.glCompressedTexImage2D(target, level, internal, w, h, border, data.byteLength, data);
  gl.readPixels = (x, y, w, h, format, type, dst, offset) =>
    raw.glReadPixels(x, y, w, h, format, type, typeof dst === 'number' || !offset ? dst : dst.subarray(offset));

  // The canvas is an offscreen framebuffer (see app/main.c): "no framebuffer"
  // means that one, and BACK means its color attachment.
  const canvasFramebuffer = new GLHandle(0);
  let drawFramebuffer = null;
  let readFramebuffer = null;
  gl.bindFramebuffer = (target, fb) => {
    if (target !== C.READ_FRAMEBUFFER) drawFramebuffer = fb;
    if (target !== C.DRAW_FRAMEBUFFER) readFramebuffer = fb;
    raw.glBindFramebuffer(target, fb ?? canvasFramebuffer);
  };
  const back = (b) => (b === C.BACK ? C.COLOR_ATTACHMENT0 : b);
  gl.drawBuffers = (list) => {
    const a = new Uint32Array(drawFramebuffer ? list : list.map(back));
    raw.glDrawBuffers(a.length, a);
  };
  gl.readBuffer = (src) => raw.glReadBuffer(readFramebuffer ? src : back(src));
  gl.invalidateFramebuffer = (target, list) => {
    const fb = target === C.READ_FRAMEBUFFER ? readFramebuffer : drawFramebuffer;
    const map = fb ? (x) => x : (x) => (x === C.COLOR ? C.COLOR_ATTACHMENT0 : x === C.DEPTH ? C.DEPTH_ATTACHMENT : x === C.STENCIL ? C.STENCIL_ATTACHMENT : x);
    const a = new Uint32Array(list.map(map));
    raw.glInvalidateFramebuffer(target, a.length, a);
  };
  gl.clearBufferfv = (buffer, index, values, offset = 0) => raw.glClearBufferfv(buffer, index, view(values, Float32Array, offset));
  gl.clearBufferiv = (buffer, index, values, offset = 0) => raw.glClearBufferiv(buffer, index, view(values, Int32Array, offset));
  gl.clearBufferuiv = (buffer, index, values, offset = 0) => raw.glClearBufferuiv(buffer, index, view(values, Uint32Array, offset));
  gl.clearBufferfi = raw.glClearBufferfi;

  // A core context needs a vertex array bound where WebGL has a default one.
  const defaultVertexArray = gl.createVertexArray();
  raw.glBindVertexArray(defaultVertexArray);
  gl.bindVertexArray = (vao) => raw.glBindVertexArray(vao ?? defaultVertexArray);

  gl.fenceSync = (condition, flags) => ({ sync: raw.glFenceSync(condition, flags) });
  gl.clientWaitSync = (s, flags, timeout) => raw.glClientWaitSync(s.sync, flags, timeout);
  gl.deleteSync = (s) => s && raw.glDeleteSync(s.sync);

  const EXTENSIONS = {
    EXT_color_buffer_float: {},
    EXT_color_buffer_half_float: {},
    OES_texture_float_linear: {},
    EXT_texture_filter_anisotropic: { TEXTURE_MAX_ANISOTROPY_EXT: 0x84fe, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff },
    WEBGL_debug_renderer_info: { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 },
  };
  gl.getExtension = (name) => EXTENSIONS[name] ?? null;
  gl.getSupportedExtensions = () => Object.keys(EXTENSIONS);

  const INT_ARRAYS = { [C.VIEWPORT]: 4, [C.SCISSOR_BOX]: 4, [C.MAX_VIEWPORT_DIMS]: 2 };
  const FLOAT_ARRAYS = { [C.COLOR_CLEAR_VALUE]: 4, [C.BLEND_COLOR]: 4, [C.ALIASED_LINE_WIDTH_RANGE]: 2, [C.ALIASED_POINT_SIZE_RANGE]: 2, [C.DEPTH_RANGE]: 2 };
  gl.getParameter = (p) => {
    switch (p) {
      case C.VERSION: return 'WebGL 2.0 (PocketVibe, OpenGL 4.6 on PS5)';
      case C.SHADING_LANGUAGE_VERSION: return 'WebGL GLSL ES 3.00';
      case C.VENDOR: case C.RENDERER: return raw.glGetString(p);
      case 0x9245: return raw.glGetString(C.VENDOR);
      case 0x9246: return raw.glGetString(C.RENDERER);
      case 0x84ff: raw.glGetFloatv(p, f32); return f32[0];
      case C.SAMPLES: return 0;
    }
    if (p in unpack) return unpack[p];
    if (p in INT_ARRAYS) { const a = new Int32Array(4); raw.glGetIntegerv(p, a); return a.slice(0, INT_ARRAYS[p]); }
    if (p in FLOAT_ARRAYS) { const a = new Float32Array(4); raw.glGetFloatv(p, a); return a.slice(0, FLOAT_ARRAYS[p]); }
    raw.glGetIntegerv(p, i32);
    return i32[0];
  };

  Object.assign(gl, {
    canvas: null,
    drawingBufferWidth: 0,
    drawingBufferHeight: 0,
    drawingBufferColorSpace: 'srgb',
    unpackColorSpace: 'srgb',
    getContextAttributes: () => ({ alpha: true, antialias: false, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false, desynchronized: false }),
    isContextLost: () => false,
    // Called by the canvas when its size changes.
    resize(w, h) {
      canvasFramebuffer.id = __ps5.resize(w, h);
      gl.drawingBufferWidth = w;
      gl.drawingBufferHeight = h;
      drawFramebuffer = readFramebuffer = null;
    },
  });

  globalThis.__gl = gl;
})();
