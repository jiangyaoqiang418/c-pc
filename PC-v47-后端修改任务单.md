# PC v47 后端剩余交付任务单

更新：2026-10-15。范围仅 `c-pc / feat/pc-ui-v47`。本单依据当前前端代码、后端交付回复和本轮 live OpenAPI 复核整理；原始需求语义保存在 [后端清单](./PC-v47-backend-requirements.md)，后端原回复见 [适配交付](./PC-v47-后端适配交付.md)。

**当前不是“14项接口仍未提供”。** 原键恢复、SKU、金额、采购/售后、品牌、评价排序/正文搜索/投票、收藏资格、正式内容读取、订单搜索、每日利息和充值矩阵的契约已公开。相应前端已封装并接到页面；真实交易和非空内容尚未完整验收。以下只列仍需后端、发布、运营或测试协作完成的部分。

服务前缀：O=`/api/order`，U=`/api/user`，N=`/api/notify`。ID保持原值；金额按十进制字符串、最多28位整数/8位小数处理。

## 优先级总表

| 优先级 | 编号 | 剩余交付 | 对应页面 | 当前阻塞 |
| --- | --- | --- | --- | --- |
| P0 | ENV-01 | 实际部署SHA、数据库增量升级及历史数据处理说明 | 结算、买手商品/订单/售后、充值 | 后端原回复称未部署，但Swagger已更新，无法据此确认实际运行版本 |
| P0 | B05 | 测试网络、USDT合约、确认数、地址及链服务配置 | `/wallet/deposit`、充值详情/记录/钱包流水 | 前端能按矩阵选择方式，缺可验收链配置和隔离资金 |
| P0 | CONTRACT-01 | 统一充值asset及采购凭证校验声明 | 充值与`/buyer/orders`采购弹窗 | Swagger必填/default、minItems与文字规则不一致 |
| P0 | QA-01 | SKU/采购/售后/审核/原键四态隔离样本 | 商品、购物袋、结算、订单及买手面板 | 不能用普通商品/空态替代新交易闭环 |
| P1 | B03 | 评价主题和关键词域与v47对齐 | `/product/:id`评价区、写评价 | 仅正文搜索已接；主题及作者/规格搜索未满足原型 |
| P1 | B07 | 正式内容正文、版本、生效时间、帮助topic编码 | `/help`、协议弹窗、`/announcement`、结算协议入口 | 公共列表为空、协议无有效版本；Ray待交付 |
| P1 | QA-02 | 品牌/投票/收藏/每日利息非空样本与角色验证 | 品牌专区、商品卡/详情、`/finance` | API及页面已接，非空/失败/权限验收仍需条件 |
| P2 | B10/B06/USDC | 本期延期或固定范围维持 | AI导购、首页专题、充值币种 | 不据此要求重复建设现有接口 |

## P0：发布和真实交易前提

### ENV-01 实际发布及历史数据

需要交付：

- order/user/notify/admin各服务当前部署提交SHA、发布时间及相应配置版本；说明后端交付回复中的未提交改动是否已经进入该版本。
- 在既有数据库上的增量迁移脚本/执行顺序、回滚边界和结果。空库init.sql通过不能证明存量库已升级。
- 明确旧商品缺费用、旧已支付订单缺采购凭证、旧SKU/审核记录怎样处理，不能让前端猜测或自动清理。
- 保留既有TronLink/钱包/审核及通知能力，不因适配覆盖回退。

涉及接口：O `/orders/by-key`、`/products/create`、`/products/update`、`/orders/procure`、`/orders/ship`、`/orders/refunds/confirm`及新增公开读取接口。验收需在所报版本逐项HTTP及业务回读，不能只提供Swagger截图。

### B05 USDT充值通道

对应：`/wallet/deposit`地址充值、钱包充值、金额申报、详情、记录及流水。

已提供并已接：U `GET /recharge/assets`，`GET /recharge/address`，`POST /recharge/create`，`GET /recharge/by-key`，`GET /recharge/detail`，`POST /recharge/page`，`PUT /recharge/cancel`。本期仅USDT；USDC保持禁用。

仍需配置并确认：

1. ETH/TRON/BSC各测试通道的 `enabled/methods/tokenContract/decimals/minAmount/minConfirmations/walletNetwork/memoRule`，明确测试网，不能借用主网合约。前端按真实矩阵开放ADDRESS/WALLET/DECLARATION。
2. 专属地址分配和链到账回调服务；共享地址只允许先创建申报，再展示该申报的地址和Memo，不得冒充专属地址。
3. 真实到账样本与 `asset/chain/source/txHash/reportedTxHash/logIndex/tokenContract/confirmations/minConfirmations`；确认数是快照。以`CONFIRMED`和钱包余额/流水回读确认入账。
4. 隔离账号、测试资金和回调/链服务责任人；验证错误网络/合约、少确认数、重复链事件和同原键不会重复入账。

当前PC钱包采用注入式钱包（含TronLink）签名，未新增手机DeepLink会话流程。后端已有`/tronlink/sessions/create/detail`的SUCCESS不代表到账，也不能因有该接口就宣称PC已接会话。

### CONTRACT-01 声明一致性

| 接口/模型 | 当前差异 | 请后端确认 |
| --- | --- | --- |
| U `POST /recharge/page`及充值create/address | asset的required与“默认USDT”说明不一致 | 每个入口是否必传、缺省行为、只允许USDT的错误码；同步Swagger。前端当前显式传USDT |
| O `POST /orders/procure` / `purchaseVouchers` | 描述要求1–6张，minItems声明不足 | 真正拒绝0张和超过6张，HTTPS、单号长度和重复提交规则；同步schema与实际校验 |

