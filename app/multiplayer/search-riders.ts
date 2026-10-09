import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { projectMapPoint, sampleSearchTour, type MapCamera, type TourFrame } from './search-map-tour';

/** A small, original mounted knight, with a cloak, saddle, boots and reins. */
function createKnight(color: number) {
  const knight = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0xd9bf85, metalness: .72, roughness: .4 });
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide });
  const leather = new THREE.MeshStandardMaterial({ color: 0x322217, roughness: .9 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    if (scale) part.scale.set(...scale);
    knight.add(part);
    return part;
  };
  mesh(new THREE.BoxGeometry(1.1, .2, 1.35), cloth, [0, .2, -.15]);
  mesh(new THREE.BoxGeometry(.7, .22, .9), leather, [0, .4, -.15]);
  const torso = mesh(new THREE.CylinderGeometry(.32, .4, .9, 8), armor, [0, 1, -.1]);
  torso.rotation.x = .18;
  mesh(new THREE.SphereGeometry(.29, 10, 8), armor, [0, 1.69, .01], [1, 1.12, 1]);
  mesh(new THREE.BoxGeometry(.4, .065, .06), leather, [0, 1.73, .29]);
  mesh(new THREE.ConeGeometry(.16, .55, 6), cloth, [0, 2.08, -.1]).rotation.x = -.5;
  const cape = mesh(new THREE.PlaneGeometry(.85, 1.4, 3, 4), cloth, [0, .98, -.65]);
  cape.rotation.x = -.55;
  for (const side of [-1, 1]) {
    const leg = mesh(new THREE.CapsuleGeometry(.15, .67, 2, 6), leather, [side * .56, .02, -.06]);
    leg.rotation.z = side * .18;
    mesh(new THREE.BoxGeometry(.23, .22, .45), leather, [side * .59, -.48, .08]);
    const arm = mesh(new THREE.CapsuleGeometry(.12, .58, 2, 6), armor, [side * .39, 1.06, .38]);
    arm.rotation.x = -.75;
    const rein = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(side * .4, .83, .65), new THREE.Vector3(side * .24, .45, 1.7),
    ]), new THREE.LineBasicMaterial({ color: 0x302115 }));
    knight.add(rein);
  }
  return { knight, cape };
}

function disposeScene(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
    }
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}

export type SearchRiderRig = {
  render: (frame: TourFrame, view: MapCamera, delta: number) => void;
  dispose: () => void;
};

/** The map director owns the clock; WebGL consumes exactly the same frame. */
export async function createSearchRiders(host: HTMLDivElement): Promise<SearchRiderRig | null> {
  if (!host.isConnected) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'search-scout-canvas';
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 5000);
  camera.position.set(0, 1000, 1000);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffe4ab, 0x493322, 2.5));
  const light = new THREE.DirectionalLight(0xffdfa1, 3);
  light.position.set(-100, 300, 200);
  scene.add(light);

  let gltf;
  try { gltf = await new GLTFLoader().loadAsync('/models/scout-horse.glb'); }
  catch { renderer.dispose(); return null; }
  if (!host.isConnected) { disposeScene(gltf.scene); renderer.dispose(); return null; }
  const gallop = gltf.animations.find(a => a.name === 'Gallop');
  if (!gallop) { disposeScene(gltf.scene); renderer.dispose(); return null; }

  const riders = Array.from({ length: 3 }, (_, i) => {
    const root = new THREE.Group();
    const horse = clone(gltf.scene);
    horse.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const copies = materials.map(m => {
          const copy = m.clone();
          if (copy instanceof THREE.MeshStandardMaterial) {
            copy.color.lerp(new THREE.Color(0xbca16b), .3);
            copy.roughness = .65;
            copy.metalness = .22;
          }
          return copy;
        });
        object.material = Array.isArray(object.material) ? copies : copies[0];
      }
    });
    root.add(horse);
    const { knight, cape } = createKnight([0x8b3428, 0x31505a, 0x6b582b][i]);
    horse.add(knight);
    const saddleBone = horse.getObjectByName('Torso2');
    const mixer = new THREE.AnimationMixer(horse);
    const action = mixer.clipAction(gallop).setDuration(.8).play();
    mixer.update(i * .17);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x2b1a0c, transparent: true, opacity: .28, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow, root);
    const dust = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(36), 3)), new THREE.PointsMaterial({ color: 0xffd279, size: 2, transparent: true, opacity: .48, depthWrite: false }));
    scene.add(dust);
    return { root, horse, knight, cape, saddleBone, mixer, action, shadow, dust };
  });
  host.appendChild(renderer.domElement);
  host.dataset.riders = 'ready';
  let width = 0, height = 0, disposed = false;
  const bonePosition = new THREE.Vector3();
  const render = (frame: TourFrame, view: MapCamera, delta: number) => {
    if (disposed) return;
    if (width !== view.width || height !== view.height) {
      width = view.width; height = view.height;
      camera.left = -width / 2; camera.right = width / 2;
      camera.top = height / 2; camera.bottom = -height / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    const world = (point: readonly [number, number]) => {
      const [x, y] = projectMapPoint(point, view);
      return new THREE.Vector3(x - width / 2, 0, (y - height / 2) * Math.SQRT2);
    };
    const history = Array.from({ length: 12 }, (_, j) => sampleSearchTour(Math.max(0, frame.elapsed - j * .024)));
    riders.forEach(({ root, horse, knight, cape, saddleBone, mixer, action, shadow, dust }, i) => {
      const scout = frame.scouts[i];
      root.position.copy(world(scout.point));
      const angle = Math.atan2(Math.sin(scout.heading - root.rotation.y), Math.cos(scout.heading - root.rotation.y));
      root.rotation.y = delta ? THREE.MathUtils.damp(root.rotation.y, root.rotation.y + angle, 14, delta) : scout.heading;
      const scale = view.scale * 6;
      root.scale.setScalar(scale);
      shadow.scale.set(1.4 * scale, 2.9 * scale, 1);
      action.setEffectiveTimeScale(scout.galloping ? 1.3 : .85);
      mixer.update(delta);
      horse.updateMatrixWorld(true);
      if (saddleBone) {
        saddleBone.getWorldPosition(bonePosition);
        horse.worldToLocal(bonePosition);
        knight.position.copy(bonePosition);
        knight.position.y += .34;
      }
      knight.rotation.x = .08 + Math.sin(frame.elapsed * 9 + i) * .06;
      cape.rotation.x = -.55 + Math.sin(frame.elapsed * 12 + i) * .12;
      shadow.position.copy(root.position); shadow.position.y = .1;
      shadow.rotation.z = -root.rotation.y;
      const positions = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j < 12; j++) {
        const p = world(history[j].scouts[i].point);
        positions.setXYZ(j, p.x + Math.sin(j * 4 + frame.elapsed) * j * .2, .2, p.z + Math.cos(j * 5 + frame.elapsed) * j * .2);
      }
      positions.needsUpdate = true;
    });
    renderer.render(scene, camera);
  };
  return {
    render,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      riders.forEach(({ mixer, horse }) => { mixer.stopAllAction(); mixer.uncacheRoot(horse); });
      disposeScene(scene);
      disposeScene(gltf.scene);
      renderer.dispose();
      renderer.domElement.remove();
      delete host.dataset.riders;
    },
  };
}
