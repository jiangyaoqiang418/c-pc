# 真实接口接入计划

> 本文用于统一油宝 C 端 PC 的接口对接方式。说明使用中文，接口路径、字段名、代码名和 `mock` 等技术标识保持原样。

## 2026-07-28 完整接口满足度扫描

### 扫描范围

- 已读取 `src/views/` 下 45 个页面、`src/components/` 下 61 个组件、4 个 Store。
- 已读取页面实际调用的 16 个 `src/mock/api/*.ts` 模块、相关 `src/mock/typings/api/*.d.ts` 和直接读取的 Mock 数据。
- PC 当前实际调用 73 项 Mock API 能力；静态注册页和本地购物车作为额外交互单独核对，不计入 73 项函数统计。
- 本次不是根据 Mock 文件名匹配，而是按页面表单、筛选、分页、详情字段、状态操作和写操作逐项核对。

### Swagger 实时快照

| 分组 | 文档地址 | 路径数 | 操作数 | 结论 |
|---|---|---:|---:|---|
| `admin` | `/admin/v3/api-docs` | 83 | 84 | 可读取 |
| `user` | `/user/v3/api-docs` | 19 | 19 | 可读取 |
| `order` | `/order/v3/api-docs` | 40 | 42 | 可读取 |
| `notify` | `/notify/v3/api-docs` | - | - | HTTP 404 |

三个有效文档版本均为 `v1.0.0`。详细路径和字段匹配见 `api-swagger-match-matrix.md`。

### 满足度结论

| 等级 | 数量 | 占 73 项 | 判定 |
|---|---:|---:|---|
| A 直接满足 | 4 | 5% | 路径、核心操作和主要数据可直接接入，仅需通用响应解包 |
| B 适配满足 | 14 | 19% | 通过字段映射、组合调用或本地派生可保持现有交互 |
| C 部分满足 | 20 | 27% | 有相关接口，但缺少现有页面需要的字段、状态或操作 |
| D 当前缺失 | 35 | 48% | 当前三组 Swagger 无匹配接口 |

- A+B 为 18/73，严格可接入满足度约 `25%`。
- A+B+C 为 38/73，计入部分能力后的覆盖度约 `52%`。
- 以上仅是接口契约满足度；当前 PC 仍全部使用 Mock，不能描述为页面已对接。

### 建议推进顺序

后台管理端第一、二梯队已基本完成，主要表示 admin 基础管理、分类、系统配置、消息模板、积分/VIP 配置等能力可作为 C 端可消费数据源；不等同于 C 端交易链路、地址、订单、物流、售后等能力已经完整。PC 端仍需按用户侧真实交互逐模块接入。

1. 先接请求层、注册/登录/当前用户、分类树、积分账户、VIP 权益和钱包总览，建立 PC 请求层、token 和基础展示闭环。
2. 再接商品详情、买手商品、求购创建/取消/抢单等已有部分 Swagger 能力的核心业务模块。
3. 地址、购物车结算、下单、订单详情、支付、确认收货等交易链路必须先确认地址、金额拆分、物流、订单状态和售后字段缺口，再实施页面适配。
4. 钱包流水、充值、提现、积分流水可穿插推进，但金额精度、链信息、支付密码和 KYC 前置规则需按真实接口确认。
5. KYC、理财、评价、IM/通知、CMS、AI 和完整售后等待后端按专题补齐，不用 Mock fallback 掩盖缺口。

## 当前基线（2026-07-28）

| 项目 | 当前状态 |
|---|---|
| Swagger | 与后台系统共用 `http://221.128.249.198:8902/doc.html` |
| 页面数据入口 | 页面/Store 调用 `@shared` |
| `@shared` 实际指向 | 本项目 `src/mock/` |
| Mock 机制 | 直接调用 TypeScript 异步函数，读取/修改内存数据，通过 `setTimeout` 模拟延迟 |
| Axios / fetch | 当前业务源码均未使用，`package.json` 未声明 Axios |
| 真实请求封装 | 尚未建立 |
| API 代理与环境变量 | 尚未建立 |
| PC/H5 Mock 关系 | 两边 101 个文件当前完全一致，但为各自项目内的独立副本 |

当前调用链：

