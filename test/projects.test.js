const test = require('node:test');
const assert = require('node:assert/strict');
const { createProjects } = require('../src/main/projects');

test('new projects follow autoShow', () => {
  const p = createProjects();
  assert.equal(p.seen('app'), true);
  assert.equal(p.seen('app'), false);
  assert.equal(p.isShown('app'), true);
  p.setAutoShow(false);
  p.seen('other');
  assert.equal(p.isShown('other'), false);
  assert.equal(p.isShown('app'), true); // existing choices are kept
  assert.equal(p.isShown('never-seen'), false);
});

test('mute and unmute', () => {
  const p = createProjects();
  p.seen('app');
  p.setMuted('app', true);
  assert.equal(p.isShown('app'), false);
  p.setMuted('app', false);
  assert.equal(p.isShown('app'), true);
});

test('menuList lists only projects with open sessions', () => {
  const p = createProjects({ projects: { closed: { muted: true } } });
  p.seen('zeta');
  p.seen('alpha');
  p.setMuted('zeta', true);
  assert.deepEqual(p.menuList(new Map([['zeta', 2], ['alpha', 1]])), [
    { name: 'alpha', count: 1, shown: true },
    { name: 'zeta', count: 2, shown: false },
  ]);
  assert.deepEqual(p.menuList(new Map()), []);
});

test('toJSON round-trips', () => {
  const p = createProjects({ autoShow: false });
  p.seen('app');
  p.setMuted('app', false);
  const q = createProjects(p.toJSON());
  assert.equal(q.autoShow, false);
  assert.equal(q.isShown('app'), true);
  assert.deepEqual(q.toJSON(), { autoShow: false, projects: { app: { muted: false } } });
});
