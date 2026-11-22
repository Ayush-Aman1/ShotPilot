import { describe, expect, it } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { Editor } from './Editor';
import { objectPoseAt } from './motion';
import { createScene, identityTransform } from './scene';
import { bakeSubjectShot, type SubjectShotOptions } from './subjectShot';
import { parseTake, serializeTake } from './take';

const options: SubjectShotOptions = { subjectId: 'subject', move: 'track', duration: 2, aimHeight: 1, orbitDegrees: 90, endDistance: 0.5 };
const meta = { id: 'shot', name: 'Track 1', sceneId: 'scene', sceneName: 'Test' };
function scene() {
  const doc = createScene();
  doc.objects.push({ id: 'subject', name: 'Actor', kind: 'actor', color: '#ff0000', asset: { source: 'bundled', id: 'man' },
    transform: identityTransform(), actor: { clip: 'walk', speed: 1, loop: false, waypoints: [[3, 0, 0], [3, 0, -3]] } });
  doc.camera.transform.position = [0, 2, 4];
  return doc;
}

describe('subject-following shots', () => {
  it.each([24, 25, 30] as const)('tracks a moving actor and aims and focuses on it at every frame at %i fps', (fps) => {
    const doc = scene(); doc.camera.lens.fps = fps;
    const take = bakeSubjectShot(doc, options, meta);
    expect(take.frameCount).toBe(2 * fps + 1);
    expect(take.duration).toBe(2);
    expect(take.frames[0].camera.p).toEqual(doc.camera.transform.position);
    for (const [i, frame] of take.frames.entries()) {
      const target = new Vector3(...objectPoseAt(doc.objects[0], i / fps).p).add(new Vector3(0, 1, 0));
      const position = new Vector3(...frame.camera.p);
      const expected = target.clone().sub(position).normalize();
      const actual = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...frame.camera.q));
      expect(actual.distanceTo(expected)).toBeLessThan(0.00004);
      expect(position.distanceTo(target)).toBeCloseTo(frame.camera.focus!, 4);
      expect(position.clone().sub(target).distanceTo(new Vector3(0, 1, 4))).toBeLessThan(0.00002);
      expect(frame.objects.subject.p).toEqual(objectPoseAt(doc.objects[0], i / fps).p.map((x) => Math.round(x * 1e5) / 1e5));
      expect(frame.camera.focal).toBe(doc.camera.lens.focalLength);
    }
    expect(parseTake(serializeTake(take)).frames).toEqual(take.frames);
  });

  it.each([-90, 90, 180])('orbits %i degrees around a moving subject with constant radius and aim', (orbitDegrees) => {
    const doc = scene();
    const take = bakeSubjectShot(doc, { ...options, move: 'orbit', orbitDegrees }, meta);
    for (const frame of take.frames) {
      const delta = new Vector3(...frame.camera.p).sub(new Vector3(...frame.objects.subject.p)).sub(new Vector3(0, 1, 0));
      expect(delta.length()).toBeCloseTo(Math.sqrt(17), 4);
      expect(delta.y).toBeCloseTo(1, 4);
      const view = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...frame.camera.q));
      expect(view.distanceTo(delta.normalize().negate())).toBeLessThan(0.00004);
    }
    const last = take.frames.at(-1)!;
    expect(last.camera.p[0] - last.objects.subject.p[0]).toBeCloseTo(4 * Math.sin(orbitDegrees * Math.PI / 180), 4);
    expect(last.camera.p[2] - last.objects.subject.p[2]).toBeCloseTo(4 * Math.cos(orbitDegrees * Math.PI / 180), 4);
  });

  it.each([0.5, 2])('pushes/pulls to a distance ratio of %f without changing focal length', (endDistance) => {
    const take = bakeSubjectShot(scene(), { ...options, move: 'push', endDistance }, meta);
    expect(take.frames.at(-1)!.camera.focus! / take.frames[0].camera.focus!).toBeCloseTo(endDistance, 4);
    expect(take.frames[24].camera.focus! / take.frames[0].camera.focus!).toBeCloseTo((1 + endDistance) / 2, 4);
  });

  it('supports a prop travelling vertically and never changes the scene or existing keys', () => {
    const doc = scene(); const subject = doc.objects[0];
    subject.kind = 'prop'; delete subject.actor;
    subject.motion = { waypoints: [[0, 3, 0]], speed: 1, loop: false };
    doc.camera.keyframes = [{ time: 0, position: [9, 2, 9], rotation: [0, 0, 0, 1], focalLength: 50 }];
    const before = structuredClone(doc);
    const take = bakeSubjectShot(doc, options, meta);
    expect(take.frames.at(-1)!.camera.p[1]).toBeCloseTo(4, 4);
    expect(doc).toEqual(before);
    // The generated result remains independent of later edits.
    subject.transform.position[0] = 99;
    expect(take.frames[0].objects.subject.p[0]).toBe(0);
  });

  it('keeps the take in sync when the requested duration falls between frames', () => {
    const take = bakeSubjectShot(scene(), { ...options, duration: 1.03 }, meta);
    expect(take.frameCount).toBe(26);
    expect(take.duration).toBe(25 / 24);
  });

  it('leaves editor undo history intact', () => {
    const editor = new Editor(scene());
    editor.update('subject', (o) => o.name = 'Moved actor');
    const before = structuredClone(editor.doc);
    bakeSubjectShot(editor.doc, options, meta);
    expect(editor.doc).toEqual(before);
    editor.undo(); expect(editor.doc.objects[0].name).toBe('Actor');
  });

  it.each([
    { duration: NaN }, { duration: 0 }, { duration: 31 }, { aimHeight: Infinity }, { aimHeight: -1 },
    { orbitDegrees: 181 }, { endDistance: 0.1 }, { subjectId: 'missing' },
  ])('rejects invalid input %j', (patch) => {
    expect(() => bakeSubjectShot(scene(), { ...options, ...patch }, meta)).toThrow();
  });

  it('rejects hidden subjects, lights and an unstable overhead opening position', () => {
    const doc = scene();
    doc.objects[0].hiddenInRenders = true;
    expect(() => bakeSubjectShot(doc, options, meta)).toThrow('visible');
    delete doc.objects[0].hiddenInRenders; doc.objects[0].kind = 'light';
    expect(() => bakeSubjectShot(doc, options, meta)).toThrow('visible');
    doc.objects[0].kind = 'actor'; doc.camera.transform.position = [0, 3, 0];
    expect(() => bakeSubjectShot(doc, options, meta)).toThrow('0.25 m');
  });
});
