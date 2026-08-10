# Swagger 真实接口匹配矩阵

> 本矩阵按油宝 C 端 PC 的真实页面交互、字段和操作核对，不以 Mock 函数名相似作为接口满足依据。

## 扫描范围与 Swagger 快照

- 前端基线：45 个页面、61 个组件、4 个 Store、16 个 Mock API 模块及相关类型；本轮新增 2 个买手页面。
- 当前实际调用：73 项 Mock API 能力。
- 共用入口：`http://221.128.249.198:8902/doc.html`。
- 2026-08-05 实时读取：`admin` 84 路径/85 操作，`user` 19/19，`order` 40/42；Swagger 源站与测试环境的路径、方法和 Schema 结构差异均为 `0`。
- `notify` 已出现在 `swagger-config` 分组中，但源站与测试环境的 `/notify/v3/api-docs` 均返回 HTTP 404，不计为可用接口。
- 表中 `/user/...`、`/order/...`、`/admin/...` 用首段标识 Swagger 分组；分组内原始 path 分别从 `/auth/...`、`/orders/...` 等开始，后续同源请求前缀按请求层配置确定。

## 满足度口径

| 等级 | 含义 |
|---|---|
| A 直接满足 | 现有核心交互和数据可由单个 Swagger 接口满足，只需通用响应解包或简单重命名 |
| B 适配满足 | 接口能力完整，通过组合调用、字段转换或本地派生可保持现有交互 |
| C 部分满足 | 存在相关接口，但缺少当前页面所需字段、状态或操作，不能完成闭环 |
| D 当前缺失 | `admin`、`user`、`order` 中均无满足当前能力的接口 |
| 本地能力 | 当前交互不要求后端接口，不计入接口满足度 |

2026-08-01 初始 73 项 Mock 能力基线为 A 4、B 14、C 20、D 35。2026-08-05 深度复核将“KYC 完整缺失”修正为“状态读取部分满足、提交能力缺失”，当前基线修正为 A 4、B 14、C 21、D 34；A+B 约 `25%`，A+B+C 约 `53%`。该口径用于接口契约覆盖，不等同于页面接入或真实回归进度。

## 认证、注册与当前用户

| 前端需求 | 关键数据/交互 | Swagger 匹配 | 等级 | 差异 |
|---|---|---|---|---|
| 注册 | email、nickname、password、确认密码 | `POST /user/auth/register` | B | 后端支持注册；可选 phone/roles/emailCode，页面当前未传。需要移除原型提示并接入后再算页面已对接 |
| 邮箱密码登录 | email、password、token、用户基本信息 | `POST /user/auth/login` + `GET /user/auth/me` | B | 登录只返回 `userId/token/nickname/avatar`，需继续读取 `/auth/me`；`isBuyer` 由 roles 派生 |
| 当前用户初始化 | id、email、nickname、avatar、phone、points、VIP、KYC、买手身份 | `GET /user/auth/me` + `GET /user/points/account` | B | 缺前端 `status/registeredAt/lastActiveAt`；KYC 枚举需映射，VIP 来自第二个接口 |
| 演示账号切换 | 指定任意 Mock 用户切换会话 | 无真实接口 | D | 属于本地演示能力，正式真实登录不应映射为用户接口 |

## 首页、商品与分类

| 前端需求 | 关键数据/筛选 | Swagger 匹配 | 等级 | 差异 |
|---|---|---|---|---|
| 分类树/导航 | id、name、level、parentId、path、icon、productCount、children | `GET /order/categories/tree` | B | 缺 code、icon、完整 path、productCount、时间字段 |
| 首页推荐聚合 | hot、newest、flash、topCategories、topSellers、Banner | `/order/storefront/recommend`、`best-sellers/page`、`new-arrivals/page`、`flash-sale`、`banners/list` | C | 可组合主要榜单；没有 topCategories/topSellers 分布，当前首页卖家入口无数据源 |
| 公开商品详情 | 商品、卖家、分类、价格、库存、图文、售后、销量/浏览/收藏 | `GET /order/storefront/product/detail` | C | 缺 sellerName、categoryPath、aftersaleDays；images 格式不同 |
| 商品分页/搜索 | keyword、category、售后、海外、价格区间、销量/最新/价格/收藏排序 | 无公开通用分页接口 | D | `products/my/page` 仅当前卖家；榜单接口无法满足筛选页 |
| 卖家店铺商品 | 指定 sellerId 的公开商品列表 | 无 | D | `products/my/page` 不能查询其他卖家 |
| 商品评价分页/评分摘要 | 评价方向、用户、分数、内容、标签、图片、汇总 | 无 | D | 当前 Swagger 没有评价接口 |

## 购物车、地址与订单

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 本地购物车增删改选 | 无需后端 | 本地能力 | 当前使用 Pinia/local storage，结算前需重新校验商品 |
| 地址列表/新增/编辑/设默认/删除 | `GET /user/addresses/list`、`POST /user/addresses/create`、`PUT /user/addresses/update`、`PUT /user/addresses/default`、`DELETE /user/addresses/delete` | B | 2026-08-07 已接入地址页与结算选择器；前端新增 `country` 输入并在 API 层转换 `detailAddress/defaultFlag`，新增、编辑、设默认、删除及回读均已真实回归 |
| 下单 | `POST /order/orders/create` | C | 仅 `productId/quantity/sessionId/remark`；页面需要地址选择、金额拆分、多购物项和售后上下文 |
| 买家订单列表 | `POST /order/orders/bought/page` | C | 基本分页存在；前端 10 状态与后端 7 状态不一致，缺地址、买手名、物流和售后字段 |
| 订单详情 | `GET /order/orders/detail` | C | 缺 receiver、address、shippingFee、tax、物流、采购/发货截图、保修、售后关联和完整时间线 |
| 订单状态计数 | 多次调用 `orders/bought/page` 可派生 | B | 无统计接口；需按状态读取分页 total |
| 支付 | `POST /order/orders/pay` | A | 核心操作存在 |
| 确认收货 | `POST /order/orders/confirm` | A | 核心操作存在；不接收前端预留收货视频 |
| 取消订单 | `POST /order/orders/cancel` | C | 只接收 ID，无法提交当前取消原因；取消/退款语义合并 |

