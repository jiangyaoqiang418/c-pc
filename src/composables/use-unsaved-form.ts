import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { Modal } from '@arco-design/web-vue';

/** 快照只在组件内存中比较；自动回填不算用户编辑，不保存表单或证件资料。 */
export function createUnsavedFormState<T extends object>(snapshot: () => T) {
  const capture = () => Object.fromEntries(Object.entries(snapshot()).map(([key, value]) => [key, JSON.stringify(value)]));
  const baseline = ref<Record<string, string | undefined>>(capture());
  const interacted = ref(false);
  const dirty = computed(() => {
    if (!interacted.value) return false;
    const current = capture();
    return [...new Set([...Object.keys(current), ...Object.keys(baseline.value)])]
      .some(key => current[key] !== baseline.value[key]);
  });
  const markInteracted = () => {
    if (interacted.value) return;
    baseline.value = capture();
    interacted.value = true;
  };
  const markSaved = () => { interacted.value = false; baseline.value = capture(); };
  const acceptAutomaticField = <K extends keyof T>(key: K, value: T[K]) => {
    baseline.value[String(key)] = JSON.stringify(value);
  };
  return { dirty, markInteracted, markSaved, acceptAutomaticField };
}

export function useUnsavedForm<T extends object>(snapshot: () => T, context: () => unknown) {
  const state = createUnsavedFormState(snapshot);
  let dialog: ReturnType<typeof Modal.confirm> | undefined;
  let decision: Promise<boolean> | undefined;
  let settle: ((leave: boolean) => void) | undefined;

  function closeDecision(leave: boolean) {
    const resolve = settle;
    settle = undefined;
    decision = undefined;
    dialog?.close();
    dialog = undefined;
    resolve?.(leave);
  }

  function confirmLeave() {
    if (!state.dirty.value) return true;
    if (decision) return decision;
    decision = new Promise<boolean>(resolve => {
      settle = resolve;
      dialog = Modal.confirm({
        title: '离开未提交的表单？',
        content: '离开后，本页未提交的内容将丢失。已经发出的提交或上传请求不会因此取消，请以业务记录为准。',
        okText: '离开页面',
        cancelText: '继续编辑',
        onOk: () => closeDecision(true),
        onCancel: () => closeDecision(false)
      });
    });
    return decision;
  }

  function markSaved() {
    state.markSaved();
    closeDecision(true);
  }

  function beforeUnload(event: BeforeUnloadEvent) {
    if (!state.dirty.value) return;
    event.preventDefault();
    event.returnValue = '';
  }

  watch(context, () => { state.markSaved(); closeDecision(false); }, { flush: 'sync' });
  onBeforeRouteLeave(confirmLeave);
  onBeforeRouteUpdate((to, from) => JSON.stringify(to.params) === JSON.stringify(from.params) ? true : confirmLeave());
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload); closeDecision(false); });
  return { markInteracted: state.markInteracted, markSaved, acceptAutomaticField: state.acceptAutomaticField };
}
