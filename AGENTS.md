# AGENTS.md 核心开发规范

## Summary

项目是油宝 C 端 PC，基于 `Vue 3 + Vite + TypeScript + Arco Design Vue + Pinia + Vue Router + Tailwind CSS`。后续接口对接沿用后台项目的处理原则：前端现有交互和业务行为优先，接口路径、字段、类型、枚举、分页及响应结构以后端 Swagger 为准。

## 跨设备恢复

- 新电脑或新 Codex 会话开始时，先阅读接入计划与 Swagger 矩阵，再结合代码、远端分支、实时 Swagger 和测试环境核对状态。
- 每批开发和回归完成后统一更新交接文档，避免换设备后重复已完成工作或遗漏外部阻塞。

## Core Rules

### 代码风格

- 项目统一使用 2 空格缩进。
- 新增和修改代码保持当前文件风格，不做无关格式化或重构。
- Vue 文件继续使用 `<script setup lang="ts">`，顺序保持 `script` → `template` → `style scoped`。
- 保留现有 Arco Design、Tailwind 和局部 scoped CSS 的使用方式，不批量替换 UI 或样式体系。

### 页面与组件

- 页面放 `src/views/<module>/`；通用布局放 `src/layouts/`；路由统一维护在 `src/router/`。
- 页面负责加载、分页、筛选和交互编排；可复用 UI 放 `src/components/<module>/` 或 `src/components/common/`。
- Pinia 状态放 `src/stores/`；可复用组合逻辑放 `src/composables/`；通用工具放 `src/utils/`。
- 不改变当前按钮、弹窗、筛选、分页、路由 query、空态和操作顺序，除非用户明确要求。

### 请求封装与接口对接

- 当前 `@shared` 指向本项目 `src/mock/`，是本地 Mock 入口，不是网络请求库。
- 当前 Mock 由页面或 Store 直接调用 `src/mock/api/*.ts` 的异步函数，并通过 `Promise + setTimeout` 模拟延迟；不经过 Axios、`fetch`、Vite 代理或浏览器 Mock adapter。
- 未正式对接的模块继续保持现有 `@shared` Mock 函数、入参、返回结构和页面行为，不为统一格式批量改造。
- 模块正式对接时，新建并复用 `src/service/request/` 与 `src/service/api/<module>.ts`；页面和 Store 只调用 API 文件，不直接调用底层 request。
- 真实请求层的职责与后台项目保持一致：集中处理 baseURL、`X-Access-Token`、成功码、业务错误、登录失效、响应解包和错误提示；不做真实接口失败后自动回退 Mock。
- PC/H5 与后台共用 Swagger，但只接入 C 端页面实际需要的接口；不得因 Swagger 存在而扩展前端交互。
- 当前项目没有 Axios 依赖。首个真实模块实施时再按确认方案引入或复用请求基础设施，不因文档调整提前增加依赖。
- 真实接口字段与现有页面字段不一致时，优先在 API/adapter 边界转换；页面交互不变，字段和类型以后端返回为准。

### 类型与 ID

- 当前 Mock 类型保留在 `src/mock/typings/api/`，不为文档统一迁移。
- 新增真实接口类型统一放 `src/typings/api/<module>.d.ts`，使用 `declare namespace Api.<Module>`；若目录尚不存在，随首个正式对接模块创建。
- 查询参数使用 `XxxQuery`，写操作参数使用 `XxxParams` / `XxxSaveParams`。
- 所有业务 ID 默认视为可能的 Long。真实响应、行键、选择状态、关联比较和写操作必须保留原始值，不随意使用 `Number()`、`parseInt()` 或算术转换。
- 已存在的 Mock `number` ID 只作为后续模块对接治理项；未进入正式对接范围时不批量修改。

### Mock 与共享代码边界

- `src/mock/` 是项目内置副本；虽与 H5 当前内容一致，但两个仓库没有运行时共享依赖。
- 不直接从页面新增对 `src/mock/mock/data/*` 的依赖；正式接口对接应经 `src/service/api/` 进入。
- 不把当前函数型 Mock 误判为可由 Axios adapter 自动拦截。若未来需要网络型 Mock，应单独确认方案，并保持真实请求实例隔离。
- 不为了 PC/H5 去重而跨项目搬迁或建立工作区共享包，除非用户明确要求。

### 路由与状态

- 路由继续使用当前 `vue-router` 方案，页面权限沿用 `requiresAuth`、`requiresBuyer` 等 meta 语义。
- 登录真实化时优先替换 Store 的数据来源，不重新设计登录跳转、重定向和买手身份切换。
- 路由静态顺序存在参数路由吞路径风险，新增路由时保持具体路径在动态参数路径之前。

### 文档与状态口径

- 接口计划和核对记录统一放 `docs/`，说明使用中文，技术标识保持原样。
- 共用 Swagger 入口以 `docs/api-integration-plan.md` 记录为准，地址变化只维护文档，不凭记忆修改代码。
- “Swagger 接口存在”“API 已封装”“页面已调用”“真实接口已验证”必须分开描述。
- 文档中的待对接项和治理标记不自动授权修改页面、Mock、类型或接口映射。

### Git 与开发检查

- 使用项目现有 `pnpm` 和脚本，不切换包管理器，不升级依赖。
- 用户明确要求提交时，先检查变更，只提交本次任务文件；commit message 使用简洁中文规范格式。
- 默认不运行 `pnpm dev`、`pnpm typecheck` 或 `pnpm build`。用户明确要求验证时才执行。
- 如果应用已经运行，优先查看现有终端或控制台，不重复启动。
- 完成后说明修改范围、运行情况、相关报错和待确认问题。

## Assumptions

- 后续真实接口接入继续沿用现有 Vue/Vite/Arco 架构，不重构底层框架。
- 后台项目只作为接口治理、请求边界和文档习惯参考，不形成代码级依赖。