```text
view / store
  -> @shared
  -> src/mock/api/<module>.ts
  -> src/mock/mock/data/* + Promise delay
```

该链路没有 HTTP 请求，不能直接复用后台项目仅作用于 Axios 实例的 browser Mock adapter。

## 2026-07-29 P0/P1 接入进度

### 已完成

- P0 联调地基：已新增 `src/service/request/`，使用原生 `fetch` 建立真实请求实例；统一处理 baseURL、`X-Access-Token`、成功码 `1`、业务错误、登录失效和响应 `data` 解包。
- P0 环境与代理：已新增 `.env.development` 中的真实服务 baseURL/target 配置，并在 `vite.config.ts` 增加 `/api/admin`、`/api/user`、`/api/order`、`/api/notify` 的 Vite dev proxy。
- P1 账号：登录页邮箱密码登录已调用 `POST /user/auth/login`，登录后调用 `GET /user/auth/me` 初始化当前用户；注册页已调用 `POST /user/auth/register`。演示账号一键登录继续保留 Mock。
- P1 当前用户：用户 Store 登录态初始化优先使用真实 token 调用当前用户接口；登出和演示账号登录会清理真实 token。
- P1 分类树：公共分类展示入口已调用 `GET /order/categories/tree`，包括顶部分类导航、菜单分类、侧边分类和分类页分类树；商品列表真实化仍属于 P2，当前不描述为商品列表已对接。
- P1 积分/VIP：积分页和 VIP 页已封装并调用 `GET /user/points/account`、`POST /user/points/ledger/page`、`POST /user/points/appeals/submit`、`GET /admin/point-rules/list`、`GET /admin/vip-configs/get`。
- P1 钱包总览：钱包 Store、钱包首页资产卡和个人中心资产卡已调用 `GET /user/wallet/overview`；钱包流水、充值、提现仍属于 P4。
- Long ID 边界：真实接口返回的 `userId`、分类 `id/parentId`、积分流水 `id/userId` 在 adapter 边界原值透传；现有 Mock 类型仍有 `number` 历史约束，后续模块正式对接时继续治理。

### 待验证 / 待确认

- 本轮未按用户指令执行 `pnpm dev`、`pnpm typecheck`、`pnpm build` 或浏览器回归；当前状态不能描述为“真实接口已验证”。
- `admin` 分组的积分规则和 VIP 全量配置已被 P1 页面调用，但是否允许普通 C 端 token 访问仍需真实环境确认；若后端不开放，应补 C 端公开配置接口。
- 分类树已接真实数据，但商品列表仍是 Mock；真实分类 ID 与 Mock 商品分类 ID 不保证一致，公开商品分页应在 P2 单独接入。
- 钱包首页的最近交易仍走 Mock 流水；真实钱包流水筛选和详情在 P4 处理。
- 买手商品创建和发起求购表单仍使用 Mock 分类树，避免 P1 提前把真实 Long 分类 ID 写入 P2 Mock 写操作。

## 2026-07-29 P2-A 接入进度

### 已完成

- P2 商品 API：已新增 `src/service/api/product.ts` 和 `src/typings/api/product.d.ts`，封装 `GET /order/storefront/product/detail`、`GET /order/products/detail`、`POST /order/products/my/page`、`POST /order/products/create`、`PUT /order/products/shelf`、`POST /order/files/upload`。
- P2 求购 API：已新增 `src/service/api/purchase.ts` 和 `src/typings/api/purchase.d.ts`，封装 `POST /order/demands/create`、`POST /order/demands/cancel`、`POST /order/demands/grab`、`POST /order/demands/hall/page`、`POST /order/demands/my/page`、`GET /order/demands/detail`。
- 商品详情：`views/product/detail.vue` 已调用真实公开详情；评价、同店推荐、购物车和立即购买仍保持空态或提示，避免提前混入 P3/P5 未完成链路。
- 买手商品：`views/buyer/products.vue` 已调用真实我的商品分页和上下架；删除商品因 Swagger 暂无接口，页面改为明确提示。
- 买手创建商品：`views/buyer/product-create.vue` 与 `components/buyer/buyer-product-form.vue` 已调用真实创建商品和 P1 分类树；创建后使用买手商品详情接口回读，避免审核中商品走公开详情查不到。
- 求购创建/大厅/我的/详情：`views/purchase/create.vue`、`views/purchase/hall.vue`、`views/purchase/my-list.vue`、`views/purchase/detail.vue` 已调用真实创建、分页、详情、取消和抢单接口。
- 文件上传：请求层已支持 `FormData`，并已封装 `/order/files/upload?dir=product`；当前通用上传组件仍返回 URL，商品创建以 `filePath=url` 做兼容。
- Long ID 边界：P2 页面路由参数和分类 query 不再使用 `Number()` 强转；受历史 Mock 类型限制，adapter 内对 `ProductRecord/PurchaseRequest` 的 `id` 仅做类型兼容，不做数值转换。