## 钱包、充值与提现

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 钱包总览 | `GET /user/wallet/overview` | B | total/todayIn/todayOut/distribution 可适配；固定桶、买手押金和钱包地址需确认 distribution 类型 |
| 总资产 | `GET /user/wallet/overview` 的 `total` | A | API 层应转换为字符串展示，避免浮点运算 |
| 钱包流水与筛选 | `POST /user/wallet/ledger/page` | C | 缺链上 hash、地址、refType/refId、费用拆分；没有日期、方向、bucket、keyword 等当前完整筛选 |
| 发起充值 | `POST /user/recharge/create`、`GET /user/recharge/detail`、`POST /user/recharge/page` | B | 页面已按“创建订单→读取收款地址→展示记录”接入；真实写入与到账确认待充值测试资金 |
| 平台链钱包列表 | `GET /user/recharge/chains` | B | 2026-08-07 已改为动态读取 `enabled/label/minAmount/decimals`，收款地址仍以充值订单详情为准 |
| 发起提现 | `POST /user/withdraw/create`、`GET /user/withdraw/detail`、`POST /user/withdraw/page` | B | 页面已按当前 `chain/toAddress/amount` 契约接入；支付密码/手续费不在 Swagger 中，已移除模拟计算 |

## 积分与 VIP

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 我的积分与双身份 VIP | `GET /user/points/account` | B | points、双角色等级、阈值和 benefits 齐全；需适配前端结构 |
| 积分流水 | `POST /user/points/ledger/page` | B | 核心字段齐全；当前 PC 日期筛选和 onlyAppealable 缺少请求参数 |
| 扣分申诉 | `POST /user/points/appeals/submit` | A | `ledgerId/reason` 可直接匹配 |
| 积分规则展示 | `GET /admin/point-rules/list` | C | 字段较完整，但属于 admin 分组，未确认 C 端可访问 |
| 全等级 VIP 配置展示 | `GET /admin/vip-configs/get` | C | 可返回双角色维度和等级；缺 C 端公开接口确认 |

## 买手中心

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 我的商品/创建商品 | `POST /order/products/my/page`、`POST /order/products/create`、`POST /order/files/upload` | B | 核心能力存在；图片需先上传，字段和售后枚举需转换 |
| 可接求购/抢单 | `POST /order/demands/hall/page`、`POST /order/demands/grab` | C | 操作存在，DTO 缺客户名、分类路径、推送层级/时间和审核信息 |
| 买手订单 | `POST /order/orders/sold/page` | C | 缺采购截图、发货截图、物流公司/单号、地址和细分状态 |
| 上传采购凭证 | `POST /order/files/upload` 只能上传文件 | D | 没有把采购凭证绑定到订单的接口 |
| 发货 | `POST /order/orders/ship` | C | 只接收订单 ID，当前页面需要 trackingNumber、carrier 和 shippingScreenshotUrl |
| 买手押金与经营统计 | `GET /user/wallet/overview`、`POST /user/buyer/deposit/page`、`POST /user/buyer/deposit/pay`、`POST /user/buyer/deposit/refund`、`GET /user/buyer/application` | B | 已完成 1 U 真实缴纳→余额/流水回读→真实退还→余额恢复的闭环；仍缺完成率、好评率、投诉率、平均发货时效和未履约统计 |

## 求购

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 发起求购 | `POST /order/demands/create` | B | 标题、分类、描述、预算、天数、海外、售后、图片可匹配 |
| 我的求购/大厅 | `POST /order/demands/my/page`、`POST /order/demands/hall/page` | C | 已返回 `buyerId/expireAt/takenBy/takenAt/orderId`；仍缺推送批次、客户/买手名称、审核信息、关联订单号和取消原因，预算区间/期望天数筛选也无参数 |
| 求购详情 | `GET /order/demands/detail` | C | 主体数据存在；没有 pushLogs 和 pushed buyer 列表 |
| 取消/抢单 | `POST /order/demands/cancel`、`POST /order/demands/grab` | B | 核心操作存在；取消原因无法提交 |
| 手动推下一批 | 无 | D | PC 详情页存在该操作，Swagger 无对应接口 |

## 当前后端缺失模块

| 模块 | PC 现有需求 | 当前结论 |
|---|---|---|
| KYC | `GET /user/auth/me`、`GET /user/kyc/detail`、`POST /user/kyc/submit`；admin 已出现 KYC 查询/审核接口 | C | 2026-08-07 已接入 C 端详情读取；提交 DTO 支持证件照 URL 和手持照，但缺独立安全上传接口，MinIO 与 order 上传链路未恢复，页面暂不发送模拟图片 URL |
| 理财 | 产品、VIP 利率、认购、锁仓列表/详情、利息流水、提前解锁 | D：无理财接口 |
| 评价 | 商品评价、我的评价、评分摘要、提交评价 | D：无评价接口 |
| 完整售后 | 5 类工单、证据、列表、详情、历史、取消、IM 入口 | D/C：仅有简单退款申请/审核/详情 |
| IM | 订单群、平台客服、售前会话、消息列表/发送 | D：无 IM 接口 |
| 通知 | 系统/交易通知、未读数、分类摘要 | D：`notify` Swagger 404 |
| CMS | 公告、帮助文章、协议正文与当前版本 | D：无接口，Banner 不能替代公告 |
| AI 导购 | 自然语言搜索与商品建议 | D：无接口 |

## 后端优先补充清单

1. 收货地址 CRUD、默认地址和结算读取。
2. C 端公开商品分页搜索和指定卖家的公开商品列表。
3. 补齐订单地址、收件人、金额拆分、物流、采购/发货截图、售后配置和状态时间线；卖家发货接收物流字段。
4. KYC、理财、评价、IM/通知、公告/帮助/协议、AI 导购接口。
5. 独立售后工单列表/详情/创建/取消/证据/历史。
6. C 端公开积分规则、VIP 全等级配置及买手押金充值/转出划转接口。
7. 求购推送批次/日志、预算区间筛选和买手经营统计。

## 状态说明

- 本文只表示 Swagger 契约匹配，不表示真实 API 已封装、页面已调用或浏览器已验证。
- 所有 Long ID 必须保持原始值；Swagger 中 `int64` 不得在页面层随意转为 `number`。
- 字段差异后续优先在 API adapter 处理；涉及交互缺失时先与后端或用户确认。

