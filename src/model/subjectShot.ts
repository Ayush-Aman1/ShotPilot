import { multiplyQuat, quatFromYaw } from './math';
import { objectPoseAt } from './motion';
import type { SceneDoc, Vec3 } from './scene';
import { TakeRecorder, type Take, type TakeMeta } from './take';

export type SubjectMove = 'track' | 'orbit' | 'push';

export interface SubjectShotOptions {
  subjectId: string;
  move: SubjectMove;
  duration: number;
  /** World-space metres above the subject's origin. */
  aimHeight: number;
  /** Signed orbit angle, degrees. */
  orbitDegrees: number;
  /** Final distance / opening distance for a push (0.5 = half as far away). */
  endDistance: number;
}

/**
 * Bake a camera that follows the subject's deterministic waypoint motion at every output frame.
 * The current camera position establishes the opening offset. Orbit rotates that offset about Y;
 * push scales it. Aim and focus are computed from the subject at that exact scene time, so these
 * shots stay locked on through turns without relying on interpolated look-at keyframes.
 * The input scene, existing camera path and previous takes are never mutated.
 */
export function bakeSubjectShot(
  doc: Readonly<SceneDoc>,
  options: SubjectShotOptions,
  meta: Omit<TakeMeta, 'source' | 'fps' | 'sensor' | 'aspect'>,
): Take {
  const subject = doc.objects.find((o) => o.id === options.subjectId);
  if (!subject || subject.kind === 'light' || subject.hiddenInRenders) throw new Error('Choose a visible actor or prop as the subject.');
  if (!['track', 'orbit', 'push'].includes(options.move)) throw new Error('Choose a tracking, orbit or push-in move.');
  const { duration, aimHeight, orbitDegrees, endDistance } = options;
  if (!Number.isFinite(duration) || duration < 1 || duration > 30) throw new Error('Duration must be between 1 and 30 seconds.');
  if (!Number.isFinite(aimHeight) || aimHeight < 0 || aimHeight > 10) throw new Error('Aim height must be between 0 and 10 metres.');
  if (!Number.isFinite(orbitDegrees) || Math.abs(orbitDegrees) > 180) throw new Error('Orbit angle must be between −180 and 180 degrees.');
  if (!Number.isFinite(endDistance) || endDistance < 0.25 || endDistance > 2) throw new Error('End distance must be between 25% and 200%.');

  const opening = objectPoseAt(subject, 0).p;
  const offset = doc.camera.transform.position.map((v, i) => v - opening[i] - (i === 1 ? aimHeight : 0)) as Vec3;
  // A vertical/coincident view has no stable horizon or orbit direction.
  if (Math.hypot(offset[0], offset[2]) < 0.25) throw new Error('Move the camera at least 0.25 m to the side of the subject before generating a shot.');
  if (Math.hypot(...offset) * (options.move === 'push' ? Math.min(1, endDistance) : 1) < 0.25) throw new Error('The camera would finish too close to the subject. Increase the opening or end distance.');

  const lens = doc.camera.lens;
  const rec = new TakeRecorder(lens.fps, doc);
  const intervals = Math.round(duration * lens.fps);
  for (let k = 0; k <= intervals; k++) {
    const t = k / lens.fps;
    const u = k / intervals;
    const ease = u * u * (3 - 2 * u);
    const angle = options.move === 'orbit' ? orbitDegrees * Math.PI / 180 * ease : 0;
    const distance = options.move === 'push' ? 1 + (endDistance - 1) * ease : 1;
    const c = Math.cos(angle), s = Math.sin(angle);
    const delta: Vec3 = [(offset[0] * c + offset[2] * s) * distance, offset[1] * distance, (offset[2] * c - offset[0] * s) * distance];
    const target = objectPoseAt(subject, t).p;
    target[1] += aimHeight;
    const position = target.map((v, i) => v + delta[i]) as Vec3;
    const yaw = Math.atan2(delta[0], delta[2]);
    const pitch = -Math.atan2(delta[1], Math.hypot(delta[0], delta[2]));
    const rotation = multiplyQuat(quatFromYaw(yaw), [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)]);
    rec.push(t, { p: position, q: rotation, focal: lens.focalLength, focus: Math.hypot(...delta) });
  }
  return rec.finish({ ...meta, fps: lens.fps, sensor: lens.sensor, aspect: lens.aspect, source: 'keyframed' });
}
