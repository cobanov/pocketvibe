// Two ways to turn the same scene description into three.js objects.
//
// naive: how AI tools write three.js by default. One mesh, geometry and
//   MeshStandardMaterial per object, real-time shadows, point lights.
// lean: the handheld rules from template/AGENTS.md. One InstancedMesh per
//   kind of object, shared Lambert materials, no shadows.
//
// Both build from the same instance list, so only the rendering approach
// differs between the two measurements.

import * as THREE from 'three';

function apply(obj, inst) {
  obj.position.set(inst.x, inst.y, inst.z);
  obj.rotation.set(inst.rx ?? 0, inst.ry ?? 0, inst.rz ?? 0);
  obj.scale.set(inst.sx ?? 1, inst.sy ?? 1, inst.sz ?? 1);
}

export function buildNaive(def, instances, scene, renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
  scene.add(sun, sun.target);

  const points = [0xff9955, 0x5599ff].map((color) => {
    const light = new THREE.PointLight(color, 300, 60);
    scene.add(light);
    return light;
  });

  const meshes = instances.map((inst) => {
    const kind = def.kinds[inst.kind];
    const mesh = new THREE.Mesh(
      kind.geometry(),
      new THREE.MeshStandardMaterial({ color: kind.color, roughness: 0.6, metalness: 0.2 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    apply(mesh, inst);
    scene.add(mesh);
    return mesh;
  });
  const dynamic = instances.flatMap((inst, i) => (inst.update ? [i] : []));

  return {
    sync(target) {
      for (const i of dynamic) apply(meshes[i], instances[i]);
      // Keep the shadow and the point lights around the action.
      sun.position.set(target.x + 30, target.y + 50, target.z + 20);
      sun.target.position.copy(target);
      points[0].position.set(target.x - 8, target.y + 6, target.z);
      points[1].position.set(target.x + 8, target.y + 6, target.z - 10);
    },
  };
}

export function buildLean(def, instances, scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  const byKind = new Map();
  for (const inst of instances) {
    if (!byKind.has(inst.kind)) byKind.set(inst.kind, []);
    byKind.get(inst.kind).push(inst);
  }

  const dummy = new THREE.Object3D();
  const groups = [];
  for (const [name, list] of byKind) {
    const kind = def.kinds[name];
    const mesh = new THREE.InstancedMesh(
      kind.geometry(),
      new THREE.MeshLambertMaterial({ color: kind.color }),
      list.length,
    );
    list.forEach((inst, i) => {
      apply(dummy, inst);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    // Instances are spread over the whole level, so culling the batch as a
    // whole never helps; it would only go wrong when instances move.
    mesh.frustumCulled = false;
    scene.add(mesh);
    groups.push({ mesh, list, dynamic: list.flatMap((inst, i) => (inst.update ? [i] : [])) });
  }

  return {
    sync() {
      for (const { mesh, list, dynamic } of groups) {
        if (dynamic.length === 0) continue;
        for (const i of dynamic) {
          apply(dummy, list[i]);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
