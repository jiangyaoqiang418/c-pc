# 真实接口接入计划

> 本文用于统一油宝 C 端 PC 的接口对接方式。说明使用中文，接口路径、字段名、代码名和 `mock` 等技术标识保持原样。

## 2026-08-01 初始接口满足度扫描

### 扫描范围

- 已读取基线 `src/views/` 下 45 个页面、`src/components/` 下 61 个组件、4 个 Store；本轮新增 2 个买手页面。
- 已读取页面实际调用的 16 个 `src/mock/api/*.ts` 模块、相关 `src/mock/typings/api/*.d.ts` 和直接读取的 Mock 数据。
- PC 当前实际调用 73 项 Mock API 能力；静态注册页和本地购物车作为额外交互单独核对，不计入 73 项函数统计。
- 本次不是根据 Mock 文件名匹配，而是按页面表单、筛选、分页、详情字段、状态操作和写操作逐项核对。

### Swagger 实时快照

| 分组 | 文档地址 | 路径数 | 操作数 | 结论 |
|---|---|---:|---:|---|
| `admin` | `/admin/v3/api-docs` | 84 | 85 | 可读取 |
| `user` | `/user/v3/api-docs` | 19 | 19 | 可读取 |
| `order` | `/order/v3/api-docs` | 40 | 42 | 可读取 |
| `notify` | `/notify/v3/api-docs` | - | - | HTTP 404 |

三个有效文档版本均为 `v1.0.0`。2026-08-01 实时读取与 2026-07-30 相比，`user`、`order` 未新增 C 端接口；`admin` 新增的订单详情接口不替代 C 端 `GET /order/orders/detail`。详细路径和字段匹配见 `api-swagger-match-matrix.md`。

### 满足度结论

| 等级 | 数量 | 占 73 项 | 判定 |
|---|---:|---:|---|
| A 直接满足 | 4 | 5% | 路径、核心操作和主要数据可直接接入，仅需通用响应解包 |
| B 适配满足 | 14 | 19% | 通过字段映射、组合调用或本地派生可保持现有交互 |
| C 部分满足 | 21 | 29% | 有相关接口，但缺少现有页面需要的字段、状态或操作；KYC 当前仅满足状态读取 |
| D 当前缺失 | 34 | 47% | 当前三组 Swagger 无匹配接口 |

- A+B 为 18/73，严格可接入满足度约 `25%`。
- A+B+C 为 39/73，计入部分能力后的覆盖度约 `53%`。
- 以上为 2026-08-01 的初始接口契约基线；后续页面接入和真实回归进度以文档末尾最新批次记录为准。

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
- P1 钱包总览：钱包 Store、钱包首页资产卡和个人中心资产卡已调用 `GET /user/wallet/overview`；钱包首页今日收支已复用总览返回，最近交易和资金流水属于 P4 真实接口。
- Long ID 边界：真实接口返回的 `userId`、分类 `id/parentId`、积分流水 `id/userId` 在 adapter 边界原值透传；现有 Mock 类型仍有 `number` 历史约束，后续模块正式对接时继续治理。

### 待验证 / 待确认

- 已使用真实账号 `jiangyaoqiang418@gmail.com` 完成登录、当前用户、积分账户、积分流水、钱包总览、分类树、个人中心、积分页、VIP 页和钱包页回归；未执行 `pnpm typecheck` 或 `pnpm build`。
- `admin` 分组的积分规则和 VIP 全量配置已确认普通 C 端 token 访问返回 `-200`；前端已改为不触发登录失效并降级展示，后端仍应补 C 端公开配置接口。
- 分类树已接真实数据，但商品列表仍是 Mock；真实分类 ID 与 Mock 商品分类 ID 不保证一致，公开商品分页应在 P2 单独接入。
- 钱包首页的最近交易已调用真实钱包流水；资金流水复杂筛选和详情继续在 P4 处理。
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
- 联调修复：后端求购状态 `OPEN` 已映射为前端“推送中”；`buyerId` 不再误当作接单买手，仅 `takenBy` 用于接单展示；我的求购页会等待用户 Store 初始化后加载。

### 暂缓 / 缺口

- 公开商品分页搜索、指定卖家店铺商品、商品评价和评分摘要当前 Swagger 不满足，商品列表页、首页商品聚合、同店推荐和评价页仍不在本轮真实接入范围。
- 商品图片上传交互还未完全治理为后端 `bucket/filePath` 结构；后续应将通用上传组件或业务表单改为保存真实上传结果。
- 求购大厅的预算区间、期望天数筛选当前为前端侧二次过滤；Swagger 分页参数仅支持 `pageNo/pageSize/categoryId/keyword`。
- 求购详情的推送日志、推送批次、手动推下一批、客户/买手名称、审核信息和取消原因仍缺接口或字段；手动推送按钮当前只提示“真实接口暂不支持”。
- 商品详情的加入购物车、立即购买属于 P3 交易链路；当前不把真实商品 ID 写入 Mock 购物车。

### 待验证 / 待确认

- 已使用真实账号完成求购创建、我的求购分页和求购详情接口验证；测试求购 ID 为 `2082306670605197313`，页面已正确展示标题、金额 `U199.00`、状态和撤销入口。
- 求购大厅接口在普通顾客账号下返回“请先申请成为买手”，页面已降级为空态并避免未捕获错误；买手抢单、买手商品创建/上下架仍需买手账号 + KYC 通过后验证。
- 后端商品状态 `REJECTED/OFF_SHELF` 与前端历史枚举不完全一致，目前在 adapter 做保守映射，后续应补前端状态枚举或后端状态说明。

