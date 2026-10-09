import { KINGDOMS, MAP_HEIGHT, MAP_WIDTH, type MapPoint } from './search-map-data.ts';

export const SCOUT_DWELL_SECONDS = 4;
export const SCOUT_TRAVEL_SECONDS = 1.5;
export const SCOUT_LEG_SECONDS = SCOUT_DWELL_SECONDS + SCOUT_TRAVEL_SECONDS;
export const SCOUT_TOUR_SECONDS = SCOUT_LEG_SECONDS * KINGDOMS.length;

export type ScoutPosition = { point: MapPoint; heading: number; galloping: boolean };
export type TourFrame = {
  elapsed: number;
  kingdomIndex: number;
  destinationIndex: number;
  phase: 'scouting' | 'travelling';
  progress: number;
  focus: MapPoint;
  zoom: number;
  scouts: ScoutPosition[];
};
export type MapCamera = { width: number; height: number; scale: number; x: number; y: number };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function splinePoint(points: readonly MapPoint[], t: number, closed: boolean): MapPoint {
  const segments = points.length - (closed ? 0 : 1);
  const position = clamp(t, 0, 1) * segments;
  const index = Math.min(Math.floor(position), segments - 1);
  const u = position - index;
  const at = (i: number) => closed
    ? points[(i + points.length) % points.length]
    : points[clamp(i, 0, points.length - 1)];
  const p0 = at(index - 1), p1 = at(index), p2 = at(index + 1), p3 = at(index + 2);
  const axis = (a: number, b: number, c: number, d: number) =>
    .5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [axis(p0[0], p1[0], p2[0], p3[0]), axis(p0[1], p1[1], p2[1], p3[1])];
}

/** Sample arc length once, so a tight corner doesn't accelerate a horse. */
function makeRoute(points: readonly MapPoint[], closed: boolean) {
  const count = points.length * 32;
  const samples = Array.from({ length: count + 1 }, (_, i) => splinePoint(points, i / count, closed));
  const distances = [0];
  for (let i = 1; i < samples.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
  }
  const total = distances[distances.length - 1];
  return (progress: number): MapPoint => {
    const target = clamp(progress, 0, 1) * total;
    let lo = 0, hi = distances.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (distances[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const index = Math.max(1, lo);
    const t = (target - distances[index - 1]) / (distances[index] - distances[index - 1] || 1);
    return [mix(samples[index - 1][0], samples[index][0], t), mix(samples[index - 1][1], samples[index][1], t)];
  };
}

const patrols = KINGDOMS.map(k => makeRoute(k.patrol, true));
const patrolPoint = (kingdomIndex: number, scoutIndex: number, progress: number) =>
  patrols[kingdomIndex]((progress + scoutIndex * .21) % 1);
const journeys = KINGDOMS.map((kingdom, index) => Array.from({ length: 3 }, (_, scout) =>
  makeRoute([patrolPoint(index, scout, 0), ...kingdom.onward, patrolPoint((index + 1) % KINGDOMS.length, scout, 0)], false),
));

function scoutPoint(kingdomIndex: number, scoutIndex: number, phase: TourFrame['phase'], progress: number): MapPoint {
  if (phase === 'scouting') return patrolPoint(kingdomIndex, scoutIndex, progress);
  const point = journeys[kingdomIndex][scoutIndex](progress);
  const before = journeys[kingdomIndex][scoutIndex](Math.max(0, progress - .002));
  const after = journeys[kingdomIndex][scoutIndex](Math.min(1, progress + .002));
  const dx = after[0] - before[0], dy = after[1] - before[1];
  const length = Math.hypot(dx, dy) || 1;
  // Spread the three scouts into a travelling party; merge at each endpoint.
  const spread = (scoutIndex - 1) * 11 * Math.sin(Math.PI * progress);
  return [point[0] - dy / length * spread, point[1] + dx / length * spread];
}

/** One deterministic clock drives the camera, destination, and all horses. */
export function sampleSearchTour(seconds: number): TourFrame {
  const elapsed = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const time = elapsed % SCOUT_TOUR_SECONDS;
  const kingdomIndex = Math.floor(time / SCOUT_LEG_SECONDS);
  const nextIndex = (kingdomIndex + 1) % KINGDOMS.length;
  const local = time - kingdomIndex * SCOUT_LEG_SECONDS;
  const phase = local < SCOUT_DWELL_SECONDS ? 'scouting' : 'travelling';
  const progress = phase === 'scouting' ? local / SCOUT_DWELL_SECONDS : (local - SCOUT_DWELL_SECONDS) / SCOUT_TRAVEL_SECONDS;
  const scouts = Array.from({ length: 3 }, (_, i) => {
    const point = scoutPoint(kingdomIndex, i, phase, progress);
    const before = scoutPoint(kingdomIndex, i, phase, Math.max(0, progress - .002));
    const after = scoutPoint(kingdomIndex, i, phase, Math.min(1, progress + .002));
    return { point, heading: Math.atan2(after[0] - before[0], (after[1] - before[1]) * Math.SQRT2), galloping: phase === 'travelling' };
  });
  const center = KINGDOMS[kingdomIndex].focus;
  // The camera keeps drifting gently during a local patrol, then pulls back
  // slightly and follows the party along the actual road during each transfer.
  const orbit: MapPoint = [Math.sin(progress * Math.PI * 2) * 12, (1 - Math.cos(progress * Math.PI * 2)) * 8];
  let focus: MapPoint = [center[0] + orbit[0], center[1] + orbit[1]];
  let zoom = 2.55 + Math.sin(progress * Math.PI * 2) * .045;
  if (phase === 'travelling') {
    const target = KINGDOMS[nextIndex].focus;
    const t = ease(progress);
    const middle = [scouts.reduce((sum, s) => sum + s.point[0], 0) / 3, scouts.reduce((sum, s) => sum + s.point[1], 0) / 3];
    const follow = Math.sin(progress * Math.PI) ** 2 * .7;
    focus = [mix(mix(center[0], target[0], t), middle[0], follow), mix(mix(center[1], target[1], t), middle[1], follow)];
    zoom = 2.55 - .48 * Math.sin(progress * Math.PI) ** 2;
  }
  return { elapsed, kingdomIndex, destinationIndex: phase === 'travelling' ? nextIndex : kingdomIndex, phase, progress, focus, zoom, scouts };
}

/** Crop to a kingdom; never expose empty paper beyond the map's edges. */
export function getMapCamera(width: number, height: number, frame: Pick<TourFrame, 'focus' | 'zoom'>): MapCamera {
  const w = Math.max(1, width), h = Math.max(1, height);
  const scale = Math.max(w / MAP_WIDTH, h / MAP_HEIGHT) * frame.zoom;
  return {
    width: w, height: h, scale,
    x: clamp(w * .5 - frame.focus[0] * scale, w - MAP_WIDTH * scale, 0),
    y: clamp(h * .67 - frame.focus[1] * scale, h - MAP_HEIGHT * scale, 0),
  };
}

export function projectMapPoint(point: MapPoint, camera: MapCamera): MapPoint {
  return [point[0] * camera.scale + camera.x, point[1] * camera.scale + camera.y];
}
