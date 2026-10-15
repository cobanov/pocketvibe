// A WebGL 2 context that draws nothing, for timing a game's JavaScript alone.
// Programs report the uniforms and attributes their source declares, so
// three.js does its usual per-draw uniform work. Uniforms inside inactive
// #if blocks are counted too, so the cost is an upper bound.

(() => {
  const C = globalThis.GL_CONSTANTS;
  const TYPES = {
    float: C.FLOAT, vec2: C.FLOAT_VEC2, vec3: C.FLOAT_VEC3, vec4: C.FLOAT_VEC4,
    int: C.INT, ivec2: C.INT_VEC2, ivec3: C.INT_VEC3, ivec4: C.INT_VEC4,
    uint: C.UNSIGNED_INT, bool: C.BOOL, mat2: C.FLOAT_MAT2, mat3: C.FLOAT_MAT3, mat4: C.FLOAT_MAT4,
    sampler2D: C.SAMPLER_2D, samplerCube: C.SAMPLER_CUBE, sampler3D: C.SAMPLER_3D,
    sampler2DShadow: C.SAMPLER_2D_SHADOW, sampler2DArray: C.SAMPLER_2D_ARRAY,
    usampler2D: C.UNSIGNED_INT_SAMPLER_2D, isampler2D: C.INT_SAMPLER_2D,
  };

  // The lines of a shader the preprocessor keeps, and its numeric defines.
  // Enough of #if for three.js's shaders: defined(), numbers, && || ! < > ==.
  function preprocess(src, defines) {
    const out = [];
    const stack = []; // per open #if: [this branch on, some branch taken, parent on]
    const on = () => stack.every((s) => s[0]);
    const test = (expr) => {
      const js = expr
        .replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (_, a, b) => ((a ?? b) in defines ? '1' : '0'))
        .replace(/\b[A-Za-z_]\w*\b/g, (id) => String(+defines[id] || 0));
      return !!Function(`return (${js});`)();
    };
    for (const line of src.split('\n')) {
      const m = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
      const d = m?.[1];
      if (d === 'if' || d === 'ifdef' || d === 'ifndef') {
        const parent = on();
        const v = parent && (d === 'if' ? test(m[2]) : (m[2].trim() in defines) === (d === 'ifdef'));
        stack.push([v, v]);
      } else if (d === 'elif' || d === 'else') {
        const top = stack[stack.length - 1];
        stack.pop();
        const parent = on();
        const v = parent && !top[1] && (d === 'else' || test(m[2]));
        stack.push([v, top[1] || v]);
      } else if (d === 'endif') {
        stack.pop();
      } else if (on()) {
        if (d === 'define') {
          const [, name, value = ''] = /^(\w+)\s*(.*)$/.exec(m[2]);
          defines[name] = value.trim();
        } else if (!d) out.push(line);
      }
    }
    return out.join('\n');
  }

  // Active uniforms ({name, size, type}) and attributes of a vertex and
  // fragment shader pair, as a driver would list them.
  function reflect(vsSource, fsSource) {
    const vsDefines = {};
    const fsDefines = {};
    const vs = preprocess(vsSource, vsDefines);
    const src = `${vs}\n${preprocess(fsSource, fsDefines)}`;
    const defines = { ...vsDefines, ...fsDefines };
    const structs = {};
    for (const m of src.matchAll(/struct\s+(\w+)\s*\{([^}]*)\}/g)) {
      structs[m[1]] = [...m[2].matchAll(/(\w+)\s+(\w+)\s*;/g)].map((f) => [f[1], f[2]]);
    }
    const uniforms = new Map();
    const add = (type, name, count) => {
      if (structs[type]) {
        for (let i = 0; i < (count ?? 1); i++) {
          for (const [ft, fn] of structs[type]) add(ft, `${name}${count ? `[${i}]` : ''}.${fn}`);
        }
      } else if (TYPES[type] && !uniforms.has(name)) {
        uniforms.set(name, { name: count ? `${name}[0]` : name, size: count ?? 1, type: TYPES[type] });
      }
    };
    for (const m of src.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(?:\[\s*(\w+)\s*\])?\s*;/g)) {
      const count = m[3] === undefined ? undefined : +m[3] || +defines[m[3]] || 0;
      if (count !== 0) add(m[1], m[2], count);
    }
    const attributes = [];
    for (const m of vs.matchAll(/^\s*(?:attribute|in)\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;/gm)) {
      if (TYPES[m[1]] && !attributes.some((a) => a.name === m[2])) attributes.push({ name: m[2], size: 1, type: TYPES[m[1]] });
    }
    return { uniforms: [...uniforms.values()], attributes };
  }

  const params = {
    [C.VERSION]: 'WebGL 2.0 (PocketVibe null)',
    [C.SHADING_LANGUAGE_VERSION]: 'WebGL GLSL ES 3.00',
    [C.MAX_TEXTURE_IMAGE_UNITS]: 16, [C.MAX_VERTEX_TEXTURE_IMAGE_UNITS]: 16,
    [C.MAX_COMBINED_TEXTURE_IMAGE_UNITS]: 32, [C.MAX_TEXTURE_SIZE]: 16384,
    [C.MAX_CUBE_MAP_TEXTURE_SIZE]: 16384, [C.MAX_VERTEX_ATTRIBS]: 16,
    [C.MAX_VERTEX_UNIFORM_VECTORS]: 4096, [C.MAX_VARYING_VECTORS]: 30,
    [C.MAX_FRAGMENT_UNIFORM_VECTORS]: 1024, [C.MAX_SAMPLES]: 4,
    [C.MAX_RENDERBUFFER_SIZE]: 16384, [C.MAX_3D_TEXTURE_SIZE]: 2048,
    [C.MAX_ARRAY_TEXTURE_LAYERS]: 2048, [C.MAX_DRAW_BUFFERS]: 8, [C.MAX_COLOR_ATTACHMENTS]: 8,
    [C.MAX_UNIFORM_BUFFER_BINDINGS]: 72,
  };

  const gl = { ...C, drawingBufferWidth: 1920, drawingBufferHeight: 1080, drawingBufferColorSpace: 'srgb' };
  const noop = () => {};
  const obj = () => ({});
  Object.assign(gl, {
    getContextAttributes: () => ({ alpha: false, antialias: false, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }),
    isContextLost: () => false,
    getExtension: () => null,
    getSupportedExtensions: () => [],
    getParameter: (p) => (p === C.VIEWPORT || p === C.SCISSOR_BOX ? new Int32Array([0, 0, 1920, 1080]) : (params[p] ?? 0)),
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    getError: () => 0,
    createShader: (type) => ({ type, source: '' }),
    shaderSource: (s, src) => { s.source = src; },
    getShaderSource: (s) => s.source,
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    createProgram: () => ({ shaders: [] }),
    attachShader: (p, s) => p.shaders.push(s),
    linkProgram: (p) => {
      const vs = p.shaders.find((s) => s.type === C.VERTEX_SHADER)?.source ?? '';
      const fs = p.shaders.find((s) => s.type === C.FRAGMENT_SHADER)?.source ?? '';
      p.info = reflect(vs, fs);
    },
    getProgramParameter: (p, q) => (q === C.ACTIVE_UNIFORMS ? p.info.uniforms.length : q === C.ACTIVE_ATTRIBUTES ? p.info.attributes.length : true),
    getProgramInfoLog: () => '',
    getActiveUniform: (p, i) => p.info.uniforms[i],
    getActiveAttrib: (p, i) => p.info.attributes[i],
    getUniformLocation: (p, name) => ({ name }),
    getAttribLocation: (p, name) => p.info.attributes.findIndex((a) => a.name === name),
    getUniformBlockIndex: () => C.INVALID_INDEX,
    createBuffer: obj, createTexture: obj, createFramebuffer: obj, createRenderbuffer: obj,
    createVertexArray: obj, createQuery: obj, createSampler: obj,
    checkFramebufferStatus: () => C.FRAMEBUFFER_COMPLETE,
    fenceSync: obj,
    clientWaitSync: () => C.ALREADY_SIGNALED,
  });
  // Every other WebGL call (state, uploads, uniforms, draws) does nothing.
  const calls = 'activeTexture bindAttribLocation bindBuffer bindBufferBase bindBufferRange bindFramebuffer bindRenderbuffer bindTexture bindVertexArray blendColor blendEquation blendEquationSeparate blendFunc blendFuncSeparate blitFramebuffer bufferData bufferSubData clear clearBufferfv clearBufferiv clearBufferuiv clearColor clearDepth clearStencil colorMask compileShader compressedTexImage2D compressedTexImage3D copyBufferSubData copyTexSubImage2D cullFace deleteBuffer deleteFramebuffer deleteProgram deleteQuery deleteRenderbuffer deleteShader deleteSync deleteTexture deleteVertexArray depthFunc depthMask depthRange detachShader disable disableVertexAttribArray drawArrays drawArraysInstanced drawBuffers drawElements drawElementsInstanced enable enableVertexAttribArray finish flush framebufferRenderbuffer framebufferTexture2D framebufferTextureLayer frontFace generateMipmap hint invalidateFramebuffer lineWidth pixelStorei polygonOffset readBuffer readPixels renderbufferStorage renderbufferStorageMultisample scissor stencilFunc stencilFuncSeparate stencilMask stencilMaskSeparate stencilOp stencilOpSeparate texImage2D texImage3D texParameterf texParameteri texStorage2D texStorage3D texSubImage2D texSubImage3D uniform1f uniform1fv uniform1i uniform1iv uniform1ui uniform1uiv uniform2f uniform2fv uniform2i uniform2iv uniform3f uniform3fv uniform3i uniform3iv uniform4f uniform4fv uniform4i uniform4iv uniformBlockBinding uniformMatrix2fv uniformMatrix3fv uniformMatrix4fv useProgram vertexAttrib1f vertexAttrib2f vertexAttrib3f vertexAttrib4f vertexAttribDivisor vertexAttribIPointer vertexAttribPointer viewport beginQuery endQuery';
  for (const name of calls.split(' ')) gl[name] = noop;
  gl.draws = 0;
  gl.drawElements = gl.drawArrays = gl.drawElementsInstanced = gl.drawArraysInstanced = () => gl.draws++;
  gl.resize = () => {};
  globalThis.__gl = gl;
})();