## 2026-07-29 真实联调结果

| 梯队 | 模块 | 接口/页面 | 接口结果 | 页面展示结果 | 控制台 | 结论 |
|---|---|---|---|---|---|---|
| P0 | 登录请求层 | `POST /user/auth/login` | 成功，返回 token、`userId=2082303088212398081`、昵称 `john` | 首页显示 `john / VIP0 / 0积分` | 无错误 | 通过 |
| P1 | 当前用户 | `GET /user/auth/me` | 成功，返回邮箱、昵称、角色 `CUSTOMER`、KYC `UNSUBMITTED` | 个人中心显示 john、邮箱、KYC 未提交 | 无错误 | 通过 |
| P1 | 积分账户/VIP 当前状态 | `GET /user/points/account` | 成功，points=0、顾客 VIP0 | 首页、个人中心、积分页、VIP 页展示一致 | 无错误 | 通过 |
| P1 | 钱包总览 | `GET /user/wallet/overview` | 成功，total=0、资产分布均为 0 | 钱包页显示 `U 0.00`、资产分布、暂无交易 | 无错误 | 通过 |
| P1 | 分类树 | `GET /order/categories/tree` | 成功，返回真实分类树 | 首页分类展示“原始类”等真实分类 | 无错误 | 通过 |
| P1 | 积分流水 | `POST /user/points/ledger/page` | 成功，total=0 | 积分页显示“暂无积分流水” | 无错误 | 通过 |
| P1 | 积分规则 | `GET /admin/point-rules/list` | C 端 token 返回 `-200` | 前端降级为空规则，不清登录态 | 无错误 | 降级通过，待后端补公开接口 |
| P1 | VIP 全量配置 | `GET /admin/vip-configs/get` | C 端 token 返回 `-200` | 前端降级展示当前等级，不清登录态 | 无错误 | 降级通过，待后端补公开接口 |
| P2-A | 发起求购 | `POST /order/demands/create` | 成功，生成 `2082306670605197313` | 后端已写入测试求购 | 无错误 | 通过 |
| P2-A | 我的求购 | `POST /order/demands/my/page` | 成功，total=1 | 页面显示测试求购、`U199.00`、撤销入口 | 无错误 | 通过 |
| P2-A | 求购详情 | `GET /order/demands/detail?id=2082306670605197313` | 成功，返回状态 `OPEN` | 页面状态映射为“推送中” | 无错误 | 通过 |
| P2-A | 求购大厅 | `POST /order/demands/hall/page` | 普通账号返回“请先申请成为买手” | 页面展示空态/无权限提示，不抛未捕获错误 | 无错误 | 普通账号权限符合预期 |
| P2-A | 商品公开榜单 | `POST /order/storefront/best-sellers/page`、`new-arrivals/page` | 成功，total=0 | 测试环境暂无真实商品数据 | 无错误 | 接口可用，待商品数据 |
| P2-A | 商品详情 | `GET /order/storefront/product/detail?id=` | 未测到真实详情数据 | 缺可用真实商品 ID | - | 待后端提供商品数据 |
| P2-A | 买手商品/创建/上下架 | `/order/products/*` | 未测 | 当前账号为 `CUSTOMER`，非买手 | - | 需要买手账号 + KYC 通过 |

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
| P1 基础资料 | 注册/登录/当前用户、分类树、积分账户、VIP 权益、钱包总览 | 真实账号已验证登录、当前用户、积分、钱包、分类；admin 配置接口已确认 C 端 token 无权限，前端降级展示 | 打通 C 端身份、基础展示和可消费配置 |
| P2 商品与求购 | 商品详情、买手商品、求购创建/取消/抢单 | 求购创建/我的求购/详情已真实验证；公开商品测试环境暂无数据；买手能力待买手账号验证 | 先跑通“看商品/发求购/买手接单”核心业务 |
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

## 2026-07-29 P2-B/P3/P4 补充推进

### 已完成

- 退出登录入口：默认布局顶部购物车右侧已挂载用户头像下拉，提供“个人中心 / 退出登录”；退出后清理真实 token 和本地用户态。
- 文件上传组件：`components/aftersale/aftersale-evidence-uploader.vue` 已从占位图生成改为真实文件选择和 `POST /order/files/upload?dir=` 上传；求购图片使用 `dir=demand`，买手商品图片使用 `dir=product`。
- 商品收藏与浏览：商品详情页进入后调用 `/order/storefront/browse` 和 `/order/products/view` 做浏览打点；“收藏”按钮调用 `/order/products/favorite`；新增 `/favorites` 我的收藏页，调用 `/order/products/favorites/page`。
- 钱包流水：资金流水页已从 `@shared` Mock 切到 `POST /user/wallet/ledger/page`，在 adapter 中映射 `bizType/bizGroup/fromType/toType` 到现有 17 类流水和资产桶；当前后端不支持的日期、桶、多类型筛选继续在前端侧过滤。
- 买家订单只读与基础操作：订单列表/详情已从 `@shared` Mock 切到 `POST /order/orders/bought/page`、`GET /order/orders/detail`；支付、取消、确认收货分别调用 `/order/orders/pay`、`/order/orders/cancel`、`/order/orders/confirm`。
- 时间戳适配：`purchase/product/wallet/order` adapter 已兼容后端毫秒时间戳数字和数字字符串，避免页面出现 `Invalid Date`。

### 待确认 / 缺口

