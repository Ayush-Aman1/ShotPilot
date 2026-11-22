# Code review checklist

Use this checklist when reviewing changes to ShotPilot. Read [CONTRIBUTING.md](../CONTRIBUTING.md)
for the architecture and conventions. Inspect the diff and surrounding code; tie each finding
to a concrete failure scenario and include a file and line reference.

## Architecture invariants

1. **Model is the single source of truth.** Scene state lives in `src/model/` as plain JSON-safe data: no Three.js types and no class instances. Flag state stored only on an `Object3D` (`userData`, ad-hoc properties) that should survive save/load or undo. Flag Three.js imports inside `src/model/`.
2. **Mutations go through `Editor`.** UI, XR and desktop code must call `Editor` methods. They must not write to `editor.doc` directly or mutate objects returned by `pathOf`, except inside an edit callback (`editPath` within `update`). Drags use `begin()` → `setTransform(..., transient = true)` per frame → `commit()`, which records one undo step. Flag missing `commit()` on every exit path (including cancel and error), and transient edits outside a `begin` / `commit` pair.
3. **Three.js follows the model.** Visual changes should come from `SceneSync.reconcile()` reacting to `'doc'` events, not from UI code poking scene objects. Preview and playback may pose objects only through `setPreviewTime` / `setTakePoses` / `VirtualCamera.setOverride`, which never touch the model.
4. **Editor-only objects stay out of renders.** Every new gizmo, label, path, helper mesh, VR panel or marker must set `userData.helper = true` **and** be registered with `App.addEditorOnly()`. Objects hidden from renders by user choice use `hiddenInRenders` / `SceneSync.renderHidden`. Anything new attached to `VirtualCamera`'s root must not leak into passes.
5. **Determinism.** Rendering and take sampling use frame time `k / fps` and `sampleTake`, never `performance.now()`, `Date.now()`, `Math.random()` or wall-clock deltas. `TakeRenderer` must avoid APIs that background tabs throttle (`toBlob`, `convertToBlob`, timers, rAF, async readback). Bundle timestamps stay fixed.
6. **Handedness.** No hard-coded `'left'` / `'right'` for the pointer or menu hand. Use `dominantHand()` / `isOffHand()` from prefs.
7. **File formats.** If a saved shape (`SceneDoc`, `SceneObject`, `CameraRig`, `Take`, manifest) changed, check whether the version was bumped with a migration, or that the new field is optional and defaulted in `parseScene` / `parseTake`. Parsers must turn bad input into the format's error class or a repaired default, never a raw `TypeError`.
8. **Pure logic is tested.** New pure functions in `model/`, `camera/lens.ts`, `render/plan.ts`, `render/pose.ts` or `render/manifest.ts` should have a `*.test.ts` next to them.
9. **UI conventions.** Icon buttons need `title` and `aria-label`. Toggles use `aria-pressed`. State changes away from focus are announced with `ui/announce.ts`. Keyboard shortcuts are ignored while focus is in an input.

## Quest performance

Target 72 fps on Meta Quest 3 (about 13.9 ms per frame, shared with the browser compositor).
Review changes to per-frame code in the app, input, scene sync, camera and VR menu.

### Scope

Start from the diff: `git diff HEAD` (plus `git diff --cached`). If there is no diff, use the files the caller names. Work out which changed code runs **every frame**:

- `App.tick` and everything it calls: desktop controls, every `onFrame` callback registered by `Studio`, `XREditor`, `CameraView`, `Playback`, and `VirtualCamera` (monitor render, autofocus).
- `SceneSync.setPreviewTime` / `setTakePoses` during preview and playback, and mixer updates.
- VR menu (`src/ui/vr/`) redraw paths, which can be triggered per frame by hover.

Code that runs once per user action (button clicks, file import, `TakeRenderer` offline frames) is **out of scope** unless it is accidentally called per frame.

### What to flag

1. **Allocations in the frame path:** `new Vector3/Quaternion/Matrix4/Euler/Color/Box3/Raycaster`, array or object literals, spreads, `.map/.filter/.slice`, closures created per frame, `clone()`, template strings built each frame, `structuredClone`. The project convention is module-level or member scratch objects that are reused (e.g. `const tmpV = new Vector3()`).
2. **Raycasts or precise bounds** (`Box3.setFromObject(obj, true)`, `computeBoundingBox`, `raycaster.intersectObject(..., true)`) against skinned meshes every frame without a throttle or a cheaper proxy.
3. **Scene-graph churn:** `add/remove`, `traverse` over the whole scene, or creating geometries or materials per frame. Also `needsUpdate = true` on materials or textures every frame, which triggers a recompile or upload.
4. **Canvas texture redraws** (VR panels, labels, the monitor) every frame instead of on change.
5. **Extra render passes:** each additional `renderer.render` in XR (monitor, picture-in-picture) is expensive. Check that `Studio`'s `MONITOR_LEVELS` quality governor still applies to anything new.
6. **DOM work from the XR loop:** layout reads like `getBoundingClientRect` or `offsetWidth`, or DOM writes per frame.
7. **Event-listener or `onFrame` leaks:** callbacks registered without being removed on dispose or mode change.

Prioritize the most expensive issues. Explain what runs per frame, why it costs time,
and a concrete fix. State uncertainty and avoid reporting style nits as performance bugs.