## 2026-07-29 P0/P1 页面调用状态

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 待确认 |
|---|---|---|---|---|
| P0 | 请求层、token、响应解包、错误提示 | 真实响应 `{ code, message, data, success }`、成功码 `1`、`X-Access-Token` | 已建立 `src/service/request/` 和 dev/prod env；真实登录回归通过 | admin 借用接口失败时使用 `skipAuthRedirect` 避免清 C 端登录态 |
| P1 | 注册 | `POST /user/auth/register` | API 已封装，注册页已调用 | 注册后是否自动登录当前按“返回登录页”处理 |
| P1 | 登录/当前用户 | `POST /user/auth/login`、`GET /user/auth/me` | API 已封装，登录页和 Store 已调用 | 真实账号、角色与 KYC 枚举需回归确认 |
| P1 | 分类树 | `GET /order/categories/tree` | API 已封装，公共分类导航和分类页已调用 | 商品列表仍为 Mock，公开商品分页在 P2 处理 |
| P1 | 积分账户/VIP 当前权益 | `GET /user/points/account` | API 已封装，用户初始化、积分页、VIP 页已调用 | 买手/顾客双身份等级展示需真实账号验证 |
| P1 | 积分流水/申诉 | `POST /user/points/ledger/page`、`POST /user/points/appeals/submit` | API 已封装，积分页已调用 | 日期、多行为筛选部分仍在前端侧适配 |
| P1 | 积分规则 | `GET /admin/point-rules/list` | API 已封装，积分页/VIP 页已调用；普通 C 端 token 返回 `-200` 时前端降级展示 | 需后端补 C 端公开规则接口 |
| P1 | VIP 全量配置 | `GET /admin/vip-configs/get` | API 已封装，VIP 页已调用；普通 C 端 token 返回 `-200` 时前端降级展示 | 需后端补 C 端公开 VIP 配置接口 |
| P1 | 钱包总览 | `GET /user/wallet/overview` | API 已封装，钱包 Store、钱包首页资产卡、个人中心资产卡已调用 | 最近交易已在 P4 调用真实钱包流水 |

> 已使用真实账号完成 P1 主要页面回归；本轮未执行 `pnpm typecheck` 或 `pnpm build`。

## 2026-07-29 P2-A 页面调用状态

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 待确认 |
|---|---|---|---|---|
| P2-A/P3 | 公开商品、详情与购物车 | `POST /order/storefront/products/page`、`GET /order/storefront/product/detail?id=` | 商品列表、详情、加购与立即购买均使用真实商品 ID；跨账号已完成真实商品下单、支付、发货、确认收货 | 订单详情仍缺地址、物流原始字段与凭证 |
| P2-A/P3 | 分类入口商品列表 | `GET /order/categories/tree`、`POST /order/storefront/products/page` | 分类树节点的原始 Long ID 已透传至真实公开商品分页，分类页不再读取 Mock 商品 | 分类树读取和真实空态已确认；待在售商品验证分类筛选与商品卡 |
| P2-A | 买手商品列表 | `POST /order/products/my/page` | API 已封装，买手商品管理页已调用 | 状态映射需真实数据确认；删除商品无接口 |
| P2-A | 买手创建商品 | `POST /order/products/create`、`GET /order/products/detail?id=` | API 已封装，创建商品页已调用 | 图片上传组件仍需治理为 `bucket/filePath` 结构 |
| P2-A | 买手上下架 | `PUT /order/products/shelf` | API 已封装，商品卡片上下架已调用 | `ON_SALE/OFF_SHELF` 与前端 shelf/status 拆分需真实返回确认 |
| P2-A | 文件上传 | `POST /order/files/upload?dir=product` | API 已封装，请求层已支持 `FormData` | 当前页面上传组件未直接改为真实上传闭环 |
| P2-A | 发起求购 | `POST /order/demands/create` | API 已封装，发起求购页已调用 | 取消原因、审核字段和图片结构仍需后续补齐 |
| P2-A | 求购大厅 | `POST /order/demands/hall/page` | API 已封装，求购大厅已调用；普通顾客账号返回无买手权限时页面降级为空态 | 预算区间和期望天数为前端侧过滤，后端分页不支持这些参数 |
| P2-A | 我的求购 | `POST /order/demands/my/page` | API 已封装，我的求购页已调用；真实账号 total=1 回归通过 | 后端 VO 未返回 customerId，页面侧按当前用户注入用于撤销判断 |
| P2-A | 求购详情 | `GET /order/demands/detail?id=` | API 已封装，求购详情页已调用；测试求购 `2082306670605197313` 回归通过 | pushLogs、推送批次、客户/买手名称和审核信息缺失 |
| P2-A | 取消/抢单 | `POST /order/demands/cancel`、`POST /order/demands/grab` | API 已封装；2026-07-30 已真实创建并在详情页撤销求购 `2082649312807444481` | `demands/my/page` 未回显该记录，待后端核对；抢单仍依赖真实买手账号、KYC 和后端鉴权 |
| P2-A | 手动推下一批 | 无 | 页面已改为真实接口暂不支持提示 | 需要后端补推送接口后再接入 |

> 已使用真实账号完成求购创建、我的求购和求购详情回归；商品详情缺真实商品数据，买手能力缺买手账号 + KYC。

## 2026-07-29 真实联调结果

| 梯队 | 能力 | 接口结果 | 页面结果 | 结论 |
|---|---|---|---|---|
| P0 | 登录 | `/user/auth/login` 成功，返回 token、`userId=2082303088212398081`、昵称 `john` | 首页显示 `john / VIP0 / 0积分` | 通过 |
| P1 | 当前用户 | `/user/auth/me` 成功，角色 `CUSTOMER`、KYC `UNSUBMITTED` | 个人中心显示 john、邮箱、KYC 未提交、注册于 `—` | 通过 |
| P1 | 积分/VIP 当前状态 | `/user/points/account` 成功，points=0、VIP0 | 积分页/VIP 页展示一致 | 通过 |
| P1 | 钱包总览 | `/user/wallet/overview` 成功，total=0 | 钱包页显示 `U 0.00`、资产分布和暂无交易 | 通过 |
| P1 | 分类树 | `/order/categories/tree` 成功 | 首页展示真实分类 | 通过 |
| P1 | admin 配置借用 | `/admin/point-rules/list`、`/admin/vip-configs/get` 对 C 端 token 返回 `-200` | 前端已降级，不清登录态 | 待后端补公开接口 |
| P2-A | 发起求购 | `/order/demands/create` 成功，生成 `2082306670605197313` | 后端写入成功 | 通过 |
| P2-A | 我的求购 | `/order/demands/my/page` 成功，total=1 | 页面显示测试求购、金额 `U199.00`、撤销入口 | 通过 |
| P2-A | 求购详情 | `/order/demands/detail` 成功，状态 `OPEN` | 前端映射为“推送中” | 通过 |
| P2-A | 求购大厅 | 普通账号调用返回“请先申请成为买手” | 页面降级为空态，无未捕获错误 | 符合普通账号权限 |
| P2-A | 商品榜单 | 公开榜单接口成功但 total=0 | 无真实商品可回显 | 待商品数据 |
| P2-A | 买手能力 | 未测 | 当前账号非买手 | 待买手账号 |

