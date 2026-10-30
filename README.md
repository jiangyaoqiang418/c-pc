# Umaomao C 端 PC

基于 `Vue 3 + Vite + TypeScript + shadcn-vue / Reka UI + Pinia + Vue Router + Tailwind CSS v4`。v47 代码迁移已完成，后续在 `main` 分支维护。业务接口接入与真实验收状态见 [接口接入计划](./docs/api-integration-plan.md) 和 [Swagger 匹配矩阵](./docs/api-swagger-match-matrix.md)。

## 环境与命令

项目使用 `pnpm`。

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
```

- 开发服务端口由 `vite.config.ts` 配置为 `5173`。
- 构建产物位于 `dist/`。
- 换电脑承接统一使用 `main`；先检查工作区，干净时 fetch 后 `git pull --ff-only origin main`，有本地改动先检查保留。缺少依赖时仅恢复已有锁定包，不新增或升级。

## 目录

```text
src/
├── views/                 # 按业务模块组织的页面
├── components/            # 业务、通用及 ui/ 下的 shadcn 源码组件
├── layouts/               # 页面布局
├── router/                # vue-router
├── stores/                # Pinia
├── composables/           # 可复用组合逻辑
├── mock/                  # 当前本地 Mock API、类型、数据和工具
└── styles/                # 主题与全局样式
```

`@shared` 和 `@shared/*` 都指向本项目的 `src/mock/`，不是外部共享包。

## 当前数据与请求状态

- 已对接模块通过 `src/service/request/`、`src/service/api/` 调用真实接口，使用原生 `fetch` 和 Vite 代理访问 admin、user、order、notify 服务。
- 尚未匹配真实契约的模块继续通过 `@shared` 使用 `src/mock/api/*.ts`，已切真实接口的模块不自动回退 Mock。
- Mock 使用内存数据和 `Promise + setTimeout` 模拟异步与分页；真实接口、页面接入和浏览器回归状态在文档中分别记录。
- PC 与 H5 的 `src/mock/` 分别存放在两个项目中，运行时互不依赖。

## 真实接口对接约定

- C 端与后台系统共用 Swagger / Knife4j：`http://221.128.249.198:8902/doc.html`。
- 后台协作、审核及测试数据操作统一访问已部署管理站：[https://testhou.merchantsale.store/](https://testhou.merchantsale.store/)；不使用本地后台启动地址。C-PC 的 `localhost:5173` 仅用于本地页面开发和代理验证。
- 后台登录账号以后台项目文档中明确记录的开发、测试或演示账号为准；不在本项目复制或提交任何凭据。
- 交互逻辑以前端现有页面为准；路径、字段、类型、枚举、分页和响应结构以后端接口为准。
- 真实接口代码统一放在 `src/service/request/`、`src/service/api/` 和 `src/typings/api/`，请求职责与后台项目保持一致。
- 未对接模块继续使用现有 Mock；已切真实接口的模块不自动 fallback Mock。
- 请求层使用原生 fetch，复用现有封装。

详细规则见：

- [AGENTS.md](AGENTS.md)
- [真实接口接入计划](docs/api-integration-plan.md)
- [Swagger 真实接口匹配矩阵](docs/api-swagger-match-matrix.md)

## 主题配色

- 主操作和链接使用 `--yb-brand-primary`，悬停使用 `--yb-brand-hover`，选中底色使用 `--yb-primary-soft`。
- 活动背景使用 `--yb-accent` 并搭配 `--yb-accent-ink`；白底上的金色小字使用更深的 `--yb-gold`。
- 旧 `--yb-brand-pink*`、`--yb-primary*` 和 `--bw-*` 保留兼容映射。Arco 入口、样式与依赖已移除；`AModal` / `a-modal` 是基于 Reka Dialog 的业务弹窗兼容名称，不再调用 Arco。
- 页面样式优先引用主题变量；ECharts 渐变使用解析后的实际色值，SVG 和 CSS 图表可以直接引用主题变量。业务状态、角色标识和第三方品牌色保持各自语义。

## 交互基础

- 按钮与卡片采用柔和商城型 hover、焦点和页面过渡，尊重系统“减少动态效果”设置。
- 全局消息支持悬浮或聚焦暂停消失；弹窗、抽屉、下拉和 Tooltip 分层，抽屉保留左侧遮罩。
- 既有筛选、分页、失败重试、上传、支付密码、未保存提示、实时消息及结果核对流程保留；原型缺失的业务操作沿用现有实现。
- 帮助文章、公告与协议读取正式内容接口，列表为空或没有有效协议时显示真实状态；不回退演示正文。AI 选购助手 `/ai-guide` 已接 Java 网关 POST SSE，支持商品及本人订单/钱包查询、停止生成、账号隔离和异常断流；真实模型返回仍需测试环境配置就绪后验收。

## 开发边界

- 用户会话仅通过真实账号登录和会话恢复建立，不再提供演示账号登录或切换。钱包及 CSV 展示真实流水类型，不根据备注关键词覆盖为测试到账；正式构建不注册开发页面总览路由。界面文案整改及验收边界见 [用户界面文案检查清单](./用户界面文案检查清单-待审核.md)。
- 界面按 v47 组织，保留真实筛选、分页、路由 query、错误恢复和权限边界；缺失生产状态沿原型设计语言补充并记录。
- 优先在请求/API adapter 边界处理后端字段差异。
- 不做无关重构、不升级依赖、不批量修改历史 Mock 或 ID 类型。
- 修改后执行适用的类型、测试、构建和 Chrome 检查；检查通过不等于真实业务验收完成。

## 历史资料与开发工具

- v47 迁移归档（历史资料已清理）：历史迁移计划、交付资料和设计验收记录，不作为当前进度。
- 业务组件及样式中的 `v47` 名称仍有实际引用，不代表待迁移代码。
- `outputs/` 为本地截图、检查报告等临时产物，不纳入 Git。