- 上传接口已命中真实服务，但测试环境返回“对象存储(MinIO)未配置，无法上传”，需后端配置 MinIO 后再做完整 UI 上传回归。
- Chrome 扩展当前未开启本地文件 URL 访问，UI 文件选择器可触发，但自动化无法把本地测试图片塞入浏览器；已用真实 token 直接验证上传接口返回。
- 当前真实收藏、钱包流水、买家订单测试账号均为 `total=0`，页面以空态通过；收藏状态切换需要真实商品数据后再验证收藏后列表回显。
- 订单详情缺收货地址、收件人、物流、售后和完整时间线字段，当前按 Swagger 可得字段做只读适配，缺失字段展示默认值。

### 本轮验证

| 模块 | 接口结果 | 页面结果 | 控制台 | 结论 |
|---|---|---|---|---|
| 退出入口 | 本地状态操作 | 顶部头像下拉显示“个人中心 / 退出登录” | 无错误 | 通过 |
| 我的收藏 | `/order/products/favorites/page` 返回 `code=1,total=0` | `/favorites` 展示“暂无收藏商品” | 无错误 | 通过，待商品数据验证回显 |
| 钱包流水 | `/user/wallet/ledger/page` 返回 `code=1,total=0` | `/wallet/history` 展示“暂无符合条件的流水” | 无错误 | 通过 |
| 买家订单 | `/order/orders/bought/page` 返回 `code=1,total=0` | `/order` 展示订单 Tab 和空态 | 无错误 | 通过 |
| 我的求购 | `/order/demands/my/page` 返回 `code=1,total=1` | `/purchase` 展示测试求购和撤销入口 | 无错误 | 通过 |
| 求购详情 | `/order/demands/detail?id=2082306670605197313` 成功 | `/purchase/2082306670605197313` 展示标题、`U 199.00`、推送中、创建时间正常 | 无错误 | 通过 |
| 文件上传 | `/order/files/upload?dir=demand` 返回 `code=-1`，MinIO 未配置 | 上传按钮可触发文件选择；接口错误会提示上传失败 | 无错误 | 阻塞于后端对象存储配置 |

## 2026-07-30 资料、买手申请与资金操作推进

### 已完成

- 个人资料：新增 `PUT /user/auth/profile`，个人中心提供昵称、手机号、头像 URL 编辑弹窗；保存后重新读取 `/user/auth/me` 刷新 Store。
- 买手申请：新增独立路由 `/buyer/apply`，调用 `GET /user/buyer/application` 读取申请状态，调用 `POST /user/buyer/apply` 提交真实姓名、联系方式和申请说明；个人中心“成为买手”入口已切换到该页。
- 链上充值：充值页从 `@shared` Mock 改为 `POST /user/recharge/create`、`GET /user/recharge/detail`、`POST /user/recharge/page`；收款地址与 Memo 仅展示后端订单详情返回值。
- 钱包转出：转出页从 `withdrawMock` 改为 `POST /user/withdraw/create`、`GET /user/withdraw/detail`、`POST /user/withdraw/page`；移除 Swagger 未声明的支付密码、固定手续费和模拟扣款逻辑。

### 本轮验证

| 模块 | 真实读取/页面结果 | 控制台 | 写操作验证 | 结论 |
|---|---|---|---|---|
| 个人资料 | `/profile` 展示真实账号 `john`，编辑弹窗回显当前昵称 | 无错误 | 未提交，避免修改测试账号资料 | 读取与表单通过 |
| 买手申请 | `/buyer/apply` 正常展示申请表单和状态读取结果 | 无错误 | 未提交，避免创建真实申请记录 | 读取与表单通过 |
| 链上充值 | `/wallet/deposit` 显示创建订单表单与空充值记录 | 无错误 | 未创建，避免产生真实充值订单 | 读取与空态通过 |
| 钱包转出 | `/wallet/withdraw` 显示真实可用余额 `U 0.00`、空记录和 KYC 提示 | 无错误 | 余额不足，提交按钮按规则禁用 | 读取与拦截通过 |

> 已执行 `pnpm typecheck` 并通过。本轮未执行资料修改、买手申请、充值创建和提现创建等有外部写入影响的操作；这些成功路径需要可用测试资金、可撤销测试申请或用户明确授权后再回归。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 45% |
| 已页面接入进度 | 约 40% |
| 真实回归通过进度 | 约 30% |
| C 端 PC 整体交付进度 | 约 36% |

## 2026-07-30 钱包首页与订单概况真实数据接入

### 已完成

- 钱包首页：`/wallet` 的“今日入/今日出”改为复用 `GET /user/wallet/overview` 返回的 `todayIn/todayOut`；“最近交易”改为调用 `POST /user/wallet/ledger/page`，不再读取 `@shared/mock/data/wallet-txns`。
- 钱包 Store：保存并在清理时重置真实总览的当日收支，避免页面重新进入时残留旧会话数据。
- 个人中心：`/profile` 的订单概况改为 `POST /order/orders/bought/page` 按后端七种状态读取 `total` 后汇总，不再使用 Mock 统计。
- 订单统计：同一后端状态仅请求一次；`PAID/SHIPPED/COMPLETED` 对应的前端别名不再重复累加，避免订单数虚高。

### 本轮验证