## 2026-07-29 补充接口满足度与页面调用

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 待确认 |
|---|---|---|---|---|
| P2-B | 文件上传 | `POST /order/files/upload?dir=` | API 已封装，求购/买手商品上传组件已调用；接口真实返回 MinIO 未配置 | 后端配置对象存储后再验证成功上传和图片回显 |
| P2-B | 商品浏览打点 | `POST /order/storefront/browse`、`POST /order/products/view` | 商品详情页已调用；使用静默错误避免打点失败影响详情浏览 | 需真实商品 ID 验证浏览量变化 |
| P2-B | 收藏/我的收藏 | `POST /order/products/favorite`、`POST /order/products/favorites/page` | 商品详情收藏按钮和 `/favorites` 页面已调用；真实商品写入返回 `t_product_favorite.created_at` 无默认值，列表仍为 total=0 | 后端需补数据库默认值或插入字段后复测回显与取消收藏 |
| P3 | 买家订单列表/详情 | `POST /order/orders/bought/page`、`GET /order/orders/detail` | 跨账号真实订单完成后，列表和详情均能用原始 Long ID 回读，并完成确认收货 | 后端缺地址、物流、售后、凭证等详情字段 |
| P3 | 结算下单与钱包支付 | `POST /order/orders/create-batch`、`POST /order/orders/group/pay` | 已以真实在售商品、有效库存和钱包余额完成下单、订单组支付、发货、确认收货；Long ID 保留为字符串 | OKX 等外部支付仍无后端契约 |
| P4 | 钱包流水 | `POST /user/wallet/ledger/page` | API 已封装，资金流水页已调用；当前账号流水 total=0 | 后端仅支持 `bizGroup/bizType`，页面桶/日期/多类型为前端侧过滤 |

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 38% |
| 已页面接入进度 | 约 35% |
| 真实回归通过进度 | 约 25% |
| C 端 PC 整体交付进度 | 约 32% |

## 2026-07-30 页面真实数据补齐

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 待确认 |
|---|---|---|---|---|
| P3 | 个人中心订单概况 | `POST /order/orders/bought/page` | 已按后端七种状态派生统计；同一后端状态只请求一次，避免前端别名重复计数 | 当前账号订单均为 `0`，需订单测试数据验证非零统计 |
| P4 | 钱包首页今日收支与最近交易 | `GET /user/wallet/overview`、`POST /user/wallet/ledger/page` | 页面已调用真实总览和流水，不再读取钱包 Mock | 当前账号资产与流水均为 `0`，需资金流水验证非零回显 |
| P2-B | 首页真实内容聚合 | `GET /order/banners/list`、`GET /order/storefront/recommend`、`POST /order/storefront/best-sellers/page`、`POST /order/storefront/new-arrivals/page`、`GET /order/storefront/flash-sale` | API 已封装，首页各区块已独立调用；无数据不回退 Mock | 缺 Banner、在售商品、有效秒杀场次；买手榜、公开商品分页仍无接口 |
| P1 | 首页右侧顾客订单统计 | `POST /order/orders/bought/page` | 已调用真实状态统计；当前账号三项均为 `0` 且与个人中心一致 | 需非零订单验证三项状态回显 |
| P3 | 买手订单只读列表 | `POST /order/orders/sold/page` | 页面已调用真实卖出订单分页；采购凭证、物流信息写操作不再使用 Mock | 待买手账号和名下订单；后端需补凭证/物流绑定订单接口 |
| P4 | 买手钱包专属流水 | `POST /user/wallet/ledger/page` | 页面按业务类型并发读取后合并，支持押金/结算/利息真实流水 | 待买手账号和非空流水验证 |

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 50% |
| 已页面接入进度 | 约 49% |
| 真实回归通过进度 | 约 35% |
| C 端 PC 整体交付进度 | 约 42% |

## 2026-07-30 工作台与支付成功页调用状态

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 待确认 |
|---|---|---|---|---|
| P2-A | 买手工作台订单与可接求购 | `POST /order/orders/sold/page`、`POST /order/demands/hall/page` | API 已封装，`/buyer/dashboard` 已调用真实列表、状态统计和可接求购；无契约的随机经营指标已移除 | 需 KYC 通过的买手账号和名下订单/可接求购验证非空回显与抢单后刷新 |
| P4 | 买手工作台资金与押金概览 | `GET /user/wallet/overview` | 工作台已读取真实钱包和押金字段；充值/转出未调用 Mock，因 Swagger 缺少买手押金划转写接口而明确提示 | 需买手钱包、可用押金和已担保押金测试数据；后端需补押金划转接口后再接写操作 |
| P2-B/P3 | 支付成功页订单与推荐 | `GET /order/orders/detail`、`GET /order/storefront/recommend?limit=` | 成功页已按真实订单 ID 读取订单号和金额，推荐区使用真实接口；任一接口失败不回退 Mock | 需真实支付订单及在售推荐商品验证订单回显、商品卡、图片和跳转 |

### 本轮 Chrome 回归

| 能力 | 页面与接口表现 | 控制台 | 结论 |
|---|---|---|---|
| 支付成功页推荐 | 成功渲染订单成功和“您可能也喜欢”；推荐接口无数据时无 Mock 商品残留 | 无 warning/error | 空态通过 |
| 买手工作台路由 | 顾客账号访问 `/buyer/dashboard` 跳转 `/kyc` | 无 warning/error | 权限守卫通过；真实买手数据待账号验证 |

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 已封装接口进度 | 约 52% |
| 已页面接入进度 | 约 51% |
| 真实回归通过进度 | 约 36% |
| C 端 PC 整体交付进度 | 约 43% |

