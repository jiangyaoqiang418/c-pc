# Swagger 真实接口匹配矩阵

> 本矩阵按油宝 C 端 PC 的真实页面交互、字段和操作核对，不以 Mock 函数名相似作为接口满足依据。

## 扫描范围与 Swagger 快照

- 前端：45 个页面、61 个组件、4 个 Store、16 个 Mock API 模块及相关类型。
- 当前实际调用：73 项 Mock API 能力。
- 共用入口：`http://221.128.249.198:8902/doc.html`。
- 2026-07-28 实时读取：`admin` 83 路径/84 操作，`user` 19/19，`order` 40/42。
- `notify` 的 `/notify/v3/api-docs` 返回 HTTP 404。
- 表中 `/user/...`、`/order/...`、`/admin/...` 用首段标识 Swagger 分组；分组内原始 path 分别从 `/auth/...`、`/orders/...` 等开始，后续同源请求前缀按请求层配置确定。

## 满足度口径

| 等级 | 含义 |
|---|---|
| A 直接满足 | 现有核心交互和数据可由单个 Swagger 接口满足，只需通用响应解包或简单重命名 |
| B 适配满足 | 接口能力完整，通过组合调用、字段转换或本地派生可保持现有交互 |
| C 部分满足 | 存在相关接口，但缺少当前页面所需字段、状态或操作，不能完成闭环 |
| D 当前缺失 | `admin`、`user`、`order` 中均无满足当前能力的接口 |
| 本地能力 | 当前交互不要求后端接口，不计入接口满足度 |

按 73 项已调用 Mock API 能力统计：A 4、B 14、C 20、D 35；A+B 约 `25%`，A+B+C 约 `52%`。

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
| 地址列表/新增/编辑/设默认/删除 | 无 | D | 三组 Swagger 均无收货地址接口 |
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
| 发起充值 | `POST /user/recharge/create` + `GET /user/recharge/detail` | C | 可创建并返回 depositAddress/txHash/status；当前页面先选平台链钱包并模拟入账，流程不同 |
| 平台链钱包列表 | 无 C 端接口 | D | 页面需要按 TRON/ETH/BSC 展示收款地址和链上余额 |
| 发起提现 | `POST /user/withdraw/create` | B | chain/toAddress/amount 匹配；页面支付密码和 KYC 前置规则未体现在 Swagger |

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
| 买手押金与经营统计 | `GET /user/wallet/overview`、`GET /user/buyer/application` | C | 无押金细分、完成率、好评率、投诉率、平均发货时效和未履约统计 |

## 求购

| 前端需求 | Swagger 匹配 | 等级 | 关键差异 |
|---|---|---|---|
| 发起求购 | `POST /order/demands/create` | B | 标题、分类、描述、预算、天数、海外、售后、图片可匹配 |
| 我的求购/大厅 | `POST /order/demands/my/page`、`POST /order/demands/hall/page` | C | 缺推送批次、客户/买手名称、审核信息、关联订单号和取消原因；PC 的预算区间/期望天数筛选也无参数 |
| 求购详情 | `GET /order/demands/detail` | C | 主体数据存在；没有 pushLogs 和 pushed buyer 列表 |
| 取消/抢单 | `POST /order/demands/cancel`、`POST /order/demands/grab` | B | 核心操作存在；取消原因无法提交 |
| 手动推下一批 | 无 | D | PC 详情页存在该操作，Swagger 无对应接口 |

## 当前后端缺失模块

| 模块 | PC 现有需求 | 当前结论 |
|---|---|---|
| KYC | 实名/证件正反面/人脸/手机验证码、状态与审核结果 | D：无 C 端 KYC 接口 |
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
6. C 端公开积分规则、VIP 全等级配置及充值收款地址契约。
7. 求购推送批次/日志、预算区间筛选和买手经营统计。

## 状态说明

- 本文只表示 Swagger 契约匹配，不表示真实 API 已封装、页面已调用或浏览器已验证。
- 所有 Long ID 必须保持原始值；Swagger 中 `int64` 不得在页面层随意转为 `number`。
- 字段差异后续优先在 API adapter 处理；涉及交互缺失时先与后端或用户确认。