| 模块 | 真实接口结果 | 页面结果 | 控制台 | 结论 |
|---|---|---|---|---|
| 钱包首页 | 钱包总览、流水请求成功；当前账号资产/今日入出均为 `0`，流水 `total=0` | 正确显示 `U 0.00`、今日入/出 `0.00` 和“暂无交易”空态 | 无 warning/error | 真实读取与空态通过 |
| 个人中心订单概况 | 七个订单状态分页请求成功；当前账号各状态 `total=0` | 待付款、待发货、待收货、已完成、售后中均展示 `0` | 无 warning/error | 真实统计与空态通过 |

> 已执行 `pnpm typecheck` 并通过。当前测试账号没有资金流水和订单，非零金额、流水行及订单状态统计的页面回显需后端准备测试数据后补充回归。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 45% |
| 已页面接入进度 | 约 42% |
| 真实回归通过进度 | 约 32% |
| C 端 PC 整体交付进度 | 约 38% |

## 2026-07-30 求购创建与撤销闭环回归

- 修复：求购详情 adapter 未填充当前用户 `customerId`，导致本人求购不显示“撤销求购”按钮；详情页现在以当前登录用户补充该字段，不改变后端 Long ID。
- 测试记录：使用真实账号创建回归测试求购 `2082649312807444481`，标题为“[回归测试] 求购撤销闭环商品”；详情页成功展示分类、预算、说明和 `OPEN -> 推送中` 状态。
- 撤销结果：通过详情页调用 `POST /order/demands/cancel` 成功，详情重新加载后状态为 `CANCELED -> 已取消`，控制台无错误。
- 联调阻塞：同一账号调用 `POST /order/demands/my/page` 未返回这条已创建/已取消记录，`/purchase` 只能展示空态；详情接口可正常读取该 ID。需后端核对“我的求购”查询的用户归属、状态过滤与测试环境数据可见性。

## 2026-07-30 首页真实内容聚合

### 已完成

- 首页 `Banner`、为你推荐、热销榜、新品直邮、限时秒杀已分别调用 `GET /order/banners/list`、`GET /order/storefront/recommend`、`POST /order/storefront/best-sellers/page`、`POST /order/storefront/new-arrivals/page`、`GET /order/storefront/flash-sale`。
- 真实商品和秒杀商品均在 API adapter 层映射为既有 `ProductCard` 数据结构；业务 Long ID 保留原始值，不写入 Mock。
- 每个首页区块独立加载，单个接口失败不会阻断其他区块；未获得 Banner 或商品数据时展示空态，不回退首页 Mock。
- 移除无真实数据源的买手榜；各“查看更多”入口不再跳入 Mock 商品列表，明确提示公开商品分页待接口支持。

### 本轮验证

| 模块 | Chrome 页面结果 | 控制台 | 结论 |
|---|---|---|---|
| 首页真实内容聚合 | 当前环境未返回 Banner、推荐、热销、新品或秒杀商品；页面显示“暂无首页活动”，不展示旧 Mock 商品 | 无 warning/error | 真实读取与空态通过 |

> 已执行 `pnpm typecheck` 并通过。需要后端准备至少一条已启用 Banner、一条在售商品和一条有效秒杀场次，才能验证图片、商品卡、倒计时和 Banner 跳转的非空回显。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 50% |
| 已页面接入进度 | 约 46% |
| 真实回归通过进度 | 约 34% |
| C 端 PC 整体交付进度 | 约 40% |

## 2026-07-30 顾客订单统计与买手读取接入

### 已完成

- 右侧个人面板：顾客模式的待付款、待发货、待收货计数改用 `POST /order/orders/bought/page` 按状态派生，与个人中心订单概况保持一致；切换买手模式、切换用户或读取失败时清空旧统计。
- 买手钱包：`/buyer/wallet` 的买手专属流水改为真实 `POST /user/wallet/ledger/page`；押金支付/释放/罚没、订单结算、利息按后端单类型查询后在前端按时间合并并按原始 ID 去重。
- 买手订单：`/buyer/orders` 改用 `POST /order/orders/sold/page` 读取当前买手售出的订单，并保持既有状态筛选和空态。
- 买手订单写操作：采购凭证和物流信息不再调用 Mock 成功逻辑。当前 Swagger 只有文件上传、没有将凭证或物流绑定订单的写接口，页面改为明确提示暂不支持。
- 订单统计兼容：后端分页 `total` 在当前环境可能为字符串，订单 adapter 与右侧个人面板/个人中心均统一转为数值，避免“待发货/待收货”显示为 `00`。

### 本轮验证

| 模块 | Chrome 页面结果 | 控制台 | 结论 |
|---|---|---|---|
| 首页右侧顾客订单统计 | 当前账号待付款、待发货、待收货均为 `0`，与个人中心订单概况一致 | 无 warning/error | 真实统计与空态通过 |
| 个人中心订单概况 | 当前账号待付款、待发货、待收货、已完成、售后中均为单个 `0` | 无 warning/error | 数值展示回归通过 |
| 买手钱包/买手订单 | 当前账号不是买手，未进入真实买手页面回归 | - | 待买手账号、流水和订单数据 |

> 已执行 `pnpm typecheck` 并通过。买手回归需要已通过 KYC 的买手账号，且至少准备一条押金/结算/利息流水和覆盖采购中、运输中、已完成的名下订单；采购凭证与物流提交仍等待后端补绑定订单接口。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 50% |
| 已页面接入进度 | 约 49% |
| 真实回归通过进度 | 约 35% |
| C 端 PC 整体交付进度 | 约 42% |

## 2026-07-30 买手工作台与支付成功页真实读取

### 已完成

