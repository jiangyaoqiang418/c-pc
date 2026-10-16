<script setup lang="ts">
import { defineComponent, ref, shallowRef, watch } from 'vue';
import type { DateRange } from 'reka-ui';
import type { DateValue } from 'reka-ui/date';
import { parseStringToDateValue } from 'reka-ui/date';
import {
  injectRangeCalendarRootContext,
  PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger,
  RangeCalendarCell, RangeCalendarCellTrigger, RangeCalendarGrid,
  RangeCalendarGridBody, RangeCalendarGridHead, RangeCalendarGridRow,
  RangeCalendarHeadCell, RangeCalendarHeader, RangeCalendarHeading,
  RangeCalendarNext, RangeCalendarPrev, RangeCalendarRoot
} from 'reka-ui';
import { Icon } from '@iconify/vue';

defineOptions({ inheritAttrs: false });
const props = defineProps<{ id?: string; from?: string; to?: string }>();
const emit = defineEmits<{ 'update:from': [value: string]; 'update:to': [value: string] }>();
const open = ref(false);
const draftFrom = ref('');
const draftTo = ref('');
const error = ref('');
const reference = shallowRef<DateValue>();
const month = shallowRef<DateValue>();
const range = shallowRef<DateRange>({ start: undefined, end: undefined });
const calendarVersion = ref(0);

// Reuse the calendar's DateValue and public parser without adding a date dependency.
const CalendarReference = defineComponent({
  emits: { ready: (_value: DateValue) => true },
  setup(_props, { emit: notify }) {
    notify('ready', injectRangeCalendarRootContext().placeholder.value);
    return () => null;
  }
});

