import { nextTick, type ObjectDirective } from 'vue';
import './required-feedback.css';

type Rules = Record<string, string | false | undefined>;
type Mark = { note: HTMLElement; invalid: string | null; described: string | null };
type State = { rules: Rules; attempted: boolean; touched: Set<HTMLElement>; marks: Map<HTMLElement, Mark>; cleanup: () => void };
const states = new WeakMap<HTMLElement, State>();
let sequence = 0;
const controls = 'input:not([type="hidden"]),textarea,select,[role="combobox"],[role="checkbox"],button';

function errors(root: HTMLElement, state: State) {
  const result = new Map<HTMLElement, string>();
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[required],textarea[required],select[required]').forEach(control => {
    if (control.matches(':disabled') || control.type === 'hidden') return;
    if (control.validity.valueMissing || ((control.type === 'password' || !!control.closest('[data-required-feedback-control]')) ? !control.value : !control.value.trim())) {
      const labelNode = control.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
      labelNode?.querySelectorAll('.required-feedback-message').forEach(note => note.remove());
      const label = (labelNode?.textContent || control.getAttribute('aria-label'))?.replace(/\*/g, '').trim();
      result.set(control, label ? `请填写${label}` : '请填写此必填项');
    }
  });
  for (const [selector, message] of Object.entries(state.rules)) {
    const target = root.querySelector<HTMLElement>(selector);
    if (message && target && !target.matches(':disabled')) result.set(target, message);
  }
  return result;
}
function clear(target: HTMLElement, mark: Mark) {
  mark.note.remove(); target.classList.remove('required-feedback-invalid');
  if (mark.invalid === null) target.removeAttribute('aria-invalid'); else target.setAttribute('aria-invalid', mark.invalid);
  const described = target.getAttribute('aria-describedby')?.split(/\s+/).filter(id => id !== mark.note.id).join(' ');
  if (described) target.setAttribute('aria-describedby', described); else target.removeAttribute('aria-describedby');
}
function paint(root: HTMLElement, state: State) {
  const missing = errors(root, state);
  for (const [target, mark] of state.marks) {
    if (!missing.has(target)) { clear(target, mark); state.marks.delete(target); }
  }
  for (const [target, message] of missing) {
    if (!state.attempted && !state.touched.has(target)) continue;
    let mark = state.marks.get(target);
    if (!mark) {
      const note = document.createElement('span');
      note.id = `required-feedback-${++sequence}`; note.className = 'required-feedback-message'; note.setAttribute('role', 'alert');
      mark = { note, invalid:target.getAttribute('aria-invalid'), described:target.getAttribute('aria-describedby') };
      state.marks.set(target, mark);
      (target.closest('[data-required-feedback-control]') || target).insertAdjacentElement('afterend', note);
    }
    mark.note.textContent = message;
    target.classList.add('required-feedback-invalid'); target.setAttribute('aria-invalid', 'true');
    const described = target.getAttribute('aria-describedby')?.split(/\s+/).filter(id => id !== mark.note.id).join(' ');
    target.setAttribute('aria-describedby', [described, mark.note.id].filter(Boolean).join(' '));
  }
  return missing;
}

export function validateRequiredFeedback(root: HTMLElement | undefined | null) {
  const state = root && states.get(root);
  if (!root || !state) return true;
  state.attempted = true;
  const missing = paint(root, state);
  if (!missing.size) return true;
  const first = missing.keys().next().value!;
  const focus = first.matches(controls) ? first : first.querySelector<HTMLElement>(controls);
  (focus || first).focus(); first.scrollIntoView({ block:'center', behavior:'auto' });
  return false;
}

/** Explicit form scope; presentation and empty-field checks only. Business validation stays in each submit handler. */
export const vRequiredFeedback: ObjectDirective<HTMLElement, Rules | undefined> = {
  mounted(root, binding) {
    if (typeof HTMLElement === 'undefined' || !(root instanceof HTMLElement)) return;
    const state: State = { rules:binding.value || {}, attempted:false, touched:new Set(), marks:new Map(), cleanup:() => {} };
    const refresh = () => { void nextTick(() => { if (states.has(root)) paint(root, state); }); };
    const blur = (event: Event) => { if (event.target instanceof HTMLElement) state.touched.add(event.target); refresh(); };
    const validate = (event: Event) => {
      if (event.type === 'click' && !(event.target instanceof Element && event.target.closest('[data-validate-required]'))) return;
      if (event.type === 'submit' && event.target !== root) return;
      if (!validateRequiredFeedback(root)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    root.addEventListener('submit', validate, true); root.addEventListener('click', validate, true);
    root.addEventListener('invalid', validate, true); root.addEventListener('focusout', blur); root.addEventListener('input', refresh); root.addEventListener('change', refresh);
    state.cleanup = () => {
      root.removeEventListener('submit', validate, true); root.removeEventListener('click', validate, true);
      root.removeEventListener('invalid', validate, true); root.removeEventListener('focusout', blur); root.removeEventListener('input', refresh); root.removeEventListener('change', refresh);
      state.marks.forEach((mark, target) => clear(target, mark));
    };
    states.set(root, state);
  },
  updated(root, binding) { const state = states.get(root); if (state) { state.rules = binding.value || {}; paint(root, state); } },
  beforeUnmount(root) { states.get(root)?.cleanup(); states.delete(root); }
};
