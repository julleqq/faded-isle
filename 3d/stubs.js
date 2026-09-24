// Simple stand-in figures, used only if models.js is not available.
// Same contract as models.js: makeViewmodel, makeBody, makeGuardian, makeSpirit.

import * as THREE from 'three';
import { inkMat, outlineMat, Builder, M, GEO } from './ink.js';
import { PILLARS, CREATURES } from '../content.js';

const OL = outlineMat();

export function makeViewmodel() {
  const g = new THREE.Group();
  g.userData.update = () => {};
  return g;
}

export function makeBody() {
  const b = new Builder().add(GEO.cone, M(0, .5, 0, 0, 0, 0, .3, 1, .3), '#b8743a').add(GEO.sphere, M(0, 1.1, 0, 0, 0, 0, .18), '#e6c9a8');
  const g = b.build(inkMat({ reveal: 'none' }), OL);
  return g;
}

export function makeGuardian(pillar) {
  const mat = inkMat({ reveal: 'uniform' });
  const c = PILLARS[pillar].color;
  const b = new Builder().add(GEO.sphere, M(0, .7, 0, 0, 0, 0, .45, .6, .45), c).add(GEO.sphere, M(0, 1.45, .1, 0, 0, 0, .28), c)
    .add(GEO.sphere, M(-.1, 1.5, .35, 0, 0, 0, .05), '#1d1b19', { outline: false }).add(GEO.sphere, M(.1, 1.5, .35, 0, 0, 0, .05), '#1d1b19', { outline: false });
  const g = b.build(mat, OL);
  let target = 0;
  g.userData.setColored = on => { target = on ? 1 : 0; };
  g.userData.update = t => { mat.userData.sat.value += (target - mat.userData.sat.value) * .05; g.children[0].position.y = Math.sin(t * 1.5) * .03; };
  return g;
}

export function makeSpirit(id) {
  const cr = CREATURES.find(c => c.id === id) || CREATURES[0];
  const mat = inkMat({ reveal: 'uniform' });
  const b = new Builder().add(GEO.ico1, M(0, .35, 0, 0, 0, 0, .3), cr.color)
    .add(GEO.sphere, M(-.09, .4, .26, 0, 0, 0, .04), '#1d1b19', { outline: false }).add(GEO.sphere, M(.09, .4, .26, 0, 0, 0, .04), '#1d1b19', { outline: false });
  const g = b.build(mat, OL);
  g.userData.update = (t, calm = 1) => { mat.userData.sat.value = calm; g.children.forEach(ch => { ch.position.y = Math.sin(t * 2) * .05; }); };
  return g;
}