- 买手工作台：`/buyer/dashboard` 已移除 `buyerApi` 的买手画像、押金汇总、订单和可接求购 Mock 读取；改为组合调用 `GET /user/wallet/overview`、`POST /order/orders/sold/page`、`POST /order/demands/hall/page`。订单统计按后端状态分页读取并数值化 `total`，进行中订单会合并采购中、待发货和运输中状态。
- 工作台指标：已移除随机销售趋势、好评率、客诉率和平均发货时长等无真实数据契约的指标；仅展示真实可推导的订单状态、可接求购、可用余额和押金担保数据。
- 买手押金操作：Swagger 尚未提供押金充值、转出/划转接口，工作台按钮改为明确提示，不再跳转 Mock 写入流程。
- 支付成功页：`/checkout/success/:id` 的“您可能也喜欢”已改用 `GET /order/storefront/recommend?limit=4`；主订单仍保持 Mock，原因是 P3 真实结算/地址链路尚未闭环。

### 本轮验证

| 模块 | Chrome 页面结果 | 控制台 | 结论 |
|---|---|---|---|
| 支付成功页真实推荐 | `/checkout/success/1` 成功展示订单成功信息和推荐区；当前推荐接口无数据，未回退 Mock 商品卡 | 无 warning/error | 真实读取与空态通过 |
| 买手工作台访问控制 | 当前 `john` 为顾客，访问 `/buyer/dashboard` 后跳转 `/kyc`，KYC 页面正常展示 | 无 warning/error | 路由守卫通过，真实买手数据待测 |

> 已执行 `pnpm typecheck` 并通过。买手工作台的非空回显需要已通过 KYC 的买手账号，且该账号至少具备一条卖出订单、一个可接求购和一条钱包/押金数据；当前顾客账号不能越权验证这些数据。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 52% |
| 已页面接入进度 | 约 51% |
| 真实回归通过进度 | 约 36% |
| C 端 PC 整体交付进度 | 约 43% |

## 2026-08-01 可开发梯队批量接入

### 已完成代码接入

| 梯队 | 能力 | Swagger 接口 | 页面/API 状态 |
|---|---|---|---|
| P0/P1 | 积分申诉记录 | `POST /user/points/appeals/page` | 已新增真实类型与 API，积分页新增“申诉记录”页签、关键词/状态筛选和分页；新接入 ID 保留 Long 原值 |
| P2 | 分类申请 | `POST /order/categories/apply/my/page`、`POST /order/categories/apply/submit` | 已新增 `/buyer/categories/apply`，支持申请列表、筛选、分页和提交 |
| P2 | 秒杀报名 | `GET /order/flash-sale/sessions/available`、`POST /order/flash-sale/enroll`、`DELETE /order/flash-sale/enroll`、`GET /order/flash-sale/my` | 已新增 `/buyer/flash-sales`，支持场次读取、商品报名、我的报名和取消报名 |
| P2 | 商品上传结构 | `POST /order/files/upload`、`POST /order/products/create` | 上传组件保留展示 URL，同时向商品表单传递真实 `bucket/filePath`；创建商品不再把 URL 伪装成 `filePath` |
| P2 | 商品驳回状态 | `POST /order/products/my/page` | 前端商品状态新增 `REJECTED`，商品管理新增“审核驳回”筛选和状态展示 |
| P3 | 卖家订单改价 | `PUT /order/orders/price` | 买手订单新增“待付款”页签和改价弹窗，仅 `PENDING_PAYMENT` 订单显示入口 |
| P4 | 充值/提现详情 | `GET /user/recharge/detail`、`GET /user/withdraw/detail` | 充值、提现记录列表新增详情入口和真实详情抽屉 |

### 验证与剩余边界

- 已使用真实账号完成 Chrome 回归：登录成功，积分“申诉记录”页签、关键词查询和空态正常；充值、提现页面可正常加载并展示空记录状态；控制台和现有 Vite 终端无 warning/error。
- 当前真实账号积分流水、申诉、充值和提现记录均为空，因此未覆盖申诉记录非空展示及充值/提现详情抽屉的真实数据回显，也未创建资金类测试订单。
- 访问 `/buyer/categories/apply` 会按现有权限守卫跳转 `/kyc`；该账号未完成 KYC 且不是买手，分类提交、秒杀报名、商品驳回和订单改价的真实流程未验证。
- 本轮未执行 `typecheck`、`lint`、`test` 或 `build`。
- 买手分类申请、秒杀报名、订单改价需要 KYC 通过的买手账号及对应商品/订单数据验证成功写入与刷新。
- 商品图片上传仍受后端 MinIO 未配置阻塞；前端已按 Swagger 修正提交结构，不增加本地占位或 Mock fallback。
- P5 售后页面现有 5 类工单、证据、列表、取消和时间线，与 Swagger 仅提供的简单退款契约冲突；未在本轮强行替换，等待产品确认交互收敛方案。

## 2026-08-01 列表能力与收藏闭环补齐

### 已完成代码接入

