// The shape every region shares. A region owns a scene root, its ground function, colliders,
// light and smoke spots, winnow marks, people and interactables, and its own light and weather.
import * as THREE from 'three';
import { Person } from '../game/npcs.js';

export function makeRegion(id, name, env) {
  const root = new THREE.Group();
  root.name = id;
  const region = {
    id, name, root, env,
    colliders: [],
    lanternSpots: [],
    smokeSpots: [],
    marks: {},
    interactables: [],
    people: [],
    named: {},
    updaters: [],
    ground: () => 0,
    water: null, // { y, bounds: [minX, maxX, minZ, maxZ] } where a boat can go
    spawn: { pos: new THREE.Vector3(), heading: 0 },
    // where the story places Feyre when a beat moves her here
    places: {},
    onEnter() {},
    update(dt, t) { for (const u of region.updaters) u(dt, t); },
  };
  root.userData.region = region;
  return region;
}

/** A person standing (or walking a route) in a region. */
export function person(region, look, x, z, heading = 0, extra = {}) {
  const p = new Person(region.root, look, new THREE.Vector3(x, region.ground(x, z) ?? 0, z), region);
  p.heading = heading;
  Object.assign(p, extra);
  region.people.push(p);
  return p;
}

/** Interactable within reach of a person or place. */
export function act(region, pos, label, on, opts = {}) {
  const it = {
    get pos() { return typeof pos === 'function' ? pos() : pos; }, // a person's position moves with them
    r: opts.r ?? 2.6, label: typeof label === 'function' ? label : () => label, on, enabled: opts.enabled, inBoat: opts.inBoat,
  };
  region.interactables.push(it);
  return it;
}

/** Wander a person between points, pausing at each. */
export function route(p, pts) {
  p.route = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  p.routeIdx = 0;
  return p;
}

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
