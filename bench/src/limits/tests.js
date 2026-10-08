// The limits tests. Each test raises one cost step by step; the harness
// measures every step in a fresh page and stops a test once it is far too
// slow. Values go from cheap to expensive.
//
//   id, about       name and what it answers
//   values          the steps
//   kind            'gl' (default), '2d' (a 2D canvas, no WebGL) or 'once'
//                   (a single timing instead of a frame rate)
//   renderer(v)     WebGL options for a step: { antialias, scale }
//   setup(ctx, v)   builds the step; may return { update(t, dt), render() }
//   once(ctx, v)    for 'once' tests: returns the measured fields

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { H, W, dotTexture, ground, material, patternCanvas, rng, sphereField, spread, stage, typical, uncached } from './scene.js';

const dummy = new THREE.Object3D();

// Waits until the GPU has finished everything queued so far.
function finish(renderer) {
  const gl = renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}

// Small separate meshes for the draw call tests. A tetrahedron is 4
// triangles, so even 2000 of them stay inside the triangle budget and the
// tests measure the calls, not the triangles.
function pieces(ctx, count, { unique = false } = {}) {
  const geometry = new THREE.TetrahedronGeometry(0.5);
  const shared = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
  const r = rng(3);
  return spread(count).map(([x, z]) => {
    const mesh = unique
      ? new THREE.Mesh(new THREE.TetrahedronGeometry(0.5), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(r(), 0.6, 0.5) }))
      : new THREE.Mesh(geometry, shared);
    mesh.position.set(x, 0.5, z);
    ctx.scene.add(mesh);
    return mesh;
  });
}

// One mesh of `total` triangles, past the far plane: the GPU throws every
// triangle away, so only the CPU side of drawing it is measured.
function hiddenTerrain(ctx, total, indexed) {
  const seg = Math.round(Math.sqrt(total / 2));
  let geometry = new THREE.PlaneGeometry(60, 60, seg, seg).rotateX(-Math.PI / 2).translate(0, 0, -400);
  if (!indexed) geometry = geometry.toNonIndexed();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0x6aa84f }));
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
}

// Planes that cover the whole screen, just in front of the camera.
function screenPlanes(ctx, count, makeMaterial) {
  ctx.scene.add(ctx.camera);
  for (let i = 0; i < count; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), makeMaterial(i));
    plane.position.z = -1 - i * 0.001;
    plane.renderOrder = 10 + i;
    ctx.camera.add(plane);
  }
}

function hudStyle(el, css) {
  Object.assign(el.style, { position: 'absolute', font: 'bold 18px sans-serif', color: '#fff', textShadow: '0 2px 0 #000', ...css });
  return el;
}

const K = (n) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : String(n));