| 梯队 | 能力 | Swagger 接口 | 页面/API 状态 |
|---|---|---|---|
| P2 | 取消商品收藏 | `DELETE /order/products/favorite?id=` | `/favorites` 已增加确认取消入口；成功后重新读取当前页，末页最后一条被移除时自动回退上一页 |
| P2 | 买手商品筛选与分页 | `POST /order/products/my/page` | `/buyer/products` 已支持关键词、分类、状态和后端分页；`ON_SALE/OFF_SHELF` 直接作为后端状态查询，不再在单页结果上二次过滤 |
| P2 | 商品驳回原因 | `POST /order/products/my/page` 返回 `reviewComment` | adapter 映射至现有 `draftAuditOpinion`，驳回商品卡展示审核意见 |
| P3 | 买手订单分页 | `POST /order/orders/sold/page` | `/buyer/orders` 已使用真实 `pageNo/pageSize/total` 分页，切换状态时回到第一页 |
| P4 | 充值记录筛选与分页 | `POST /user/recharge/page` | `/wallet/deposit` 已支持 `PENDING/CONFIRMED/CANCELED` 状态筛选和真实分页 |
| P4 | 转出记录筛选与分页 | `POST /user/withdraw/page` | `/wallet/withdraw` 已支持 `REVIEWING/APPROVED/SUCCESS/REJECTED` 状态筛选和真实分页 |

### 验证与剩余边界

- 已执行 `pnpm typecheck` 与 `git diff --check`，均通过。
- Chrome 已验证收藏页空态、充值状态筛选、转出状态筛选和列表空态；现有 Vite 终端无新增报错。
- 当前账号无收藏、充值和转出记录，未执行取消收藏或资金写操作；非空记录、详情与翻页需准备测试数据后补充回归。
- 当前账号未完成 KYC 且不是买手，访问买手商品/订单页会按现有权限守卫跳转 `/kyc`；买手筛选、驳回原因、订单翻页需使用真实买手账号和对应数据验证。
- 本轮没有强行接入卖家发货、购物车下单和退款接口：其 Swagger 参数仍与现有物流、地址、多商品结算及 5 类售后交互不一致。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 53% |
| 已页面接入进度 | 约 54% |
| 真实回归通过进度 | 约 38% |
| C 端 PC 整体交付进度 | 约 45% |

## 2026-08-05 深度扫描遗漏补齐

### 已完成代码接入

| 梯队 | 能力 | Swagger 接口/字段 | 页面/API 状态 |
|---|---|---|---|
| P2 | 求购状态与字段补齐 | `GET /order/demands/detail` 的 `buyerId/expireAt/takenBy/takenAt/orderId`、状态 `VOID` | adapter 已使用真实买家 ID、接单截止、接单买手和关联订单；`VOID` 映射为“已取消”，详情页不再把当前查看者误当作求购发起人 |
| P2 | 买手可接求购 | `POST /order/demands/hall/page`、`POST /order/demands/grab` | `/buyer/claimable` 已移除可接求购和抢单 Mock，支持真实分页、抢单后刷新和错误提示；因无定向推送列表接口，页面统一使用“可接求购”语义 |
| P4 | 买手押金读取 | `GET /user/wallet/overview`、`POST /user/wallet/ledger/page`、`POST /order/orders/sold/page` | `/buyer/deposit` 已读取真实可担保押金、已担保押金、押金流水和担保中订单统计；充值、转出不再修改 Mock 余额，明确提示等待押金划转接口 |
| P4 | 钱包桶枚举兼容 | `WalletVO.distribution.type` | 新增 `FINANCE_LOCKED/ORDER_FROZEN/RISK_FROZEN` 实际后端枚举映射，避免冻结资产非零时被忽略 |
| P5 | KYC 状态读取 | `GET /user/auth/me` 的 `kycStatus` | `/kyc` 已移除 KYC 状态和提交 Mock；仅展示真实状态，证件、短信、人脸和提交入口在无接口时禁用 |
| P2 | 商品货架状态 | `ProductDTO.status` | 只有 `ON_SALE` 映射为“在售”，审核中、驳回、下架和冻结商品不再错误显示在售 |

### 本轮验证

| 模块 | 接口/页面结果 | 控制台 | 结论 |
|---|---|---|---|
| 登录与 KYC | 真实账号登录成功；`GET /user/auth/me` 返回 `CUSTOMER / UNSUBMITTED`，KYC 页面展示 `john / 未提交`，提交按钮禁用 | 无 warning/error | 真实状态读取和 Mock 提交关闭通过 |
| 求购详情 | `GET /order/demands/detail?id=2082306670605197313` 返回 `VOID`；页面展示“已取消”和 `expireAt` 对应接单截止时间 | 无 warning/error | 状态及字段映射通过 |
| 求购大厅权限 | 当前顾客账号调用 `/demands/hall/page` 返回“请先申请成为买手” | 无未捕获错误 | 权限边界符合预期，买手成功路径待账号 |
| 钱包与押金读取 | `/wallet/overview`、押金 `/wallet/ledger/page` 均成功，当前账号金额和流水为 `0` | 无接口异常 | 读取契约通过，非零展示待数据 |
| 买手页面 | 当前账号访问可接求购、押金和商品管理时进入 KYC 引导 | 无 warning/error | 路由守卫通过，页面非空数据待买手账号 |

- 已执行 `pnpm typecheck`、`git diff --check`，均通过。
- Swagger 源站与测试环境的 `admin 84/85`、`user 19/19`、`order 40/42` 路径、方法和 Schema 差异均为 `0`，本轮没有后台新增可用接口。
- `notify` 出现在 `swagger-config`，但源站和测试环境文档地址均返回 HTTP 404，通知模块继续列为缺失。
- 完整 KYC 提交、押金充值/转出、个性化求购推送、公开商品分页、地址、完整下单/物流/售后仍需后台补接口。

### 最新进度估算

| 口径 | 进度 |
|---|---:|
| 接口契约严格满足度（A+B） | 约 25% |
| 接口契约覆盖度（A+B+C） | 约 53% |
| 已封装接口进度 | 约 53% |
| 已页面接入进度 | 约 58% |
| 真实回归通过进度 | 约 40% |
| C 端 PC 整体交付进度 | 约 47% |

