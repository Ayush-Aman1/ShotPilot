import type { Takes } from '../app/Takes';
import type { Editor } from '../model/Editor';
import type { SubjectMove, SubjectShotOptions } from '../model/subjectShot';
import { announce } from './announce';
import { el } from './dom';
import { Modal } from './popover';

/** Desktop shot assistant; generated takes use the existing playback and export pipeline. */
export class SubjectShotDialog {
  private readonly modal: Modal;
  private draft: SubjectShotOptions = { subjectId: '', move: 'track', duration: 5, aimHeight: 1, orbitDegrees: 90, endDistance: 0.5 };

  constructor(private readonly editor: Editor, private readonly takes: Takes) {
    this.modal = new Modal('Subject-following shot', () => this.build());
  }

  open(): void { void this.modal.open(); }

  private build(): HTMLElement {
    const subjects = this.editor.doc.objects.filter((o) => o.kind !== 'light' && !o.hiddenInRenders);
    const subject = el('select', { class: 'input', required: true, 'aria-label': 'Shot subject' },
      ...subjects.map((o) => el('option', { value: o.id, text: o.name })));
    if (subjects.some((o) => o.id === this.draft.subjectId)) subject.value = this.draft.subjectId;
    if (subjects.some((o) => o.id === this.editor.selectedId)) subject.value = this.editor.selectedId!;
    const move = el('select', { class: 'input', 'aria-label': 'Shot move' },
      el('option', { value: 'track', text: 'Track — keep distance and follow' }),
      el('option', { value: 'orbit', text: 'Orbit — circle the moving subject' }),
      el('option', { value: 'push', text: 'Push in / pull out — change distance' }));
    move.value = this.draft.move;
    const number = (label: string, value: number, min: number, max: number, step: number) => el('input', {
      class: 'input', type: 'number', required: true, value: String(value), min: String(min), max: String(max), step: String(step), 'aria-label': label,
    });
    const duration = number('Shot duration (seconds)', this.draft.duration, 1, 30, 0.1);
    const height = number('Aim height above subject (metres)', this.draft.aimHeight, 0, 10, 0.1);
    const angle = number('Orbit angle (degrees)', this.draft.orbitDegrees, -180, 180, 1);
    const distance = number('End distance (percent of opening)', this.draft.endDistance * 100, 25, 200, 1);
    const field = (label: string, input: HTMLElement) => el('label', { class: 'field' }, el('span', { class: 'field-label', text: label }), input);
    const angleField = field('Orbit angle ° (negative reverses direction)', angle);
    const distanceField = field('End distance % (50 = half as far away)', distance);
    const update = () => {
      angleField.hidden = move.value !== 'orbit'; angle.disabled = angleField.hidden;
      distanceField.hidden = move.value !== 'push'; distance.disabled = distanceField.hidden;
    };
    move.addEventListener('change', update);
    update();
    const error = el('p', { class: 'hint error', role: 'alert', hidden: true });
    const preview = el('button', { class: 'btn', type: 'button', text: 'Preview shot', disabled: !subjects.length, onclick: () => void generate(false) });
    const save = el('button', { class: 'btn primary', type: 'submit', text: 'Save new take', disabled: !subjects.length });
    const form = el('form', { class: 'stack', onsubmit: (e: SubmitEvent) => { e.preventDefault(); void generate(true); } },
      el('p', { class: 'hint', text: 'Start by placing the camera for your opening shot. The generator keeps that opening position, aims at the subject, and follows its waypoint motion at every frame.' }),
      !subjects.length ? el('p', { class: 'hint', text: 'Add a visible actor or prop to the scene first.' }) : null,
      field('Subject', subject), field('Move', move), field('Duration s', duration), field('Aim height m (above object origin)', height), angleField, distanceField,
      el('p', { class: 'hint', text: 'Orbit and push ease in and out. Focus follows the aim point; focal length stays fixed. Check the preview for obstacles: this does not avoid collisions or occlusion. Regenerate after changing the subject’s motion.' }),
      el('p', { class: 'hint', text: 'Creates a separate take. Your existing camera path is preserved. Preview is temporary; reopen this dialog to save.' }),
      error, el('div', { class: 'row' }, preview, save));
    const generate = async (persist: boolean) => {
      if (!form.reportValidity()) return;
      preview.disabled = save.disabled = true;
      error.hidden = true;
      try {
        this.draft = {
          subjectId: subject.value, move: move.value as SubjectMove, duration: +duration.value,
          aimHeight: +height.value, orbitDegrees: +angle.value, endDistance: +distance.value / 100,
        };
        const take = await this.takes.subjectShot(this.draft, persist);
        this.modal.close();
        announce(persist ? `Saved ${take.name}. Open Takes to play or render it.` : `Previewing ${take.name}.`);
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : 'Could not generate the shot.';
        error.hidden = false;
      } finally { preview.disabled = save.disabled = !subjects.length; }
    };
    return form;
  }
}