### 暂缓 / 缺口

- 公开商品分页搜索、指定卖家店铺商品、商品评价和评分摘要当前 Swagger 不满足，商品列表页、首页商品聚合、同店推荐和评价页仍不在本轮真实接入范围。
- 商品图片上传交互还未完全治理为后端 `bucket/filePath` 结构；后续应将通用上传组件或业务表单改为保存真实上传结果。
- 求购大厅的预算区间、期望天数筛选当前为前端侧二次过滤；Swagger 分页参数仅支持 `pageNo/pageSize/categoryId/keyword`。
- 求购详情的推送日志、推送批次、手动推下一批、客户/买手名称、审核信息和取消原因仍缺接口或字段；手动推送按钮当前只提示“真实接口暂不支持”。
- 商品详情的加入购物车、立即购买属于 P3 交易链路；当前不把真实商品 ID 写入 Mock 购物车。

### 待验证 / 待确认

- 本轮未按用户指令执行 `pnpm dev`、`pnpm typecheck`、`pnpm build` 或浏览器回归；当前状态不能描述为“真实接口已验证”。
- 买手商品、求购创建和抢单都依赖真实登录态、角色和 KYC；需要用户提供真实账号或明确回归指令后再验证权限闭环。
- 后端商品状态 `REJECTED/OFF_SHELF` 与前端历史枚举不完全一致，目前在 adapter 做保守映射，后续应补前端状态枚举或后端状态说明。

## 对齐边界

- 交互以前端现有页面为准，不因 Swagger 调整页面流程或增加未经确认的能力。
- 接口 URL、方法、参数、字段、类型、枚举、分页和响应结构以后端 Swagger/实际返回为准。
- 字段差异优先在 `src/service/api/` 或 adapter 边界转换，尽量不改页面。
- 未迁移模块继续使用现有 `@shared` Mock，不批量统一函数名、入参、返回结构或 ID 类型。
- 已迁移模块显式调用真实 API，不做失败后自动 fallback Mock。
- 后台项目提供治理流程参考；PC 不直接依赖后台源码。

## 目标请求结构

正式接入首个模块时按需建立：

```text
src/service/
├── request/
│   ├── index.ts           # 请求实例与统一拦截处理
│   └── type.ts
└── api/
    └── <module>.ts        # 模块接口函数与响应适配

src/typings/api/
└── <module>.d.ts          # 真实接口类型
```

目标调用链：

```text
view / store
  -> src/service/api/<module>.ts
  -> src/service/request/
  -> Swagger 对应真实服务
```

请求层职责与后台项目保持一致：

- 集中维护 baseURL 和真实服务实例。
- 登录后使用 `X-Access-Token`；具体登录接口和无需 token 的白名单按 Swagger 确认。
- 按真实服务成功码判断业务成功，统一响应解包和错误提示。
- 统一处理登录失效，不在页面重复写 token 和业务码逻辑。
- 仅创建页面实际使用的请求实例，不提前封装未使用服务。
- 当前未安装 Axios；首个真实模块实施时再按确认方案引入请求基础设施，不因文档变更提前增加依赖。

## 固定对接流程

