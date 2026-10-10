import { createApp, type Plugin } from 'vue';
import { createPinia } from 'pinia';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Cascader,
  Checkbox,
  Collapse,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Grid,
  Image,
  Input,
  InputNumber,
  Link,
  Pagination,
  Popconfirm,
  Progress,
  Radio,
  Result,
  Select,
  Space,
  Spin,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Textarea,
  Timeline,
  Tooltip,
  Tree
} from '@arco-design/web-vue';
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
import BusinessDialog from './components/common/business-dialog.vue';
import { router } from './router';
import './styles/tokens.scss';
import './styles/shop.scss';
import './styles/chat.scss';
import './styles/main.css'; // Tailwind v4 入口

const app = createApp(App);
app.use(createPinia());
app.use(router);
const arcoPlugins: Plugin[] = [
  Alert, Badge, Breadcrumb, Button, Card, Cascader, Checkbox, Collapse, Descriptions, Divider, Drawer, Dropdown,
  Empty, Form, Grid, Image, Input, InputNumber, Link, Pagination, Popconfirm, Progress, Radio, DatePicker, Result, Select,
  Space, Spin, Steps, Switch, Table, Tabs, Tag, Textarea, Timeline, Tooltip, Tree
];
arcoPlugins.forEach(plugin => app.use(plugin));
// 业务弹窗统一进入 Reka 的焦点栈；保留现有表单事件契约。
app.component('AModal', BusinessDialog);
app.use(MotionPlugin);
app.mount('#app');
