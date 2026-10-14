import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { MotionPlugin } from '@vueuse/motion';
// v47 uses the system CJK and data font stacks from the frozen reference styles.
import App from './App.vue';
import BusinessDialog from './components/common/business-dialog.vue';
import { router } from './router';
import './styles/tokens.scss';
import './styles/shop.scss';
import './styles/chat.scss';
import './styles/main.css'; // Tailwind v4 入口

const app = createApp(App);
app.use(createPinia());
app.use(router);
// 业务弹窗统一进入 Reka 的焦点栈；保留现有表单事件契约。
app.component('AModal', BusinessDialog);
app.use(MotionPlugin);
app.mount('#app');