> 完整买手回归仍需 KYC 通过的真实买手账号，并准备至少一条可接求购、一条押金流水、一条非零押金记录以及覆盖审核中、驳回、在售、下架和冻结状态的买手商品。

## 2026-08-05 买手审核后权限对齐与回归

### 契约结论与代码调整

- 当前买手申请 `2083573396550537218` 已审核为 `APPROVED`，`GET /user/auth/me` 返回角色 `CUSTOMER,BUYER`、KYC `UNSUBMITTED`。
- 最新 Swagger 对 `PUT /admin/buyer-applications/review` 的定义为“通过并授予买手身份”，未声明 KYC 联动或 KYC 前置；Swagger 也未提供 KYC 提交、审核或状态变更接口。
- 实际调用求购大厅、我的商品、卖出订单、钱包总览和钱包流水均返回 `code=1`，说明后端已按 `BUYER` 角色放行业务接口。
- 前端买手路由、身份切换和求购接单条件已改为以 `BUYER` 角色为准，不再增加 Swagger 契约外的 `KYC=PASSED` 门槛；KYC 页面与资金提示继续展示真实实名状态。

### Chrome 回归结果

| 模块 | 接口结果 | 页面展示 | 控制台 | 结论 |
|---|---|---|---|---|
| 买手工作台 | 钱包、卖出订单、求购大厅均成功 | 订单、可接求购和余额均展示 `0`，空态正确 | 无 warning/error | 通过 |
| 可接求购 | `/order/demands/hall/page` 返回 `code=1,total=0` | 展示“暂无可接求购” | 无 warning/error | 读取与空态通过，抢单待数据 |
| 押金管理 | 钱包总览、押金流水、卖出订单均成功 | 总额、可用、已担保均为 `U 0.00`，流水空态正确 | 无 warning/error | 读取与空态通过，非零数据待准备 |
| 商品管理 | `/order/products/my/page` 返回 `code=1,total=0` | 状态页签、关键词查询、重置和空态正常 | 无 warning/error | 筛选交互与空态通过 |
| 买手订单 | `/order/orders/sold/page` 返回 `code=1,total=0` | 状态页签和空态正常 | 无 warning/error | 读取与空态通过 |
| 求购大厅 | 买手身份可正常访问 | 不再显示非买手拦截提示，当前列表为空 | 无 warning/error | 权限对齐通过 |

- 已执行 `pnpm typecheck`、`git diff --check`，均通过。
- 当前缺少可接求购、买手商品、卖出订单和押金流水，因此抢单、商品非空状态、订单操作、押金非零展示仍不标记为通过。
- 上一节“需要 KYC 通过的买手账号”已被本节实时契约结论取代：当前只需 `BUYER` 角色即可进入买手模块，涉及实名或资金风控的具体操作仍以后端规则为准。

## 2026-08-05 买手扩展页面回归

| 模块 | 真实接口结果 | Chrome 页面与交互 | 结论 |
|---|---|---|---|
| 分类申请 | `/order/categories/tree` 返回 `code=1`、4 个顶级分类；`/order/categories/apply/my/page` 返回 `code=1,total=0` | 页面正常进入，表格空态、关键词查询、重置、提交弹窗和“请输入新分类名称”校验正常 | 读取、筛选和表单校验通过；未提交真实申请 |
| 秒杀报名 | `/order/flash-sale/sessions/available`、`/order/flash-sale/my` 均返回 `code=1`、空列表；我的在售商品 total=0 | “可报名场次/我的报名”页签、刷新、卡片空态和表格空态正常 | 读取和空态通过；无场次和商品，未执行报名 |
| 商品创建 | 分类树真实返回 4 个选项 | 创建表单正常加载，分类下拉显示真实分类，空表单提交提示“请输入商品标题” | 页面与校验通过；图片上传和商品创建未执行 |

- Chrome 项目控制台无 warning/error；浏览器中与其他网站脚本有关的日志未计入本项目结果。
- 本轮未产生分类申请、文件上传、商品或秒杀报名等真实业务数据。
- 商品上传/创建成功路径仍依赖 MinIO 可用和允许用于测试的商品图片；秒杀报名成功路径还需可报名场次及买手名下在售商品。

## 2026-08-05 分类申请写链路与 MinIO 实测

| 模块 | 实际操作 | 接口结果 | Chrome 结果 | 结论 |
|---|---|---|---|---|
| 商品图片上传 | 使用生成的非个人 QA PNG 调用 `/order/files/upload?dir=product` | `code=-1`，提示“对象存储(MinIO)未配置，无法上传” | Chrome 文件注入同时受扩展“Allow access to file URLs”设置限制，但后端接口已确认不可用 | 商品创建闭环由 MinIO 环境阻塞，不标记为前端失败 |
| 分类申请提交 | 提交 `QA_20260805_PC分类申请回归` | 成功，申请 ID `2084925388770336770`，状态 `PENDING` | 列表回显名称、理由、待审核状态和申请时间；关键词筛选与重置正常 | 创建、刷新和非空列表闭环通过 |
| 分类申请时间 | 接口 `createdAt` 返回毫秒时间戳字符串 | 页面原先直接显示 `1785919923381` | 新增时间适配后显示为本地日期时间 | 已修复并通过 Chrome 验证 |