## 2026-08-01 新增页面调用矩阵

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P1 | 积分申诉记录 | `POST /user/points/appeals/page` | API 已封装，积分页已调用；支持关键词、状态和分页 | Chrome 已验证页签、关键词查询和空态；账号无申诉数据 |
| P2 | 我的分类申请 | `POST /order/categories/apply/my/page` | API 已封装，`/buyer/categories/apply` 已调用 | 未运行 |
| P2 | 提交分类申请 | `POST /order/categories/apply/submit` | API 已封装，分类申请弹窗已调用；`parentId` 保留原始字符串 | 未运行 |
| P2 | 秒杀可用场次/我的报名 | `GET /order/flash-sale/sessions/available`、`GET /order/flash-sale/my` | API 已封装，`/buyer/flash-sales` 已调用 | 未运行 |
| P2 | 秒杀报名/取消 | `POST /order/flash-sale/enroll`、`DELETE /order/flash-sale/enroll` | API 已封装，报名弹窗与取消操作已调用 | 未运行 |
| P2 | 商品图片结构 | `POST /order/files/upload`、`POST /order/products/create` | 商品创建已提交上传结果的 `bucket/filePath` | MinIO 未配置，待后端环境 |
| P2 | 商品审核驳回 | `POST /order/products/my/page`，状态 `REJECTED` | adapter、前端枚举、筛选页签和卡片展示已对齐 | 未运行 |
| P3 | 未支付订单改价 | `PUT /order/orders/price` | API 已封装，买手订单 `PENDING_PAYMENT` 卡片已调用 | 未运行 |
| P4 | 充值详情 | `GET /user/recharge/detail` | 充值记录列表详情抽屉已调用 | Chrome 已验证页面和空态；账号无充值记录，未点击详情 |
| P4 | 提现详情 | `GET /user/withdraw/detail` | 提现记录列表详情抽屉已调用 | Chrome 已验证页面、KYC 提示和空态；账号无提现记录，未点击详情 |

> P5 完整售后未接入：现有前端为 5 类售后工单，Swagger 仅有简单退款接口，直接替换会改变已确认交互和业务语义。

### 本轮 Chrome 回归结论

- 真实账号登录成功，首页展示 `john / VIP0 / 0积分`。
- 积分申诉记录查询、充值页、提现页及买手路由权限守卫运行正常，Chrome 控制台与 Vite 终端无 warning/error。
- 买手功能因当前账号未完成 KYC、不是买手而未进入页面；需要真实买手账号、在售商品、秒杀场次和待付款卖出订单继续验证。
- 未运行 `typecheck`、`lint`、`test` 或 `build`。

## 2026-08-01 列表补齐调用矩阵

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P2-B | 取消收藏 | `DELETE /order/products/favorite?id=` | API 已封装，`/favorites` 已调用；保留 Long ID 原值 | 需先修复后端收藏写入的 `created_at` 约束，再回归添加、回显与取消 |
| P2-A | 买手商品关键词/分类筛选 | `POST /order/products/my/page` 的 `keyword/categoryId` | API 与页面已传递筛选条件，分类末级 ID 保留原值 | 当前账号非买手，路由守卫跳转 `/kyc` |
| P2-A | 买手商品状态分页 | `POST /order/products/my/page` 的 `pageNo/pageSize/status` | 已使用后端 `total`；在售/下架分别查询 `ON_SALE/OFF_SHELF` | 待买手账号及多页商品数据 |
| P2-A | 商品驳回意见 | 商品 DTO 的 `reviewComment` | adapter 已映射，`REJECTED` 商品卡已展示 | 待一条驳回商品数据 |
| P3 | 买手订单分页 | `POST /order/orders/sold/page` 的 `pageNo/pageSize/status` | 页面已使用真实 `total` 分页 | 当前账号非买手，待名下多页订单数据 |
| P4 | 充值状态筛选/分页 | `POST /user/recharge/page` 的 `status/pageNo/pageSize` | 页面已调用，支持待确认/已确认/已取消 | Chrome 已验证筛选交互和空态；账号无记录 |
| P4 | 转出状态筛选/分页 | `POST /user/withdraw/page` 的 `status/pageNo/pageSize` | 页面已调用，支持审核中/已通过/已完成/已驳回 | Chrome 已验证筛选交互和空态；账号无记录 |

### 本轮验证结论

- `pnpm typecheck`、`git diff --check` 均通过。
- 收藏、充值和转出页面正常渲染；充值“待确认”和转出“审核中”筛选可选中并刷新列表，Vite 终端无新增报错。
- 当前测试账号没有收藏、充值、转出或买手业务数据，写操作、非空回显和真实翻页不标记为已验证。
- 卖家发货、购物车下单、退款接口仍属于契约冲突项，未计入可直接开发能力。

## 2026-08-05 深度匹配修正与调用状态

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P2 | 求购状态与字段 | `GET /order/demands/detail` 返回 `buyerId/expireAt/takenBy/takenAt/orderId`，状态包含 `VOID` | adapter 已使用买家 ID、接单截止和关联订单；`VOID` 映射为“已取消”，详情所有权不再用当前查看者覆盖 | 真实求购 `2082306670605197313` 返回 `VOID`，Chrome 正确展示“已取消”和接单截止时间 |
| P2 | 买手可接求购 | `POST /order/demands/hall/page`、`POST /order/demands/grab` | `/buyer/claimable` 已移除 `buyerApi` Mock，使用真实大厅分页和抢单；页面语义调整为“可接求购” | 当前账号为 `CUSTOMER`，大厅接口返回“请先申请成为买手”；需真实买手账号验证列表和抢单成功路径 |
| P4 | 买手押金概览与流水 | `GET /user/wallet/overview`、`POST /user/wallet/ledger/page` | `/buyer/deposit` 已读取真实押金桶、押金流水和卖出订单统计；Mock 余额划转已移除 | 钱包总览和押金流水接口成功，当前账号余额与流水均为 `0`；买手页面非空回显待买手账号 |
| P4 | 钱包桶枚举 | `WalletVO.distribution.type` | adapter 已兼容后端实际返回的 `FINANCE_LOCKED/ORDER_FROZEN/RISK_FROZEN`，避免非零冻结资产被忽略 | 当前账号对应金额均为 `0`，已验证接口枚举结构，非零金额待测试数据 |
| P5 | KYC 状态 | `GET /user/auth/me` 返回 `kycStatus` | `/kyc` 已读取真实状态；证件上传、短信、人脸和 Mock 提交链路已关闭 | Chrome 展示 `john / UNSUBMITTED`，提交按钮禁用，控制台无 warning/error |
| P2 | 买手商品货架状态 | `ProductDTO.status` | 仅 `ON_SALE` 映射为“在售”；审核中、驳回、下架、冻结统一不显示在售 | 当前账号不是买手，待买手商品状态数据验证页面标签 |

