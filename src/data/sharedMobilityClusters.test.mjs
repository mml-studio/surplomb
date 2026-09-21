// The city-wide groups. Three properties, each of which fails as something
// that looks fine on screen: a count that is not the fleet, a filter that
// forgets the groups, and two bubbles printed on top of each other.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_MOBILITY_BUBBLE_MERGE_PX,
  foldSharedMobilityClusters,
  mergeSharedMobilityBubbles,
  sharedMobilityBubbleBar,
  sharedMobilityClusterCell,
} from './sharedMobilityClusters.js';
import { GBFS_CLUSTER_ABOVE, GBFS_CLUSTER_CELLS_DEG, clusterGbfsVehicles, gbfsBoxWantsClusters } from './gbfsFeeds.js';

const OPERATORS = {
  lime: { id: 'lime', color: '#b6f03c' },
  voi: { id: 'voi', color: '#ff4d4d' },
  yego: { id: 'yego', color: '#f2e94e' },
};
const operatorOf = (system) => OPERATORS[system] || { id: 'unknown', color: '#6b7a8a' };

test('the grid step follows the ground resolution, and only ever a shared step', () => {
  // ~5.6 m/px is 7 km over Paris on a desktop: 160 px is ~900 m, 0.008°.
  assert.equal(sharedMobilityClusterCell(5.6), 0.008);
  // Twice the altitude, twice the step.
  assert.equal(sharedMobilityClusterCell(11.2), 0.016);
  for (const mpp of [0.5, 2, 9, 40, 400]) {
    assert.ok(GBFS_CLUSTER_CELLS_DEG.includes(sharedMobilityClusterCell(mpp)), `${mpp} m/px`);
  }
  assert.equal(sharedMobilityClusterCell(0), null);
  assert.equal(sharedMobilityClusterCell(Number.NaN), null);
});

test('the proxy counts every vehicle, and sends the lonely ones whole', () => {
  // 40 Lime e-bikes in one cell, 1 Voi a few cells away, over a box that
  // holds both — and one vehicle far outside it, which must not be counted.
  const vehicles = [];
  for (let i = 0; i < 40; i++) {
    vehicles.push({ id: `lime:${i}`, system: 'lime', kind: 'ebike', lat: 48.8601 + i * 1e-5, lon: 2.3401 });
  }
  const lone = { id: 'voi:1', system: 'voi', kind: 'ebike', lat: 48.8702, lon: 2.3602 };
  const far = { id: 'voi:2', system: 'voi', kind: 'ebike', lat: 48.95, lon: 2.60 };
  const parts = [
    { id: 'lime', vehicles },
    { id: 'voi', vehicles: [lone, far] },
  ];
  const box = { south: 48.85, west: 2.33, north: 48.88, east: 2.37 };
  const { clusters, vehicles: singles, counted } = clusterGbfsVehicles(parts, box, 0.004);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].n, 40);
  assert.deepEqual(clusters[0].by, { 'lime|ebike': 40 });
  assert.deepEqual(singles.map((vehicle) => vehicle.id), ['voi:1']);
  assert.equal(counted, 41);
});

test('a filter re-counts the groups without asking again', () => {
  const clusters = [
    { id: 'a', lat: 48.86, lon: 2.34, n: 12, by: { 'lime|ebike': 7, 'yego|moped': 5 } },
    { id: 'b', lat: 48.87, lon: 2.35, n: 3, by: { 'yego|moped': 3 } },
  ];
  const all = foldSharedMobilityClusters(clusters, { keep: () => true, operatorOf });
  assert.deepEqual(all.map((bubble) => bubble.n), [12, 3]);
  assert.deepEqual(all[0].operators.map((operator) => [operator.id, operator.n]), [['lime', 7], ['yego', 5]]);
  // « Vélos »: the moped group is gone, the mixed one counts its bikes only.
  const bikes = foldSharedMobilityClusters(clusters, {
    keep: (system, kind) => kind === 'bike' || kind === 'ebike',
    operatorOf,
  });
  assert.deepEqual(bikes.map((bubble) => [bubble.id, bubble.n]), [['a', 7]]);
});

test('bubbles that would touch become one, and the count is still the sum', () => {
  const bubbles = [
    { id: 'big', x: 100, y: 100, lat: 48.86, lon: 2.34, n: 30, operators: [{ id: 'lime', color: '#b6f03c', n: 30 }] },
    { id: 'near', x: 130, y: 110, lat: 48.87, lon: 2.35, n: 10, operators: [{ id: 'voi', color: '#ff4d4d', n: 10 }] },
    { id: 'far', x: 400, y: 100, lat: 48.88, lon: 2.36, n: 5, operators: [{ id: 'voi', color: '#ff4d4d', n: 5 }] },
  ];
  const merged = mergeSharedMobilityBubbles(bubbles);
  assert.deepEqual(merged.map((bubble) => [bubble.id, bubble.n]), [['big', 40], ['far', 5]]);
  assert.ok(Math.abs(merged[0].lat - (48.86 * 30 + 48.87 * 10) / 40) < 1e-9, 'moved to the weighted centroid');
  assert.deepEqual(merged[0].operators.map((operator) => [operator.id, operator.n]), [['lime', 30], ['voi', 10]]);
  // Nothing within reach: untouched.
  assert.equal(mergeSharedMobilityBubbles(bubbles, 10).length, 3);
  assert.ok(SHARED_MOBILITY_BUBBLE_MERGE_PX > 46, 'wider than a bubble');
});

test('the operator bar spans the bubble, by share, and never hides a small operator', () => {
  const bar = sharedMobilityBubbleBar([
    { id: 'lime', color: '#b6f03c', n: 90 },
    { id: 'voi', color: '#ff4d4d', n: 9 },
    { id: 'yego', color: '#f2e94e', n: 1 },
  ], 30);
  assert.equal(bar.length, 3);
  assert.ok(Math.abs(bar.reduce((sum, segment) => sum + segment.w, 0) - 30) < 1e-9);
  assert.ok(bar[2].w >= 2, 'one YEGO in a hundred is still a visible segment');
  assert.ok(bar[0].w > bar[1].w && bar[1].w > bar[2].w);
  const many = sharedMobilityBubbleBar(['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, color: `#00000${i}`, n: 6 - i })), 30);
  assert.equal(many.length, 5, 'four operators and the tail');
  assert.deepEqual(sharedMobilityBubbleBar([], 30), []);
});

test('only a dense view is grouped: a sparse city keeps its dots', () => {
  const box = { south: 48.8, west: 2.2, north: 48.9, east: 2.5 };
  const make = (count) => [{
    id: 'lime',
    vehicles: Array.from({ length: count }, (_, i) => ({ lat: 48.85, lon: 2.3 + i * 1e-6 })),
  }];
  assert.equal(gbfsBoxWantsClusters(make(GBFS_CLUSTER_ABOVE - 1), box), false);
  assert.equal(gbfsBoxWantsClusters(make(GBFS_CLUSTER_ABOVE), box), true);
  // Counted inside the box only: the margin the proxy holds around it is not the view.
  const outside = [{ id: 'lime', vehicles: Array.from({ length: 5_000 }, () => ({ lat: 49.5, lon: 2.3 })) }];
  assert.equal(gbfsBoxWantsClusters(outside, box), false);
});
