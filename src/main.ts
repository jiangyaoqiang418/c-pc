import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ArcoVue from '@arco-design/web-vue';
import ArcoVueIcon from '@arco-design/web-vue/es/icon';
import '@arco-design/web-vue/dist/arco.css';
import { MotionPlugin } from '@vueuse/motion';
// 品牌字体（Inter + JetBrains Mono）
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import App from './App.vue';
import { router } from './router';
import './styles/tokens.scss';
import './styles/shop.scss';
import './styles/chat.scss';
import './styles/main.css'; // Tailwind v4 入口

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ArcoVue);
app.use(ArcoVueIcon);
app.use(MotionPlugin);
app.mount('#app');