### 本轮验证结论

- Swagger 源站和测试环境的 `admin/user/order` 路径、方法和 Schema 结构完全一致，没有新增可用接口；`notify` 分组仍为 HTTP 404。
- `pnpm typecheck`、`git diff --check` 均通过，目标页面已无 `fetchClaimableRequests`、`fetchBuyerDepositSummary`、`submitKycMock` 等相关 Mock 调用。
- Chrome 已验证真实账号登录、KYC 未提交状态、禁用提交入口、求购 `VOID` 状态和接单截止字段；控制台无 warning/error。
- 当前账号角色为 `CUSTOMER`、KYC 为 `UNSUBMITTED`。买手可接求购、押金非空数据、商品状态和抢单写操作仍需要 KYC 通过的真实买手账号及对应业务数据。

本轮后 C 端 PC 已有接口对接估算：

| 口径 | 进度 |
|---|---:|
| 接口契约严格满足度（A+B） | 约 25% |
| 接口契约覆盖度（A+B+C） | 约 53% |
| 已封装接口进度 | 约 53% |
| 已页面接入进度 | 约 58% |
| 真实回归通过进度 | 约 40% |
| C 端 PC 整体交付进度 | 约 47% |

## 2026-08-05 买手审核后契约校正

| 梯队 | 前端能力 | Swagger/运行时证据 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P1/P2 | 买手访问权限 | `PUT /admin/buyer-applications/review` 明确“通过并授予买手身份”；`GET /user/auth/me` 返回 `BUYER/UNSUBMITTED` | 买手路由和身份切换已改为按 `BUYER` 角色放行，KYC 不再作为契约外入口门槛 | Chrome 可进入工作台、可接求购、押金、商品和订单页面，无 warning/error |
| P2 | 买手可接求购 | `POST /order/demands/hall/page` 返回 `code=1,total=0` | 页面读取真实大厅并展示空态 | 空态通过；无可接求购，未执行抢单 |
| P2 | 买手商品列表 | `POST /order/products/my/page` 返回 `code=1,total=0` | 状态筛选、关键词查询、重置和空态正常 | 交互通过；商品状态非空回显待数据 |
| P3 | 买手卖出订单 | `POST /order/orders/sold/page` 返回 `code=1,total=0` | 状态页签和空态正常 | 读取通过；订单操作待数据 |
| P4 | 买手押金 | `GET /user/wallet/overview`、`POST /user/wallet/ledger/page` 均返回 `code=1` | 押金总额、可用、已担保均为 `0`，流水空态正确 | 读取通过；非零金额和流水待数据 |

### 校正结论

- 当前账号已由后台审核为买手，申请状态 `APPROVED`，角色包含 `BUYER`；KYC 仍为 `UNSUBMITTED`。
- 最新 Swagger 没有 KYC 提交、审核或状态变更接口，买手审核接口也未声明 KYC 联动，因此不再把 `KYC=PASSED` 作为买手页面回归前置条件。
- 当前买手只读链路已完成真实接口与 Chrome 空态回归；抢单、商品状态、订单动作和押金非零展示仍受测试数据缺失限制。
- 接口满足度、页面接入进度和整体交付进度不因权限校正发生变化；真实回归覆盖范围已扩大，但非空及写操作仍需补测。

## 2026-08-05 买手扩展页面调用验证

| 梯队 | 前端能力 | Swagger 匹配 | 页面调用状态 | 真实验证 |
|---|---|---|---|---|
| P2 | 分类树与我的分类申请 | `GET /order/categories/tree`、`POST /order/categories/apply/my/page` | 商品创建和分类申请页面均已调用 | 分类树 4 项、申请 total=0；Chrome 筛选、重置和空态通过 |
| P2 | 提交分类申请 | `POST /order/categories/apply/submit` | 提交弹窗已调用，保留 Long `parentId` | 必填提示通过；未提交真实申请 |
| P2 | 秒杀场次与我的报名 | `GET /order/flash-sale/sessions/available`、`GET /order/flash-sale/my` | 秒杀报名页已调用 | 两接口均成功且为空；页签、刷新和空态通过 |
| P2 | 秒杀报名 | `POST /order/flash-sale/enroll` | 报名弹窗已接入 | 缺可报名场次和在售商品，未执行写操作 |
| P2 | 商品创建表单 | `GET /order/categories/tree`、`POST /order/files/upload`、`POST /order/products/create` | 表单、分类下拉、上传组件和提交 API 已接入 | 分类选项和必填校验通过；上传及创建待 MinIO 和测试图片 |

- 本轮 Chrome 项目控制台无 warning/error。
- 本轮只验证读取、空态、筛选、页签和表单校验，没有产生外部写入。
- 分类申请、商品创建和秒杀报名不能因页面可操作而标记为真实闭环通过，仍需记录成功写入返回的业务 ID。

## 2026-08-05 分类申请真实写入与上传环境验证

| 梯队 | 前端能力 | Swagger 接口 | 真实结果 | 当前边界 |
|---|---|---|---|---|
| P2 | 提交分类申请 | `POST /order/categories/apply/submit` | Chrome 提交成功，申请 ID `2084925388770336770` | 创建、刷新、非空列表和关键词筛选通过；审核结果待后台操作 |
| P2 | 分类申请列表时间 | `POST /order/categories/apply/my/page` 返回 `createdAt=1785919923381` | 已兼容毫秒时间戳字符串并显示本地时间 | Chrome 验证通过 |
| P2 | 商品图片上传 | `POST /order/files/upload?dir=product` | 非个人 QA PNG 实测返回 `code=-1`、“对象存储(MinIO)未配置” | 接口存在但当前环境不可用，商品创建不能闭环 |