export const TESTS = [
  {
    id: 'info',
    about: 'What the browser reports about the GPU',
    kind: 'once',
    values: ['-'],
    once({ renderer }) {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl: gl.getParameter(gl.VERSION),
        glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        maxSamples: gl.getParameter(gl.MAX_SAMPLES),
        extensions: gl.getSupportedExtensions().join(' '),
        cores: navigator.hardwareConcurrency,
        dpr: devicePixelRatio,
        ua: navigator.userAgent,
      };
    },
  },
  {
    id: 'baseline',
    about: 'An empty frame, and the typical scene every add-on test starts from (6.4k triangles)',
    values: ['empty', 'typical'],
    setup(ctx, v) {
      if (v === 'typical') typical(ctx);
      else ctx.scene.background = new THREE.Color(0x8fbce6);
    },
  },

  // ---- Triangles ----
  {
    id: 'tris-onscreen',
    about: 'Triangles inside the view: 300 instanced spheres, all on screen (one draw call)',
    values: [2500, 5000, 7500, 10000, 12500, 15000, 20000, 25000, 35000, 50000],
    label: K,
    setup(ctx, total) {
      stage(ctx);
      sphereField(ctx, total);
    },
  },
  {
    id: 'tris-large',
    about: 'Triangles inside the view, as one large terrain that fills the screen (non-indexed)',
    values: [2500, 5000, 7500, 10000, 15000, 20000, 30000, 50000],
    label: K,
    setup(ctx, total) {
      stage(ctx);
      const seg = Math.round(Math.sqrt(total / 2));
      const geometry = new THREE.PlaneGeometry(90, 90, seg, seg).rotateX(-Math.PI / 2);
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, Math.sin(pos.getX(i) * 0.3) * Math.cos(pos.getZ(i) * 0.25) * 1.5);
      const flat = geometry.toNonIndexed();
      flat.computeVertexNormals();
      ctx.scene.add(new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ color: 0x6aa84f })));
    },
  },
  {
    id: 'tris-size',
    about: 'The same 24k on-screen triangles, on smaller or larger spheres (radius)',
    values: [0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.4],
    setup(ctx, radius) {
      stage(ctx);
      sphereField(ctx, 25000, { radius });
    },
  },
  {
    id: 'tris-offscreen',
    about: 'Triangles outside the view (past the far plane) added to the typical scene',
    values: [0, 50e3, 100e3, 200e3, 400e3, 800e3],
    label: K,
    setup(ctx, total) {
      typical(ctx);
      if (total) sphereField(ctx, total, { away: true });
    },
  },
  {
    id: 'index-cpu',
    about: 'CPU cost of drawing one big mesh, indexed or not (mesh hidden past the far plane)',
    values: ['0', '5k-indexed', '5k-flat', '20k-indexed', '20k-flat', '50k-indexed', '50k-flat', '100k-indexed', '100k-flat'],
    setup(ctx, v) {
      typical(ctx);
      if (v === '0') return;
      const [n, kind] = v.split('-');
      hiddenTerrain(ctx, parseFloat(n) * 1000, kind === 'indexed');
    },
  },

  // ---- Draw calls ----
  {
    id: 'calls-shared',
    about: 'Separate meshes (one draw call each) sharing one geometry and one material',
    values: [50, 100, 200, 300, 400, 500, 750, 1000, 1500],
    setup(ctx, n) {
      stage(ctx);
      ground(ctx);
      pieces(ctx, n);
    },
  },
  {
    id: 'calls-moving',
    about: 'Separate meshes sharing geometry and material, every one moved each frame',
    values: [50, 100, 200, 300, 400, 500, 750, 1000],
    setup(ctx, n) {
      stage(ctx);
      ground(ctx);
      const list = pieces(ctx, n);
      return {
        update(t) {
          for (let i = 0; i < list.length; i++) {
            list[i].position.y = 0.5 + Math.sin(t * 3 + i) * 0.3;
            list[i].rotation.y = t + i;
          }
        },
      };
    },
  },
  {
    id: 'calls-unique',
    about: 'Separate meshes, each with its own geometry and material (how AI tools write it)',
    values: [25, 50, 100, 200, 300, 400, 500, 750],
    setup(ctx, n) {
      stage(ctx);
      ground(ctx);
      pieces(ctx, n, { unique: true });
    },
  },
  {
    id: 'instances-moving',
    about: 'CPU cost of rewriting InstancedMesh matrices every frame (instances hidden past the far plane)',
    values: [500, 1e3, 2e3, 5e3, 10e3, 20e3, 40e3],
    label: K,
    setup(ctx, n) {
      typical(ctx);
      const mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.5), new THREE.MeshLambertMaterial(), n);
      mesh.frustumCulled = false;
      ctx.scene.add(mesh);
      const places = spread(n);
      return {
        update(t) {
          for (let i = 0; i < n; i++) {
            dummy.position.set(places[i][0], 0.5 + Math.sin(t * 3 + i) * 0.3, places[i][1] - 400);
            dummy.rotation.y = t + i;
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        },
      };
    },
  },

  // ---- Shading ----
  {
    id: 'materials',
    about: 'The typical scene with every surface in one material type',
    values: ['basic', 'lambert', 'toon', 'phong', 'standard', 'physical'],
    setup(ctx, type) {
      typical(ctx, { type });
    },
  },
  {
    id: 'resolution',
    about: 'Drawing at a lower resolution and stretching it, and antialias. heavy: 20k on-screen triangles',
    values: ['typical@1', 'typical@0.75', 'typical@0.5', 'heavy@1', 'heavy@0.75', 'heavy@0.5', 'standard@1', 'standard@0.5', 'typical-aa@1'],
    renderer: (v) => ({ antialias: v.includes('-aa'), scale: Number(v.split('@')[1]) }),
    setup(ctx, v) {
      const name = v.split(/[-@]/)[0];
      if (name === 'heavy') {
        stage(ctx);
        ground(ctx);
        sphereField(ctx, 20000);
      } else typical(ctx, { type: name === 'standard' ? 'standard' : 'lambert' });
    },
  },
  {
    id: 'lights-point',
    about: 'Point lights added to the typical scene (Lambert)',
    values: [0, 1, 2, 3, 4, 6, 8],
    setup(ctx, n) {
      typical(ctx);
      const lights = [];
      for (let i = 0; i < n; i++) {
        const light = new THREE.PointLight(new THREE.Color().setHSL(i / Math.max(n, 1), 0.8, 0.6), 60, 25);
        ctx.scene.add(light);
        lights.push(light);
      }
      return {
        update(t) {
          lights.forEach((l, i) => l.position.set(Math.sin(t + i * 2) * 12, 3, -10 + Math.cos(t * 0.7 + i) * 12));
        },
      };
    },
  },
  {
    id: 'shadows',
    about: 'Real-time shadows from the sun on the typical scene (all spheres cast)',
    values: ['off', 'basic-512', 'pcf-512', 'pcf-1024', 'vsm-1024', 'pcf-2048'],
    setup(ctx, v) {
      const { floor, mesh } = typical(ctx);
      if (v === 'off') return;
      const [type, size] = v.split('-');
      ctx.renderer.shadowMap.enabled = true;
      ctx.renderer.shadowMap.type = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap }[type];
      ctx.sun.castShadow = true;
      ctx.sun.shadow.mapSize.set(Number(size), Number(size));
      Object.assign(ctx.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
      ctx.sun.target.position.set(0, 0, -15);
      ctx.sun.position.set(20, 40, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      floor.receiveShadow = true;
    },
  },
  {
    id: 'textures',
    about: 'One texture on every surface of the typical scene, by size',
    values: ['none', '128', '256', '512', '1024', '2048', '2048-nomip'],
    setup(ctx, v) {
      if (v === 'none') {
        typical(ctx);
        return;
      }
      const texture = new THREE.CanvasTexture(patternCanvas(Number(v.split('-')[0])));
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      if (v.endsWith('nomip')) {
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
      }
      const { floor } = typical(ctx, { params: { map: texture } });
      floor.geometry.attributes.uv.array.forEach((_, i, a) => (a[i] *= 12));
    },
  },

  // ---- Fill rate ----
  {
    id: 'overdraw-alpha',
    about: 'Full-screen transparent layers over the typical scene (smoke, fades, glass)',
    values: [0, 1, 2, 4, 6, 8, 12, 16],
    setup(ctx, n) {
      typical(ctx);
      screenPlanes(ctx, n, (i) => new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0x000000, transparent: true, opacity: 0.06, depthTest: false, depthWrite: false }));
    },
  },
  {
    id: 'shader-alu',
    about: 'A full-screen custom shader with a loop of math (each step: 3 sin, 3 cos, a few mads)',
    values: [0, 4, 8, 16, 32, 64, 128],
    setup(ctx, n) {
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const mat = new THREE.ShaderMaterial({
        defines: { STEPS: n },
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform float uTime; varying vec2 vUv;
          void main() {
            vec3 c = vec3(vUv, fract(uTime));
            for (int i = 0; i < STEPS; i++) c = sin(c * 1.7 + uTime) * 0.5 + 0.5 + cos(c.yzx * 2.3) * 0.25;
            gl_FragColor = vec4(fract(c), 1.0);
          }`,
      });
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      return {
        fixed: true,
        update(t) {
          mat.uniforms.uTime.value = t;
        },
        render() {
          ctx.renderer.render(scene, camera);
        },
      };
    },
  },

  // ---- Effects ----
  {
    id: 'particles-small',
    about: 'Tiny particles (3 px, additive) moved on the CPU, over the typical scene',
    values: [500, 1e3, 2e3, 5e3, 10e3, 20e3, 50e3],
    label: K,
    setup(ctx, n) {
      typical(ctx);
      const r = rng(5);
      const base = new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? r() * 8 : (r() - 0.5) * 40 - (i % 3 === 2 ? 15 : 0)));
      const geometry = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(base.slice(), 3);
      geometry.setAttribute('position', pos);
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, color: 0xffcc66, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      points.frustumCulled = false;
      ctx.scene.add(points);
      return {
        update(t) {
          const a = pos.array;
          for (let i = 1; i < a.length; i += 3) a[i] = base[i] + Math.sin(t * 2 + i) * 0.5;
          pos.needsUpdate = true;
        },
      };
    },
  },
  {
    id: 'particles-big',
    about: 'Large soft particles (32 px sprites, additive), over the typical scene',
    values: [100, 250, 500, 1e3, 2e3, 4e3],
    label: K,
    setup(ctx, n) {
      typical(ctx);
      const r = rng(6);
      const a = new Float32Array(n * 3).map((_, i) => (i % 3 === 1 ? 1 + r() * 6 : (r() - 0.5) * 30 - (i % 3 === 2 ? 10 : 0)));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(a, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 32, sizeAttenuation: false, map: dotTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      points.frustumCulled = false;
      ctx.scene.add(points);
      return {
        update(t) {
          points.rotation.y = Math.sin(t * 0.5) * 0.2;
        },
      };
    },
  },
  {
    id: 'sprites',
    about: 'THREE.Sprite objects (each one its own draw call), over the typical scene',
    values: [25, 50, 100, 200, 400, 800],
    setup(ctx, n) {
      typical(ctx);
      const mat = new THREE.SpriteMaterial({ map: dotTexture(), transparent: true, depthWrite: false });
      const r = rng(7);
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(mat);
        s.position.set((r() - 0.5) * 30, 1 + r() * 6, -r() * 35 + 5);
        ctx.scene.add(s);
      }
    },
  },
  {
    id: 'post',
    about: 'Post-processing on the typical scene through EffectComposer',
    values: ['none', 'copy', 'fxaa', 'bloom-half', 'bloom'],
    setup(ctx, v) {
      typical(ctx);
      if (v === 'none') return;
      const composer = new EffectComposer(ctx.renderer);
      composer.setPixelRatio(1);
      composer.setSize(W, H);
      composer.addPass(new RenderPass(ctx.scene, ctx.camera));
      if (v === 'fxaa') {
        const fxaa = new ShaderPass(FXAAShader);
        fxaa.uniforms.resolution.value.set(1 / W, 1 / H);
        composer.addPass(fxaa);
      }
      if (v.startsWith('bloom')) {
        const half = v === 'bloom-half';
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(half ? W / 2 : W, half ? H / 2 : H), 0.6, 0.4, 0.8));
      }
      composer.addPass(new OutputPass());
      return { render: () => composer.render() };
    },
  },
  {
    id: 'canvas-texture',
    about: 'A 2D canvas redrawn and uploaded as a texture every frame (a canvas HUD)',
    values: ['none', '256', '512', '1024'],
    setup(ctx, v) {
      typical(ctx);
      if (v === 'none') return;
      const size = Number(v);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const g = canvas.getContext('2d');
      const texture = new THREE.CanvasTexture(canvas);
      ctx.scene.add(ctx.camera);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false }));
      plane.position.set(-0.9, 0.35, -1);
      ctx.camera.add(plane);
      let frame = 0;
      return {
        update() {
          frame++;
          g.clearRect(0, 0, size, size);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(0, 0, size, size);
          g.fillStyle = '#fff';
          g.font = `bold ${size / 10}px sans-serif`;
          for (let i = 0; i < 6; i++) g.fillText(`Score ${frame * 7 + i}`, size / 20, (size / 7) * (i + 1));
          texture.needsUpdate = true;
        },
      };
    },
  },

  // ---- JavaScript ----
  {
    id: 'js-busy',
    about: 'Milliseconds of game code (physics, AI) per frame, on top of the typical scene',
    values: [0, 2, 4, 6, 8, 10, 12, 14],
    setup(ctx, ms) {
      typical(ctx);
      let sink = 0;
      return {
        update() {
          const end = performance.now() + ms;
          while (performance.now() < end) for (let i = 0; i < 200; i++) sink += Math.sqrt(i + sink) % 7;
          if (sink === -1) console.log(sink);
        },
      };
    },
  },
  {
    id: 'alloc',
    about: 'Garbage per frame: new THREE.Vector3 objects created in the loop',
    values: [0, 1e3, 1e4, 5e4, 1e5, 2e5],
    label: K,
    setup(ctx, n) {
      typical(ctx);
      const keep = [];
      return {
        update() {
          keep.length = 0;
          for (let i = 0; i < n; i++) {
            const v = new THREE.Vector3(i, i, i);
            if ((i & 1023) === 0) keep.push(v);
          }
        },
      };
    },
  },

  // ---- HTML on top of the game ----
  {
    id: 'dom-text',
    about: 'HUD text elements whose text changes every frame (score, timer)',
    values: [0, 5, 10, 20, 50, 100],
    setup(ctx, n) {
      typical(ctx);
      const els = [];
      for (let i = 0; i < n; i++) {
        els.push(hudStyle(ctx.hud.appendChild(document.createElement('div')), { left: `${10 + (i % 6) * 118}px`, top: `${10 + Math.floor(i / 6) * 26}px` }));
      }
      let frame = 0;
      return {
        update() {
          frame++;
          for (let i = 0; i < n; i++) els[i].textContent = `${(frame * 13 + i) % 100000}`;
        },
      };
    },
  },
  {
    id: 'dom-overlay',
    about: 'Static HTML over the game: a bar, a menu panel, a full-screen dim, blur, CSS animation',
    values: ['none', 'bar', 'panel', 'fullscreen', 'blur', 'css-anim', 'many-static'],
    setup(ctx, v) {
      typical(ctx);
      const add = (css, text = '') => {
        const el = hudStyle(ctx.hud.appendChild(document.createElement('div')), css);
        el.textContent = text;
        return el;
      };
      if (v === 'bar') add({ left: 0, top: 0, width: '720px', height: '40px', background: 'rgba(0,0,0,0.5)', lineHeight: '40px', paddingLeft: '12px' }, 'Score 1200   Lives 3');
      if (v === 'panel') add({ left: '160px', top: '90px', width: '400px', height: '300px', background: 'rgba(10,10,30,0.8)', borderRadius: '12px', padding: '20px', boxSizing: 'border-box' }, 'Paused  Resume  Restart  Quit');
      if (v === 'fullscreen') add({ left: 0, top: 0, width: '720px', height: '480px', background: 'rgba(0,0,0,0.4)' });
      if (v === 'blur') add({ left: '160px', top: '90px', width: '400px', height: '300px', background: 'rgba(10,10,30,0.4)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }, 'Paused');
      if (v === 'css-anim') {
        const style = document.head.appendChild(document.createElement('style'));
        style.textContent = '@keyframes pv-bob { from { transform: translateY(0) scale(1) } to { transform: translateY(20px) scale(1.2) } }';
        for (let i = 0; i < 10; i++) add({ left: `${20 + i * 68}px`, top: '420px', animation: `pv-bob 0.6s ${i * 0.06}s ease-in-out infinite alternate` }, '★');
      }
      if (v === 'many-static') for (let i = 0; i < 50; i++) add({ left: `${10 + (i % 6) * 118}px`, top: `${10 + Math.floor(i / 6) * 26}px` }, `Label ${i}`);
    },
  },

  // ---- 2D canvas games (no WebGL) ----
  {
    id: 'canvas2d-sprites',
    about: 'A 2D canvas game: clear the screen and draw N 32x32 sprites with drawImage',
    kind: '2d',
    values: [100, 250, 500, 1000, 2000, 4000],
    setup(ctx, n) {
      const g = ctx.g;
      const sheet = document.createElement('canvas');
      sheet.width = 128;
      sheet.height = 32;
      const s = sheet.getContext('2d');
      ['#e74c3c', '#f1c40f', '#3498db', '#9b59b6'].forEach((c, i) => {
        s.fillStyle = c;
        s.beginPath();
        s.arc(i * 32 + 16, 16, 14, 0, Math.PI * 2);
        s.fill();
        s.fillStyle = '#fff';
        s.fillRect(i * 32 + 10, 9, 5, 5);
      });
      const r = rng(8);
      const items = Array.from({ length: n }, () => [r() * W, r() * H, (r() - 0.5) * 120, (r() - 0.5) * 120, Math.floor(r() * 4)]);
      return {
        update(t, dt) {
          g.fillStyle = '#203040';
          g.fillRect(0, 0, W, H);
          for (const it of items) {
            it[0] = (it[0] + it[2] * dt + W) % W;
            it[1] = (it[1] + it[3] * dt + H) % H;
            g.drawImage(sheet, it[4] * 32, 0, 32, 32, it[0] - 16, it[1] - 16, 32, 32);
          }
        },
      };
    },
  },
  {
    id: 'canvas2d-shapes',
    about: 'A 2D canvas game drawn with paths: N filled circles plus 20 lines of text',
    kind: '2d',
    values: [100, 250, 500, 1000, 2000],
    setup(ctx, n) {
      const g = ctx.g;
      const r = rng(9);
      const items = Array.from({ length: n }, (_, i) => [r() * W, r() * H, `hsl(${(i * 37) % 360},70%,55%)`]);
      return {
        update(t) {
          g.fillStyle = '#203040';
          g.fillRect(0, 0, W, H);
          for (const [x, y, c] of items) {
            g.fillStyle = c;
            g.beginPath();
            g.arc(x + Math.sin(t + x) * 10, y, 10, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#fff';
          g.font = 'bold 18px sans-serif';
          for (let i = 0; i < 20; i++) g.fillText(`Line ${i}: ${Math.floor(t * 100)}`, 10, 22 + i * 22);
        },
      };
    },
  },

  // ---- Sound ----
  {
    id: 'audio',
    about: 'Web Audio oscillators playing at once (very quietly), over the typical scene',
    values: [0, 2, 4, 8, 16, 32],
    setup(ctx, n) {
      typical(ctx);
      if (!n) return;
      const ac = new AudioContext();
      const gain = ac.createGain();
      gain.gain.value = 0.002;
      gain.connect(ac.destination);
      for (let i = 0; i < n; i++) {
        const osc = ac.createOscillator();
        osc.type = ['sine', 'square', 'sawtooth', 'triangle'][i % 4];
        osc.frequency.value = 110 + i * 27;
        osc.connect(gain);
        osc.start();
      }
      ac.resume();
      ctx.extra = () => ({ audioState: ac.state });
    },
  },

  // ---- Hitches (one-off costs) ----
  {
    id: 'compile',
    about: 'First frame with a never-seen material: shader compile time in ms',
    kind: 'once',
    values: ['basic', 'lambert', 'phong', 'standard', 'physical', 'lambert+shadow', 'standard+shadow', 'lambert+4point', 'standard-cached', 'lambert-cached'],
    once(ctx, v) {
      const [name, extra] = v.split('+');
      const type = name.replace('-cached', '');
      const { floor, mesh } = typical(ctx, { type: 'basic' });
      ctx.renderer.render(ctx.scene, ctx.camera);
      finish(ctx.renderer);
      const mat = material(type, { color: 0xffffff });
      if (!name.endsWith('-cached')) uncached(mat);
      if (extra === 'shadow') {
        stage(ctx);
        ctx.renderer.shadowMap.enabled = true;
        ctx.sun.castShadow = true;
        mesh.castShadow = true;
        floor.receiveShadow = true;
      }
      if (extra === '4point') {
        stage(ctx);
        for (let i = 0; i < 4; i++) ctx.scene.add(new THREE.PointLight(0xffffff, 20, 20));
      }
      if (type !== 'basic' && !extra) stage(ctx);
      mesh.material = mat;
      const t0 = performance.now();
      ctx.renderer.render(ctx.scene, ctx.camera);
      finish(ctx.renderer);
      const firstMs = performance.now() - t0;
      const t1 = performance.now();
      for (let i = 0; i < 5; i++) ctx.renderer.render(ctx.scene, ctx.camera);
      finish(ctx.renderer);
      return { firstMs: +firstMs.toFixed(1), nextMs: +((performance.now() - t1) / 5).toFixed(1) };
    },
  },
  {
    id: 'upload',
    about: 'First use of a new texture or geometry mid-game: the frame it costs, in ms',
    kind: 'once',
    values: ['tex-256', 'tex-512', 'tex-1024', 'tex-2048', 'img-256', 'img-512', 'img-1024', 'geo-50k', 'geo-200k'],
    async once(ctx, v) {
      typical(ctx);
      const [what, size] = v.split('-');
      const placeholder = new THREE.CanvasTexture(patternCanvas(16));
      const mat = new THREE.MeshBasicMaterial({ map: placeholder });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), mat);
      quad.position.set(0, 3, 5);
      ctx.scene.add(quad);
      let source;
      if (what === 'tex') source = patternCanvas(Number(size));
      else if (what === 'img') {
        // A PNG, decoded before the timing, as TextureLoader gives it.
        source = new Image();
        source.src = patternCanvas(Number(size)).toDataURL('image/png');
        await source.decode();
      } else {
        const seg = Math.round(Math.sqrt(parseFloat(size) * 1000 / 2));
        source = new THREE.PlaneGeometry(4, 4, seg, seg);
      }
      for (let i = 0; i < 3; i++) ctx.renderer.render(ctx.scene, ctx.camera);
      finish(ctx.renderer);
      const t0 = performance.now();
      ctx.renderer.render(ctx.scene, ctx.camera);
      finish(ctx.renderer);
      const before = performance.now() - t0;
      if (what === 'tex') mat.map = new THREE.CanvasTexture(source);
      else if (what === 'img') {
        mat.map = new THREE.Texture(source);
        mat.map.needsUpdate = true;
      } else quad.geometry = source;
      const t1 = performance.now();
      ctx.renderer.render(ctx.scene, ctx.camera);
      finish(ctx.renderer);
      const ms = performance.now() - t1;
      return { frameMs: +before.toFixed(1), withUploadMs: +ms.toFixed(1), uploadMs: +(ms - before).toFixed(1) };
    },
  },

  // ---- Memory (needs the collector for free memory) ----
  {
    id: 'memory',
    about: 'How much a game can allocate before free memory gets low (stops at 120 MB free)',
    kind: 'once',
    values: ['js', 'textures'],
    async once(ctx, v) {
      if (!ctx.collect) return { skipped: 'no collector' };
      const mem = () => fetch(`${ctx.collect}/mem`, { cache: 'no-store' }).then((r) => r.json());
      const start = await mem();
      const FLOOR = 120;
      const keep = [];
      let mb = 0;
      let now = start;
      try {
        while (mb < 1500) {
          if (v === 'js') {
            const chunk = new Uint8Array(16 << 20);
            for (let i = 0; i < chunk.length; i += 4096) chunk[i] = 1;
            keep.push(chunk);
            mb += 16;
          } else {
            // 1024x1024 RGBA textures (4 MB each), sharing one source array,
            // so only GPU memory grows.
            keep.source ??= new Uint8Array(1024 * 1024 * 4).fill(128);
            for (let i = 0; i < 4; i++) {
              const tex = new THREE.DataTexture(keep.source, 1024, 1024);
              tex.needsUpdate = true;
              ctx.renderer.initTexture(tex);
              keep.push(tex);
              mb += 4;
            }
            finish(ctx.renderer);
          }
          now = await mem();
          if (now.avail < FLOOR) break;
        }
      } catch (e) {
        return { allocatedMB: mb, error: String(e), availStartMB: start.avail, availEndMB: now.avail, webStartMB: start.web, webEndMB: now.web };
      }
      const result = { allocatedMB: mb, availStartMB: start.avail, availEndMB: now.avail, webStartMB: start.web, webEndMB: now.web };
      keep.forEach((t) => t.dispose?.());
      keep.length = 0;
      return result;
    },
  },
];
