<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { FeedbackContent } from '@/lib/feedback';

export default defineComponent({
  props: { content: { type: [String, Number, Object, Function] as PropType<FeedbackContent> } },
  setup(props) {
    return () => typeof props.content === 'function' ? props.content() : props.content ?? null;
  }
});
</script>