function parse(value?: string) {
  if (!value || !reference.value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try { return parseStringToDateValue(value, reference.value); } catch { return undefined; }
}
function syncCalendar() {
  if (!reference.value) return;
  const start = parse(draftFrom.value);
  const end = parse(draftTo.value);
  if ((draftFrom.value && !start) || (draftTo.value && !end) || (start && end && start.compare(end) > 0)) return;
  range.value = { start, end };
  month.value = undefined;
  calendarVersion.value++;
}
function initializeCalendar(value: DateValue) {
  reference.value = value;
  syncCalendar();
}

watch(open, value => {
  if (!value) return;
  draftFrom.value = props.from || '';
  draftTo.value = props.to || '';
  error.value = '';
  month.value = undefined;
  syncCalendar();
});

function selectRange(value: DateRange) {
  range.value = value;
  draftFrom.value = value.start?.toString() || '';
  draftTo.value = value.end?.toString() || '';
  error.value = '';
}
function confirm() {
  if ((draftFrom.value && !parse(draftFrom.value)) || (draftTo.value && !parse(draftTo.value))) {
    error.value = '请输入有效日期，格式为 YYYY-MM-DD';
    return;
  }
  if (draftFrom.value && draftTo.value && draftFrom.value > draftTo.value) {
    error.value = '开始日期不能晚于结束日期';
    return;
  }
  emit('update:from', draftFrom.value);
  emit('update:to', draftTo.value);
  open.value = false;
}
function confirmOnEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  event.stopPropagation();
  confirm();
}
function clear() {
  draftFrom.value = '';
  draftTo.value = '';
  error.value = '';
  syncCalendar();
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button v-bind="$attrs" :id="id" type="button" class="date-range-trigger" aria-label="选择日期范围">
        <Icon icon="lucide:calendar-days" />
        <span :class="{ 'date-range-placeholder': !from && !to }">{{ from || '开始日期' }}<span class="date-range-separator">—</span>{{ to || '结束日期' }}</span>
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent class="date-range-panel" align="start" :side-offset="8" :collision-padding="16" aria-label="日期范围选择">
        <div class="date-range-inputs" @keydown.enter="confirmOnEnter">
          <label>开始日期<input v-model="draftFrom" aria-label="开始日期" placeholder="YYYY-MM-DD" maxlength="10" :aria-invalid="!!error" @input="error = ''" @change="syncCalendar" /></label>
          <span>—</span>
          <label>结束日期<input v-model="draftTo" aria-label="结束日期" placeholder="YYYY-MM-DD" maxlength="10" :aria-invalid="!!error" @input="error = ''" @change="syncCalendar" /></label>
        </div>
        <RangeCalendarRoot v-if="!reference" class="date-calendar-bootstrap" locale="zh-CN">
          <CalendarReference @ready="initializeCalendar" />
        </RangeCalendarRoot>
        <RangeCalendarRoot v-else :key="calendarVersion" v-slot="{ grid, weekDays }" :model-value="range" :placeholder="month || range.start || range.end" locale="zh-CN" calendar-label="选择日期范围" :week-starts-on="1" @update:model-value="selectRange" @update:placeholder="month = $event">
          <RangeCalendarHeader class="date-calendar-header">
            <RangeCalendarPrev class="date-calendar-nav" aria-label="上个月"><Icon icon="lucide:chevron-left" /></RangeCalendarPrev>
            <RangeCalendarHeading class="date-calendar-heading" />
            <RangeCalendarNext class="date-calendar-nav" aria-label="下个月"><Icon icon="lucide:chevron-right" /></RangeCalendarNext>
          </RangeCalendarHeader>
          <RangeCalendarGrid v-for="gridMonth in grid" :key="gridMonth.value.toString()" class="date-calendar-grid">
            <RangeCalendarGridHead><RangeCalendarGridRow><RangeCalendarHeadCell v-for="day in weekDays" :key="day" class="date-calendar-weekday">{{ day }}</RangeCalendarHeadCell></RangeCalendarGridRow></RangeCalendarGridHead>
            <RangeCalendarGridBody><RangeCalendarGridRow v-for="(week, index) in gridMonth.rows" :key="index"><RangeCalendarCell v-for="day in week" :key="day.toString()" :date="day" class="date-calendar-cell"><RangeCalendarCellTrigger :day="day" :month="gridMonth.value" class="date-calendar-day" /></RangeCalendarCell></RangeCalendarGridRow></RangeCalendarGridBody>
          </RangeCalendarGrid>
        </RangeCalendarRoot>
        <p v-if="error" class="date-range-error" role="alert">{{ error }}</p>
        <div class="date-range-footer"><button type="button" class="date-range-clear" @click="clear">清空日期</button><button type="button" class="date-range-confirm" @click="confirm">完成</button></div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style>
/* These prefixed rules also cover Reka's portalled calendar elements. */
.date-range-trigger { display:flex; align-items:center; gap:10px; width:100%; height:46px; padding:0 14px; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); text-align:left; font-size:14px; font-weight:400; line-height:20px; }
.date-range-trigger > svg { width:17px; height:17px; flex-shrink:0; color:var(--muted); }
.date-range-trigger > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.date-range-placeholder { color:var(--muted); }
.date-range-separator { margin:0 8px; color:var(--muted); }
.date-range-panel { z-index:1100; width:320px; max-width:calc(100vw - 32px); max-height:var(--reka-popover-content-available-height); overflow:auto; padding:16px; border:1px solid var(--line); border-radius:12px; background:var(--paper); color:var(--ink); box-shadow:0 12px 40px #0003; }
.date-range-inputs { display:flex; align-items:flex-end; gap:8px; margin-bottom:12px; }
.date-range-inputs > label { display:flex; flex-direction:column; gap:6px; min-width:0; flex:1; margin:0; font-size:12px; font-weight:500; line-height:20px; }
.date-range-inputs input { width:100%; min-width:0; height:36px; padding:0 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--ink); font-size:12px; font-weight:400; }
.date-range-inputs > span { padding-bottom:7px; color:var(--muted); }
.date-calendar-bootstrap { display:none; }
.date-calendar-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
.date-calendar-heading { font-size:14px; font-weight:600; }
.date-calendar-nav { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:0; border:1px solid var(--line); border-radius:6px; background:transparent; color:var(--ink); }
.date-calendar-nav svg { width:16px; height:16px; }
.date-calendar-grid { width:100%; table-layout:fixed; border-collapse:collapse; }
.date-calendar-weekday { height:32px; padding:0; border:0; text-align:center; font-size:12px; font-weight:400; color:var(--muted); }
.date-calendar-cell { height:32px; padding:0; border:0; text-align:center; }
.date-calendar-day { display:inline-flex; align-items:center; justify-content:center; width:100%; height:32px; padding:0; border:0; border-radius:6px; background:transparent; color:var(--ink); font-size:13px; font-weight:400; line-height:1; cursor:pointer; }
.date-calendar-day:hover, .date-calendar-day[data-highlighted] { background:var(--soft); }
.date-calendar-cell:has([data-selected]) { background:var(--soft); }
.date-calendar-cell:has([data-selection-start]) { border-radius:6px 0 0 6px; }
.date-calendar-cell:has([data-selection-end]) { border-radius:0 6px 6px 0; }
.date-calendar-day[data-selection-start], .date-calendar-day[data-selection-end] { background:var(--green); color:var(--bg); }
.date-calendar-day[data-today]:not([data-selected]) { box-shadow:inset 0 0 0 1px var(--line); }
.date-calendar-day[data-outside-view] { color:var(--muted); opacity:.45; }
.date-calendar-day[data-disabled] { opacity:.35; cursor:not-allowed; }
.date-range-trigger:focus-visible, .date-range-inputs input:focus-visible, .date-calendar-day:focus-visible, .date-calendar-nav:focus-visible, .date-range-footer button:focus-visible { outline:2px solid var(--focus-ring,var(--green)); outline-offset:2px; box-shadow:none; }
.date-range-error { margin:10px 0 0; color:var(--yb-danger,#ef4444); font-size:12px; }
.date-range-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
.date-range-footer button { min-height:34px; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:500; }
.date-range-clear { border:1px solid var(--line); background:transparent; color:var(--muted); }
.date-range-confirm { border:1px solid var(--green); background:var(--green); color:var(--bg); }
</style>
