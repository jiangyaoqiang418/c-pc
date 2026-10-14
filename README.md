# Umaomao C 端 PC

基于 `Vue 3 + Vite + TypeScript + shadcn-vue / Reka UI + Pinia + Vue Router + Tailwind CSS v4` 的 Umaomao C 端 PC 项目。当前在 `feat/pc-ui-v47` 将 UI 迁移到 Umaomao v47，状态为部分完成；真实请求、业务状态和权限边界保留。准确进度和下一步见 [当前承接状态](./docs/api-integration-plan.md)，设计红线与后端缺口见 [迁移计划](./PC-v47-migration-plan.md) 和 [后端清单](./PC-v47-backend-requirements.md)。

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
- 换电脑承接本轮使用 `feat/pc-ui-v47`，不要拉取 main 覆盖进度；已有改动先检查再同步。缺少依赖时仅恢复已有锁定包，不新增或升级。
- `http://localhost:5173/visual-v47.html` 是独立开发视觉验收页，仅使用只读原型数据；不进入正常生产构建，不作为接口错误回退。普通入口继续使用真实接口。
- 原型引用素材、主题、生成 CSS 与视觉数据已保存在工程内；重新生成参考文件才需要旁侧 `Umaomao-v47/dist`，运行项目不依赖该目录。

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
- 后续按模块建立 `src/service/request/`、`src/service/api/` 和 `src/typings/api/`，请求职责与后台项目保持一致。
- 未对接模块继续使用现有 Mock；已切真实接口的模块不自动 fallback Mock。
- 当前未安装 Axios，首个真实模块实施时再按确认方案补充请求基础设施。

详细规则见：

- [AGENTS.md](./AGENTS.md)
- [真实接口接入计划](./docs/api-integration-plan.md)
- [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)

## 当前 Swagger 满足度

截至 2026-08-29，实时契约检查读取到：admin `178` 路径 / `179` 操作，user `46/46`，order `65/67`，notify `22/22`；`pnpm check:swagger` 已通过。

- 当前实施进度约 `95%`，完整真实验收 `29/35`（约 `83%`）。主交易链路已完成地址、下单、支付、签收、仅退款的双账号回归；隔离订单已完成买手发货、物流、通知和订单群回读，顾客侧签收/评价及真实链上出款仍受测试条件限制。
- 本批已补齐新商品/求购/物流/通知/积分契约，以及提现、评价、IM 媒体和充值取消的页面适配。
- Notify WebSocket 的直连和 Vite 代理均已验证 `101 → READY → PING/PONG`；Chrome/Safari 双账号浏览器端的实时消息、已读、撤回与断线补偿也已完成。外部缺口为充值地址、提现真实链上回归，以及没有 C 端契约的 CMS、AI 模块。
- 逐模块路径、字段差异及后端补充项见 [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)。

## 主题配色

- 当前支持原型 27 主题，默认 `web3-meme`；`umaomao-themes-v47.css` 归并主题与旧变量别名，`main.css` 映射 Tailwind/shadcn 语义变量。`umaomao-reference-v47.css` 按原型 17 份 CSS 的级联顺序统一加载，来源哈希见 `v47-reference-manifest.json`。迁移中保留旧 `umaomao.css` 的兼容层，已有原型外观不能被库默认风格替换。
- 主操作和链接使用 `--yb-brand-primary`，悬停使用 `--yb-brand-hover`，选中底色使用 `--yb-primary-soft`。
- 活动背景使用 `--yb-accent` 并搭配 `--yb-accent-ink`；白底上的金色小字使用更深的 `--yb-gold`。
- 旧 `--yb-brand-pink*`、`--yb-primary*` 和 `--bw-*` 保留兼容映射。Arco 入口、样式与依赖已移除；`AModal` / `a-modal` 是基于 Reka Dialog 的业务弹窗兼容名称，不再调用 Arco。
- 页面样式优先引用主题变量；ECharts 渐变使用解析后的实际色值，SVG 和 CSS 图表可以直接引用主题变量。业务状态、角色标识和第三方品牌色保持各自语义。

## 交互基础

- 按钮与卡片采用柔和商城型 hover、焦点和页面过渡，尊重系统“减少动态效果”设置。
- 全局消息支持悬浮或聚焦暂停消失；弹窗、抽屉、下拉和 Tooltip 分层，抽屉保留左侧遮罩。
- 既有筛选、分页、失败重试、上传、支付密码、未保存提示、实时消息及结果核对流程保留；原型缺失的业务操作沿用现有实现。
- 帮助文章、公告和 AI 的真实接口缺口仍保留未开放状态；协议保留原有演示声明，不伪造已上线内容。
- 2026-10-14 本批保存前类型检查、9 文件/203 项现有测试及生产构建通过；首页默认 MEME 关键节点已做 Chrome 同数据对照，整站像素、动画与真实写入验收仍未完成，详见 [design-qa](./design-qa.md)。

## 开发边界

- 界面按 v47 组织，保留真实筛选、分页、路由 query、错误恢复和权限边界；缺失生产状态沿原型设计语言补充并记录。
- 优先在请求/API adapter 边界处理后端字段差异。
- 不做无关重构、不升级依赖、不批量修改历史 Mock 或 ID 类型。
- 迁移与保存进度按计划执行适用的类型、测试、构建和 Chrome 检查；检查通过不等于整站或真实业务验收完成。