- 当前分类申请为 `PENDING`，待后台审核后继续验证状态、审核意见和新分类树节点。
- Chrome 项目控制台无 warning/error；本轮唯一业务阻塞为 MinIO 未配置。

## 2026-08-05 分类申请审核闭环验证

| 梯队 | 前端能力 | Swagger/字段 | 真实验证 |
|---|---|---|---|
| P2 | 分类申请审核结果 | `POST /order/categories/apply/my/page` 返回 `status/reviewComment/reviewedAt/createdCategoryId` | 申请 `2084925388770336770` 已为 `APPROVED`，审核意见和申请/审核时间均正确展示 |
| P2 | 审核后分类树联动 | `GET /order/categories/tree` | 新分类 `2084936769859051521` 已返回，`source=APPLY/enabled=true` |
| P2 | 商品创建分类选择 | 商品表单复用分类树 | Chrome 分类下拉已出现 `QA_20260805_PC分类申请回归` |

- 分类申请的创建、审核、列表回显和分类树联动已真实闭环通过。
- 页面新增审核时间列，并兼容后端毫秒时间戳字符串。
- 商品上传与创建仍受 MinIO 未配置阻塞，不因分类闭环通过而扩大结论。

## 2026-08-07 地址真实写入回归

| 梯队 | 能力 | 真实操作与结果 | 结论 |
|---|---|---|---|
| P0/P3 | 地址新增与回读 | Chrome 提交两条 QA 地址，列表刷新后均展示真实服务端数据 | 通过 |
| P0/P3 | 地址编辑 | 更新第一条的详细地址，关闭表单后列表回读为更新值 | 通过 |
| P0/P3 | 设为默认 | 将第二条 QA 地址设为默认，服务端返回成功，列表排序及默认标记同步切换 | 通过 |
| P0/P3 | 地址删除 | 删除非默认 QA 地址后刷新列表，已不再返回该地址 | 通过 |

- 默认 QA 地址按用户原始要求保留；非默认 QA 地址已用于删除接口真实回归。
- 已将 `maxLength` 改为数字绑定；删除回归页面控制台仅有 Vite 连接日志，无项目 warning/error。

## 2026-08-09 P0-8 订单组支付与买手发货调用状态

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P0/P3 | 批量订单组支付 | `POST /order/orders/create-batch` 返回 `orderGroupNo`，`POST /order/orders/group/pay` 接收该订单组号 | 结算页新订单改用订单组支付；旧浏览器待支付缓存仍逐订单重试，避免本地缓存升级后重复下单 | 待在售商品与足额钱包余额 |
| P3 | 买手发货 | `POST /order/orders/ship` 必填 `id/logisticsCompany/trackingNo`，物流编码可选 | 买手订单页既有发货弹窗已调用真实接口，提交成功后刷新订单列表；Long ID 原值传递 | 待 `PAID/PROCURING` 或待发货真实卖出订单 |
| P0 | 登录与注册页组件渲染 | - | Arco 组件按插件及 `A*` 子组件名称完成显式注册 | Chrome 已验证登录、注册表单和控制台无新增组件解析告警 |

- 实时 Swagger 源站和测试网关的 `admin/user/order` 文档内容一致；本批接口接入后仍需以真实订单、资金和物流状态回读作为最终通过标准。
- 已新增 `pnpm check:swagger` 作为关键 C 端契约检查：当前验证地址 CRUD、`create-batch` 的订单组响应、`group/pay` 和 `ship` 的必填请求字段；运行结果与实时 Swagger 一致。

## 2026-08-09 商品创建与真实结算前置验证

| 梯队 | 前端能力 | 运行时证据 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P0/P2 | 买手创建并上架商品 | `POST /order/products/create` 后，`POST /order/storefront/products/page` 返回商品 `2086316451825274882`（`测试数据`、`100 U`、库存 `10`） | 商品卡、详情、图片与购物车均能读取真实数据 | 通过 |
| P0/P3 | 结算地址与余额校验 | 默认 QA 地址正常回显；`GET /user/wallet/overview` 页面显示可用余额 `0.00 U` | 地址已满足，余额校验在调用 `create-batch` 前阻止提交 | 余额不足分支通过；未创建订单 |
| P0/P3 | 订单组支付与发货 | `create-batch → group/pay → ship` 契约与前端调用均已接入 | admin Swagger 钱包查询只读，当前账号无可用资金 | 待独立顾客具备至少 `100 U` 余额后回归 |

- 此条更新取代本文件中“公开商品分页为空”的当前状态：公开商品现为非空，Banner 是否有数据不影响商品交易链路。

## 2026-08-09 KYC 提交页真实化

| 梯队 | 前端能力 | Swagger 匹配 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P1 | KYC 资料上传与提交 | `POST /order/files/upload?dir=kyc` 返回图片 URL；`POST /user/kyc/submit` 接收资料与 URL | 独立 QA 账号已上传带明确水印的非真人模拟资料并成功提交；不涉及真实身份信息 | 通过；真实资料不作为测试前置 |
| P1 | KYC 状态与审核结果 | `GET /user/kyc/detail`；admin `POST /kyc/page`、`GET /kyc/detail`、`PUT /kyc/review` | C 端回读审核中；后台查询、通过审核后 C 端回读“已通过”及审核时间 | 通过 |

## 2026-08-10 结算商品归属与缓存防错

| 梯队 | 前端能力 | Swagger/运行时证据 | 当前状态 | 真实验证 |
|---|---|---|---|---|
| P0 | 自购商品预拦截 | `create-batch` 只提交商品 ID/数量，后端按登录态校验买家；自购返回业务错误 | 前端按当前用户与商品卖家 ID 比对，提示并禁用提交 | 类型检查通过；待自购商品页面回归 |
| P0 | 待下单缓存失效 | 合并下单失败时整批不生成订单；已生成订单可按幂等键/订单组重试 | 商品清单变化时丢弃未建单旧缓存；明确业务失败清理，支付重试保留 | 待不同购物车商品切换回归 |

### 自购拦截运行时兼容