### QA-01 新状态隔离样本

无需向前端交付凭据明文；在既有测试账号安全配置后提供记录ID、角色和可执行动作。

| 样本 | 接口及页面 | 必须能验证 |
| --- | --- | --- |
| 至少2组不同价/库存/启停/图片的SKU，含超安全整数ID与高精度金额 | O商品create/update/detail、秒杀enroll；买手商品、详情、购物袋/结算 | 编辑保留旧ID；删/停用后历史订单快照；并发价格库存变化、模式切换限制 |
| PROCURING/PROCURED/SHIPPED及AFTERSALE_CONFIRM | O订单sold/detail/procure/ship、refunds/confirm；买手订单/售后 | can*随账号和状态变化；已采购再发货；卖家意见不直接动账 |
| PENDING_AUDIT/IN_AUDIT | O商品my/page，后台claim/release/audit | 领取归属、释放、重新送审和撤权 |
| NOT_FOUND/PROCESSING/CREATED/REJECTED原键 | O `GET /orders/by-key`，结算恢复 | 只读不建单；同键异参、整批回滚、跨账号隔离；CREATED完整回执 |

## P1：新版功能差异和正式内容

### B03 评价搜索与主题

已接：O `POST /storefront/reviews/page`中的星级、有图、正文keyword和四种sortBy；`PUT /reviews/helpful`及权威helpful/helpfulCount。

仍缺：

- v47关键词包含评价正文、作者名称及购买规格文字；当前keyword明确只查正文。请扩展或给出可组合的正式条件并声明分页total，不能让前端只过滤当前页。
- v47主题来自原型评价标签；当前topic仅`QUALITY/LOGISTICS/SERVICE/VALUE`，不能直接替换为另一套可见标签。请对齐标签与写入、分页、summary.topics全量计数的契约。
- 返回SKU快照时使用历史购买规格，不从现商品推造。评价主题由用户实际选择，不按正文猜测。

相关页面：商品详情评价区及评价提交。当前没有把不匹配的主题强行开放；仅正文搜索的范围有明确提示，不能标记原型完整搜索已验收。

### B07 正式帮助/协议/公告

已接：N `POST /content/help/page`、`GET /content/help/detail`、`GET /content/agreements/current?kind=`、`POST /content/announcements/page`、`GET /content/announcements/detail`。

请Ray/内容负责人交付并审核发布：

- 用户、隐私、服务、KYC、AML五类协议正文；`code/kind`、`contentVersion`、`publishedAt/effectiveAt`及受众PUBLIC/LOGGED_IN。
- 七类帮助的正文及主题编码。既有入口`pay/delivery/return/buyer`原样透传；购物指南、求购指南、钱包支付的编码尚未确认，前端保留标签但禁用。不要只给`orders`示例要求前端猜映射。
- 正式公告及发布/下线流程。列表不带正文，详情必须能按ID读取；最新协议下线不能静默回退旧版。

本轮游客只读：品牌、帮助、公告返回HTTP200/code1空分页；用户协议返回`-322`暂无有效协议。前端保留真实空态/未发布状态，不伪造内容；清洗正文并限制链接协议。本期未要求新增保存同意版本接口。

### QA-02 其他已接能力的非空联调

| 编号 | 已接页面与接口 | 还需要验证条件 |
| --- | --- | --- |
| B01 | `/brand`、商品卡/规格参数、买手品牌选择；O品牌page/detail、商品brandId/brand | 启用和停用品牌、关联商品、深页/搜索、编辑清品牌及旧停用关联样本 |
| B04 | 商品评价投票；O `PUT /reviews/helpful`、公开reviews/page | 普通登录顾客给他人评价投票、重复/取消、-305繁忙和丢响应；不能用仅作者/卖家可见的私有详情作恢复 |
| B09 | 顾客/买手订单搜索；O bought/page、sold/page的orderNo/productTitle | 同状态多页、空结果、精确订单号、模糊标题、权限边界和筛选计数；分类申请keyword需含理由 |
| B11 | `/finance`每日预估；U `GET /finance/orders/overview` | 全量跨页持仓、未起息/到期/提前赎回、24小时边界、合法零及失败；返回dailyExpectedInterest/estimatedAt/estimateUntil |
| B12 | 商品卡/图库/收藏页与卖家卡；O favorites/status、favorite POST/DELETE、sellers/qualification | 账号切换、深页收藏、丢响应、跨页更新；认证买手/冻结/撤销/非买手，不以销量或访问者角色推断 |

## P2：本期保持既定范围

- **B10 AI**：明确延期，保持未开放，不接固定回复冒充真实导购。
- **B06运营**：首页和专题固定v47内容继续保留；需要动态运营时另确认字段与发布权限。
- **USDC**：矩阵可返回禁用项，不开放充值、兑换或提现；未来独立记账/折算规则需另立契约。

## 交付和验收口径

按“部署版本/配置 → 隔离样本 → 页面读写 → 订单及钱包回读”推进。契约存在、API封装、页面调用、真实业务验证四层分别记录，不能合并成已验收。浏览器、像素、动画及资金验证按当前安排后置；类型/现有测试/构建通过只证明对应代码检查通过。本轮未安装依赖；本次按明确请求同批保存代码、任务单和当前承接信息，仅推送`feat/pc-ui-v47`，不合并main或发布。
