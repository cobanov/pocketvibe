// Static scenery (road, curbs, boards, stands, trees) is collected as one
// triangle soup per circuit and then cut into square cells, one mesh each.
// The camera then only draws the cells in view, and a whole circuit costs a
// handful of draw calls with one material. Every face is flat shaded.

import * as THREE from 'three';

const tint = new THREE.Color();
const v = new THREE.Vector3();

export function createSoup() {
  const pos = [];
  const col = [];

  return {
    // One triangle, counter-clockwise seen from its front.
    tri(ax, ay, az, bx, by, bz, cx, cy, cz, r, g, b) {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      col.push(r, g, b, r, g, b, r, g, b);
    },

    // A flat quad at height y; corners (x, z) in order, counter-clockwise
    // seen from above.
    quad(ax, az, bx, bz, cx, cz, dx, dz, y, hex) {
      tint.setHex(hex);
      this.tri(ax, y, az, bx, y, bz, cx, y, cz, tint.r, tint.g, tint.b);
      this.tri(ax, y, az, cx, y, cz, dx, y, dz, tint.r, tint.g, tint.b);
    },

    // A geometry with vertex colors (see paint), moved by matrix, its colors
    // multiplied by shade (a THREE.Color) when given.
    add(geometry, matrix = null, shade = null) {
      const p = geometry.attributes.position;
      const c = geometry.attributes.color;
      const index = geometry.index;
      const count = index ? index.count : p.count;
      for (let k = 0; k < count; k++) {
        const i = index ? index.getX(k) : k;
        v.fromBufferAttribute(p, i);
        if (matrix) v.applyMatrix4(matrix);
        pos.push(v.x, v.y, v.z);
        const r = c.getX(i);
        const g = c.getY(i);
        const b = c.getZ(i);
        if (shade) col.push(r * shade.r, g * shade.g, b * shade.b);
        else col.push(r, g, b);
      }
    },

    get triangles() {
      return pos.length / 9;
    },

    // Cuts the soup into cells of `size` world units by each triangle's
    // centre; returns one non-indexed geometry per cell that has any.
    bake(size) {
      const tris = pos.length / 9;
      const keys = new Int32Array(tris);
      const cells = new Map();
      for (let t = 0; t < tris; t++) {
        const o = t * 9;
        const cx = Math.floor((pos[o] + pos[o + 3] + pos[o + 6]) / 3 / size);
        const cz = Math.floor((pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3 / size);
        const key = (cx + 500) * 1000 + cz + 500;
        keys[t] = key;
        const cell = cells.get(key);
        if (cell) cell.count++;
        else cells.set(key, { count: 1, w: 0, p: null, n: null, c: null });
      }
      for (const cell of cells.values()) {
        cell.p = new Float32Array(cell.count * 9);
        cell.n = new Float32Array(cell.count * 9);
        cell.c = new Float32Array(cell.count * 9);
      }
      for (let t = 0; t < tris; t++) {
        const cell = cells.get(keys[t]);
        const { p, n, c } = cell;
        const w = cell.w;
        const o = t * 9;
        for (let k = 0; k < 9; k++) {
          p[w + k] = pos[o + k];
          c[w + k] = col[o + k];
        }
        // Face normal: (c - b) x (a - b), as three.js computes it.
        const ex = p[w + 6] - p[w + 3];
        const ey = p[w + 7] - p[w + 4];
        const ez = p[w + 8] - p[w + 5];
        const fx = p[w] - p[w + 3];
        const fy = p[w + 1] - p[w + 4];
        const fz = p[w + 2] - p[w + 5];
        let nx = ey * fz - ez * fy;
        let ny = ez * fx - ex * fz;
        let nz = ex * fy - ey * fx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        for (let k = 0; k < 3; k++) {
          n[w + k * 3] = nx;
          n[w + k * 3 + 1] = ny;
          n[w + k * 3 + 2] = nz;
        }
        cell.w += 9;
      }
      const out = [];
      for (const { p, n, c } of cells.values()) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        g.computeBoundingSphere();
        out.push(g);
      }
      return out;
    },
  };
}
