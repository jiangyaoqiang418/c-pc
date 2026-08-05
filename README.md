# 油宝 C 端 PC

基于 `Vue 3 + Vite + TypeScript + Arco Design Vue + Pinia + Vue Router + Tailwind CSS` 的油宝 C 端 PC 项目。

## 环境与命令

项目使用 `pnpm`。

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
```

- 开发服务端口由 `vite.config.ts` 配置为 `5173`。
- 构建产物位于 `dist/`。

## 目录

```text
src/
├── views/                 # 按业务模块组织的页面
├── components/            # 业务与通用组件
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
- 交互逻辑以前端现有页面为准；路径、字段、类型、枚举、分页和响应结构以后端接口为准。
- 后续按模块建立 `src/service/request/`、`src/service/api/` 和 `src/typings/api/`，请求职责与后台项目保持一致。
- 未对接模块继续使用现有 Mock；已切真实接口的模块不自动 fallback Mock。
- 当前未安装 Axios，首个真实模块实施时再按确认方案补充请求基础设施。

详细规则见：

- [AGENTS.md](./AGENTS.md)
- [当前开发交接](./docs/current-handoff.md)
- [真实接口接入计划](./docs/api-integration-plan.md)
- [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)

## 当前 Swagger 满足度

截至 2026-08-05，已完整扫描全部页面、组件、Store、Mock 能力和最新 Swagger：

- 当前实际调用的 73 项 Mock API 能力中，18 项可直接或通过 API 层适配接入，20 项仅有部分后端能力，35 项在当前 Swagger 中缺失。
- 可直接/适配接入口径约为 `25%`；计入部分覆盖后约为 `53%`。该比例只表示接口能力匹配，不代表页面已完成真实接口对接。
- 主要缺口为地址、公开商品分页筛选、完整订单与卖家物流字段、KYC、理财、评价、IM/通知、CMS、AI 和完整售后。
- 逐模块路径、字段差异及后端补充项见 [Swagger 真实接口匹配矩阵](./docs/api-swagger-match-matrix.md)。

## 开发边界

- 保留现有页面流程、筛选、分页、弹窗、路由 query、空态和权限跳转。
- 优先在请求/API adapter 边界处理后端字段差异。
- 不做无关重构、不升级依赖、不批量修改历史 Mock 或 ID 类型。
- 默认不运行开发、类型检查或构建命令，除非任务明确要求。