1. 阅读页面、组件、Store 和当前 Mock API，列出现有列表、详情、保存、状态变更、分页及错误交互。
2. 在共用 Swagger 中按业务语义匹配接口，不把 Mock 函数名或数据字段当作后端契约。
3. 标记状态：Swagger 接口存在、API 已封装、页面已调用、真实接口已验证。
4. 确定最小改法：只改 API/类型，或因字段缺失轻改页面；交互冲突先等待确认。
5. 只迁移本次模块；其他页面继续使用 `@shared` Mock。
6. 本次明确任务范围全部完成后，再统一更新 `docs/` 记录进度、已完成项、缺口和待确认问题；不在每个小步骤完成后立即补文档。
7. 只有用户明确要求验证/回归/启动/构建时，才检查请求、响应、分页、回显、写操作、错误提示和 token 失效。
8. 需要更新匹配口径时，同步维护本计划和 `api-swagger-match-matrix.md`。

## 状态口径

| 状态 | 判定标准 |
|---|---|
| Swagger 接口存在 | 最新 Swagger 中存在可匹配路径、方法和 schema |
| API 已封装 | `src/service/api` 已使用真实请求并完成必要转换 |
| 页面已调用 | 页面或 Store 已导入并实际调用该 API |
| 真实接口已验证 | 已按任务要求检查请求、响应、回显和错误行为 |

只有“API 已封装 + 页面已调用”才能描述为“页面已对接”；未经运行验证不得描述为“真实接口已验证”。

## 建议模块顺序

| 梯队 | C 端 PC 模块 | 后台/后端配合要求 | 目标 |
|---|---|---|---|
| P0 联调地基 | 请求层、token、Long ID、响应解包、错误提示 | 已建立 `src/service/request/`、真实服务 baseURL 环境变量和 Vite dev proxy；待用户要求时做真实请求验证 | 后续模块能稳定切真实接口 |
| P1 基础资料 | 注册/登录/当前用户、分类树、积分账户、VIP 权益、钱包总览 | API 已封装并有页面/Store 调用；`admin` 配置接口的 C 端访问权限待验证 | 打通 C 端身份、基础展示和可消费配置 |
| P2 商品与求购 | 商品详情、买手商品、求购创建/取消/抢单 | P2-A API 已封装并有页面调用；公开商品分页、评价、同店推荐、推送日志和手动推送仍缺口；未运行验证 | 先跑通“看商品/发求购/买手接单”核心业务 |
| P3 交易闭环 | 地址、购物车结算、下单、支付、买家订单、订单详情、确认收货 | 补齐地址 CRUD、订单地址、金额拆分、物流、售后和状态字段 | 打通 C 端核心交易链路 |
| P4 资金与会员 | 钱包流水、充值、提现、积分流水 | 确认金额精度、链信息、支付密码、KYC 前置和审核状态 | 打通资产、积分、会员展示和操作 |
| P5 复杂专题 | KYC、理财、售后、评价、IM/通知、CMS、AI | 当前 Swagger 覆盖弱，需后端按专题补接口包 | 独立联调，不混入主交易链路 |

实际顺序以用户明确任务和后端可用接口为准。

## 已知风险与待确认

- 当前大量 Mock ID 使用 `number`；真实 Java Long ID 可能超出安全整数范围，正式对接时需逐模块治理。
- 当前页面直接引用部分 `@shared/mock/data/*` 数据。涉及模块正式对接时需识别并移除运行时直读，不能只替换 API 函数。
- 当前路由守卫的登录和买手身份来自本地 Store；真实登录接入时应保持现有跳转与权限语义。
- 当前 Mock 为独立内存副本，刷新/重启会恢复种子数据；不应把写入结果当作后端持久化行为。
- PC/H5 的 Mock 副本目前一致，但没有自动同步机制；本轮不做跨项目共享重构。
- `admin` 中存在 VIP 配置和积分规则读取接口，但当前 Swagger 未声明鉴权方案，也不是 C 端服务分组；在后端确认可供 C 端访问前，仅按“部分满足”记录。
- `order` 的订单状态为 7 类，当前前端为 10 类；订单、卖家采购凭证和物流字段不完整，不能只做枚举映射后宣布对接完成。

## 开发检查

- 默认不运行 `pnpm dev`、`pnpm typecheck` 或 `pnpm build`。
- 用户明确要求验证、回归、启动或构建时，才执行对应命令；优先使用已运行应用的终端和控制台，未启动时再使用项目现有命令。
- 本次明确任务范围全部完成后默认统一更新文档记录进度，不主动做浏览器回归。
- 不处理与当前接口模块无关的历史错误或警告。