- 当前 `GET /user/auth/me` 的 `userId` 与商品 DTO 的 `sellerId` 在测试数据中不能直接比对，但后端 `create-batch` 会正确拒绝自购。
- 前端保留本地 ID 预拦截；对后端明确的自购业务错误，立即标记当前商品、展示不可购买提示并禁用重复提交，同时清理未建单缓存。
- Chrome 已验证 `测试数据3` 的页面预拦截与禁用提交；当前公开商品均为当前账号关联买手的商品，正常购买写入回归待另一买手上架商品。

## 2026-08-10 P0 交易主链真实回归

| 能力 | Swagger 接口 | 真实结果 | 结论 |
|---|---|---|---|
| 合并下单与订单组支付 | `POST /order/orders/create-batch`、`POST /order/orders/group/pay` | 独立买家购买 `测试数据3` 1 件、`100 U`，订单 `2086756814281072640` 支付成功 | 通过 |
| 买手发货 | `POST /order/orders/ship` | `john` 提交 QA 物流单号后，订单从“采购中”刷新为“运输中” | 通过 |
| 顾客确认收货 | `POST /order/orders/confirm` | 独立买家确认后订单变为“已完成”，签收与完成时间回显 | 通过 |
| 订单详情补充字段 | `GET /order/orders/detail` | 收货地址、物流单号、采购/发货凭证未返回，页面使用默认降级 | 后端字段缺口，待补 |

## 2026-08-10 关键页面展示调整

| 模块 | 接口影响 | 页面调整 | 验证 |
|---|---|---|---|
| 登录/注册 | 无 | 补齐表单 placeholder，恢复 Arco 表单控件正常展示 | Chrome 已确认表单控件可见 |
| 购物车结算栏 | 无 | 摘要、金额、运费与操作按钮改为响应式对齐，避免文字竖排和按钮溢出 | 页面布局已回归 |
| 订单详情 | 无 | 容器宽度随内容收缩并居中，窄屏保留 16px 两侧安全距离 | 桌面 `1366px` 视口实测 `671px` 宽且无横向溢出 |

## 2026-08-10 P2 运行时补充

| 梯队 | 能力 | Swagger/运行时证据 | 结论 |
|---|---|---|---|
| P2 | 发起求购 | `POST /order/demands/create` 的 `PurchaseDemandCreateQO` 必填 `addressId`、`afterSaleType`、`budget`、`categoryId`、`demandNote`、`expectDeliveryDays`、`title`；前端补传地址后成功创建 `2086765099709194242`。 | 真实创建通过 |
| P2 | 抢单 | `POST /order/demands/claim` 成功，求购状态回显“已接单”，关联订单 `2086765217812406274`。 | 真实闭环通过 |
| P2 | 买手商品创建与审核 | `POST /order/files/upload`、`POST /order/products/create` 成功创建商品 `2086766319630901249`；后台首次审核通过后，另一账号已在 C-PC 下单、支付、发货并签收。 | 创建、审核、公开展示与该商品的真实交易闭环通过 |
| P3/P4 | 充值链与记录详情 | `GET /user/recharge/chains` 返回 TRON；充值列表/详情回显一笔已到账非空记录。 | 非空回归通过 |
| P4 | 买手押金 | 钱包概览与押金流水接口成功，当前返回均为 0/空。 | 读取与空态通过，非零待数据 |
| P2 | 秒杀报名 | 可报名场次接口成功但空，不能产生报名写入。 | 缺启用场次 |

- `pnpm check:swagger` 现同时检查求购创建契约，关键检查范围为地址、合并下单、订单组支付、买手发货、发起求购。
- notify Swagger 已恢复可访问（9 paths / 9 operations）；检查脚本不再把历史 404 作为固定成功条件，可用时会校验通知与 IM 的分页/未读关键操作。
- KYC 真实提交仍以用户本人资料为前提；完整售后仍不能用简单退款接口替代现有五类工单。

## 2026-08-10 通知与 IM 契约接入（进行中）

| 梯队 | 能力 | Swagger 契约 | 页面/API 状态 | 验证边界 |
|---|---|---|---|---|
| P5 | 通知列表与已读 | `POST /notify/notifications/page`、`GET /notifications/unread/count`、`PUT /notifications/read`、`PUT /notifications/read-all` | 真实 API 与类型已建立；当前项目没有独立通知列表页面，因此尚无页面调用。 | 契约检查通过；页面入口须在产品确定后新增。 |
| P5 | 订单会话列表/详情 | `POST /notify/im/conversations/page`、`GET /im/conversations/by-order`、`POST /im/messages/page` | `/im` 与 `/im/order-group/:orderCode` 已改用真实统一会话与消息分页。 | 类型检查通过；待双账号真实会话非空回读。 |
| P5 | 发送消息 | `POST /notify/im/messages/send`，必填 `conversationId/msgType` | 文本与图片入口均改发真实 `TEXT/IMAGE`，移除本地自动回复。 | 待两个测试账号真实发送与回读。 |

- 后端统一会话 DTO 不含 Mock 页面原有的参与者、订单金额、风控、客服排队、售前合并等字段；这些字段不再由前端构造或补假数据。
- 运行时：消息发送成功后会话预览已更新，但刷新后的 `POST /im/messages/page` 未回显该消息；同时发送接口真实响应为消息 ID。C-PC 已按消息 ID 后重新分页读取，消息分页读写一致性待 notify 后端核对。
- `ORDER_CARD` 的消息内容按 JSON 字符串解析为现有订单卡片字段；解析失败维持文本展示，避免前端将后端载荷原样当作卡片结构使用。

## 2026-08-10 前端待后端字段的接入边界

| 模块 | 前端已完成 | 后端依赖 |
|---|---|---|
| 订单详情 | DTO 与 adapter 已支持地址、物流、运费税费、采购/发货凭证的可选映射；字段缺失时保留明确降级提示。 | `GET /order/orders/detail` 返回对应真实字段。 |
| 售后 | 创建、列表、详情、撤销调用已收敛至单一 adapter，页面仍保留当前交互。 | 提供完整售后资源与状态机契约后替换 adapter。 |
| 收藏 | 真实请求失败不乐观更新数量，并保留可读错误提示。 | 修复收藏表 `created_at` 写入约束。 |
| 通知 | notify 调用不会因单域 `-200` 清空整站 token。 | notify 服务正确识别用户/后台 token。 |
