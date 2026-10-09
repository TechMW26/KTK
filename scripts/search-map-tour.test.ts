import { strict as assert } from 'node:assert';
import { KINGDOMS, MAP_HEIGHT, MAP_WIDTH } from '../app/multiplayer/search-map-data.ts';
import { getMapCamera, projectMapPoint, sampleSearchTour, SCOUT_DWELL_SECONDS, SCOUT_LEG_SECONDS, SCOUT_TOUR_SECONDS, SCOUT_TRAVEL_SECONDS } from '../app/multiplayer/search-map-tour.ts';

let passed = 0;
function check(name: string, verify: () => void) {
  verify();
  passed++;
  console.log(`  ok - ${name}`);
}
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

check('all six fantasy kingdoms are visited within the existing 30-second search', () => {
  const visited = new Set<string>();
  for (let time = 0; time < 30; time += .1) {
    const frame = sampleSearchTour(time);
    if (frame.phase === 'scouting') visited.add(KINGDOMS[frame.kingdomIndex].id);
  }
  assert.equal(visited.size, 6);
  assert.ok(SCOUT_DWELL_SECONDS >= 3 && SCOUT_DWELL_SECONDS <= 5);
  assert.ok(SCOUT_TRAVEL_SECONDS <= 2);
});

check('scouts roam locally before travelling together to the next kingdom', () => {
  const first = sampleSearchTour(0);
  const local = sampleSearchTour(2);
  assert.equal(local.phase, 'scouting');
  assert.equal(local.kingdomIndex, 0);
  for (let i = 0; i < 3; i++) assert.ok(distance(first.scouts[i].point, local.scouts[i].point) > 40);
  const transfer = sampleSearchTour(SCOUT_DWELL_SECONDS + SCOUT_TRAVEL_SECONDS / 2);
  assert.equal(transfer.phase, 'travelling');
  assert.equal(transfer.destinationIndex, 1);
  assert.ok(transfer.scouts.every(s => s.galloping));
  assert.equal(sampleSearchTour(SCOUT_LEG_SECONDS).phase, 'scouting');
  assert.equal(sampleSearchTour(SCOUT_LEG_SECONDS).kingdomIndex, 1);
});

check('camera and horses never teleport at patrol, transfer, or loop boundaries', () => {
  for (let i = 0; i < KINGDOMS.length; i++) {
    for (const time of [i * SCOUT_LEG_SECONDS + SCOUT_DWELL_SECONDS, (i + 1) * SCOUT_LEG_SECONDS]) {
      const before = sampleSearchTour(time - .00001);
      const after = sampleSearchTour(time + .00001);
      assert.ok(distance(before.focus, after.focus) < .01, `camera jumped at ${time}s`);
      assert.ok(Math.abs(before.zoom - after.zoom) < .0001);
      for (let scout = 0; scout < 3; scout++) {
        assert.ok(distance(before.scouts[scout].point, after.scouts[scout].point) < .05, `scout ${scout} jumped at ${time}s`);
      }
    }
  }
});

check('map keeps moving within each visit and always remains zoomed in', () => {
  for (let i = 0; i < KINGDOMS.length; i++) {
    const start = sampleSearchTour(i * SCOUT_LEG_SECONDS);
    const later = sampleSearchTour(i * SCOUT_LEG_SECONDS + 1);
    assert.ok(distance(start.focus, later.focus) > 10);
  }
  for (let time = 0; time < SCOUT_TOUR_SECONDS; time += .05) assert.ok(sampleSearchTour(time).zoom >= 2);
});

check('every responsive camera crop covers the screen without exposing map edges', () => {
  for (const [width, height] of [[320, 568], [390, 844], [640, 900], [640, 360]]) {
    for (let time = 0; time < SCOUT_TOUR_SECONDS; time += .05) {
      const frame = sampleSearchTour(time);
      const view = getMapCamera(width, height, frame);
      assert.ok(view.x <= 0 && view.y <= 0);
      assert.ok(view.x + MAP_WIDTH * view.scale >= width - .001);
      assert.ok(view.y + MAP_HEIGHT * view.scale >= height - .001);
      assert.ok(width / view.scale < MAP_WIDTH * .51, 'too much map visible');
      assert.ok(height / view.scale < MAP_HEIGHT * .51, 'too much map visible');
      for (const scout of frame.scouts) {
        const projected = projectMapPoint(scout.point, view);
        assert.ok(projected.every(Number.isFinite));
        assert.ok(scout.point[0] >= 0 && scout.point[0] <= MAP_WIDTH);
        assert.ok(scout.point[1] >= 0 && scout.point[1] <= MAP_HEIGHT);
      }
    }
  }
});

check('all mounted scouts remain in view throughout the phone-sized itinerary', () => {
  for (const [width, height] of [[320, 568], [390, 844]]) {
    for (let time = 0; time < SCOUT_TOUR_SECONDS; time += .05) {
      const frame = sampleSearchTour(time);
      const view = getMapCamera(width, height, frame);
      for (const scout of frame.scouts) {
        const [x, y] = projectMapPoint(scout.point, view);
        assert.ok(x >= 20 && x <= width - 20, `camera lost a scout horizontally at ${time}s`);
        assert.ok(y >= height * .4 && y <= height - 60, `camera lost a scout vertically at ${time}s`);
      }
    }
  }
});

console.log(`${passed} search-map tour checks passed`);