- 已执行 `pnpm typecheck`、`git diff --check`，均通过。
- 分类申请下一步需后台审核 `2084925388770336770`，再回归 `APPROVED/REJECTED`、审核意见和分类树变化。
- 商品上传下一步需先配置 MinIO；Chrome 扩展文件上传还需开启“Allow access to file URLs”。

## 2026-08-05 分类申请审核闭环

| 验证项 | 接口结果 | Chrome 结果 | 结论 |
|---|---|---|---|
| 审核状态 | 申请 `2084925388770336770` 返回 `APPROVED`，审核意见 `1` | 列表显示“已通过”和审核意见 | 通过 |
| 审核时间 | `reviewedAt=1785922636848` | 新增审核时间列，显示为本地日期时间 | 通过 |
| 分类创建 | `createdCategoryId=2084936769859051521`，分类树节点 `enabled=true/source=APPLY` | 商品创建分类下拉出现 `QA_20260805_PC分类申请回归` | 审核与分类树联动通过 |

- Chrome 项目控制台无 warning/error。
- 已执行 `pnpm typecheck`、`git diff --check`，均通过。
- 分类申请创建、后台审核、C 端状态回显和商品表单分类联动已形成完整闭环。
- 商品创建仍由 MinIO 未配置阻塞；分类已满足后续商品提交条件。

## 2026-08-07 user 新接口接入与地址写入回归

### 实时 Swagger 变化

- 当前源站与测试网关的 `admin` Swagger 一致，为 107 条路径、108 个操作；`user` 为 32 条路径、32 个操作。
- 相比 2026-08-05 文档口径，`user` 新出现地址 CRUD、KYC 详情/提交、买手保证金流水/缴纳/退还和充值链配置能力。
- `order` 曾短暂从聚合配置消失；当前源站与测试网关的 `/order/v3/api-docs` 已恢复 HTTP 200，分类树真实读取正常。`notify` 继续为 HTTP 404；订单写链路仍需按数据前置条件单独回归。

### 已完成代码接入

| 梯队 | 能力 | Swagger 接口 | 页面/API 状态 |
|---|---|---|---|
| P0 | 地址管理 | `GET /user/addresses/list`、`GET /user/addresses/detail`、`POST /user/addresses/create`、`PUT /user/addresses/update`、`PUT /user/addresses/default`、`DELETE /user/addresses/delete` | 新增 `src/service/api/address.ts` 和真实类型；`/address` 与结算地址选择器均已移除 `@shared` 地址 Mock，编辑使用真实更新而非删除后重建，并保留页面未编辑的邮编、证件号和标签；业务 ID 原值透传 |
| P0 | 买手保证金 | `POST /user/buyer/deposit/page`、`POST /user/buyer/deposit/pay`、`POST /user/buyer/deposit/refund` | 买手保证金页使用专属流水；缴纳和退还改为真实确认操作，每次写入生成 UUID 幂等键并校验可用余额；工作台入口已指向押金管理。当前 order 服务异常不会阻断钱包和押金主体数据加载 |
| P0/P1 | 充值链配置 | `GET /user/recharge/chains` | 充值页移除 ETH/TRON/BSC 硬编码，按后端启用链、名称、最小金额和精度渲染并校验；空列表不再被误显示为持续加载 |
| P1 | KYC 详情 | `GET /user/kyc/detail` | KYC 页面读取真实姓名、脱敏证件号、提交/审核时间和驳回意见；`POST /user/kyc/submit` 已封装但尚未开放 UI 提交 |

### 验证边界与结果

- 已执行 `git diff --check`，未执行 `pnpm typecheck` 或构建。
- Chrome 使用真实账号完成地址新增、编辑、回读、设默认和删除：两条 QA 地址均持久化回显，编辑后的详细地址刷新正确；删除非默认 QA 地址后刷新列表确认不再返回，默认 QA 地址保留。
- 保证金写测仍需要非零钱包余额、可用保证金和流水数据。
- KYC 提交 DTO 需要真实证件图片 URL；当前没有独立 KYC 上传接口，现有 order 文件上传受 MinIO 未配置和 order 网关 404 双重阻塞，禁止用 `picsum` 或占位图 URL 提交。

## 2026-08-07 P0 真实结算提交接入

- 结算页已移除 `createOrderMock/payOrderMock`：选中商品改为调用 `POST /order/orders/create-batch`，携带真实 `addressId`、商品 ID、数量和 UUID 幂等键；批次返回的每个订单 ID 再调用 `POST /order/orders/pay` 使用钱包余额支付。
- 当前 Swagger 未提供 OKX 或其他链上支付契约，页面不再把 OKX 作为可执行的模拟支付方式，明确只开放钱包余额支付。
- 全部支付成功后才清理购物车选中项、刷新钱包余额并跳转成功页；若下单或任一笔支付失败，保留购物车，便于用户在订单页继续处理待付款订单。
- 未执行真实下单或扣款：当前购物车仍可能含 Mock 商品 ID，且测试账号钱包余额为 `0`。需准备在售真实商品、有效库存及足额钱包余额后再进行写入回归。

### P0-3 异常与重复提交保护

- 下单前仍在页面侧检查协议、地址和钱包余额；库存、商品状态等以后端批量下单结果为准，失败提示使用后端业务消息。
- 在浏览器会话内缓存下单幂等键、原始商品/数量和待支付订单 ID；网络中断、刷新或部分支付失败后重试会复用同一幂等键，不会创建重复订单。
- 多订单支付使用 `allSettled`：成功订单不再重复支付，失败订单保留为待付款；只有所有订单支付成功才删除对应购物车商品并刷新钱包余额。
