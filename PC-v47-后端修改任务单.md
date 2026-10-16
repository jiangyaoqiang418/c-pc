# PC v47 后端剩余交付任务单

更新：2026-10-16。范围仅 `c-pc / main`，对接起点 `9402721`（v47 已合并并推送 main）。依据[今早后端回复](./PC-v47-前端对接说明-20261016.md)、当前代码及 live OpenAPI/公开接口复核整理；原始需求保存在[后端清单](./PC-v47-backend-requirements.md)，前次回复见[适配交付](./PC-v47-后端适配交付.md)。本批适配按用户随后明确授权提交并推送main。

**不重复建设已接接口。** 充值 asset 默认值、采购凭证声明、评价三域搜索及七类帮助编码已确认。公开回读已验证多 SKU/启停/零库存、启用品牌/停用品牌旧关联、评价正文/公开作者/历史规格搜索和匿名脱敏检索。原键、采购、售后、持仓等隔离样本已由后端提供，登录态及写入尚未由本轮验证；正式内容和链上资金仍有外部条件。

服务前缀：O=`/api/order`，U=`/api/user`，N=`/api/notify`。ID保持原值；金额按十进制字符串、最多28位整数/8位小数处理。

## 优先级总表

| 优先级 | 编号 | 剩余交付 | 对应页面 | 当前阻塞 |
| --- | --- | --- | --- | --- |
| P0 | ENV-01 | 运行容器元数据及存量库升级证据 | 结算、买手商品/订单/售后、充值 | 后端已报发布目标SHA/时间及升级完成；仍需运行镜像/配置版本、增量脚本和执行结果 |
| P0 | B05 | 测试网络、USDT合约、确认数、地址及链服务配置 | `/wallet/deposit`、充值详情/记录/钱包流水 | 前端能按矩阵选择方式，缺可验收链配置和隔离资金 |
| 已解决 | CONTRACT-01 | 充值asset及采购凭证声明已一致 | 充值与`/buyer/orders`采购弹窗 | 前端现有显式USDT、1–6张HTTPS、长度校验继续复用，新增契约断言通过 |
| P0 | QA-01 | 使用已交付隔离样本完成联调 | 商品、购物袋、结算、订单及买手面板 | 先配置对应角色、回读现态并约定消耗样本操作人；不再笼统要求创建样本 |
| P1 | B03 | 六类评价主题与v47对齐 | `/product/:id`评价区、写评价 | 三域搜索已实测；主题名称/编码、写入和旧数据处理仍待确认 |
| P1 | B07 | 正式正文、版本、生效时间及受众 | `/help`、协议弹窗、`/announcement`、结算协议入口 | 七类编码已确认；正式内容仍空、五类协议无有效版本，Ray待交付 |
| P1 | QA-02 | 使用已交付品牌/投票/收藏/持仓样本联调 | 品牌专区、商品卡/详情、`/finance` | 品牌公开读取已验，登录态/跨页/权限/写入仍待验证 |
| P2 | B10/B06/USDC | 本期延期或固定范围维持 | AI导购、首页专题、充值币种 | 不据此要求重复建设现有接口 |

## P0：发布和真实交易前提

### ENV-01 实际发布及历史数据

后端报告发布目标 `c4afff49c8c2bf2bc43afe00f5ee51a8a7a7a517`，四服务于北京时间2026-10-16 08:37:14返回新版契约；本轮 live 契约和公开行为已印证相关整改。运行容器元数据未直接读取，存量库升级仅有完成说明，以下证据仍需补齐：

- order/user/notify/admin运行镜像对应SHA、构建时间、启动时间及加载配置版本；区分发布目标提交和实际容器取证。
- 在既有数据库上的增量迁移脚本/执行顺序、回滚边界和结果。空库init.sql通过不能证明存量库已升级。
- 缺采购信息的旧已支付订单由卖家补真实凭证再发货（已明确）；旧商品费用、SKU/审核记录升级后的处理及执行结果仍不能由前端猜测或自动清理。
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

| 接口/模型 | 2026-10-16确认结果 | 前端处理 |
| --- | --- | --- |
| U `POST /recharge/create/page`、GET address | create/page省略默认USDT，显式null/空/非法值-300；address省略/空默认USDT。live schema已一致 | 保持显式USDT；检查可选/default/唯一枚举，不能开放USDC |
| O `POST /orders/procure` / `purchaseVouchers` | live minItems=1/maxItems=6，每项HTTPS无空白且≤1024，purchaseNo≤128；后端报告实际拒绝校验通过 | 复用现有表单规则，增加契约断言；同序凭证参与幂等，异参不覆盖。真实写入尚未复验 |

### QA-01 新状态隔离样本

记录ID、角色及可执行动作已在[后端回复第六节](./PC-v47-前端对接说明-20261016.md)提供；账号通过既有安全渠道配置，不在仓库保存密码。公开SKU/品牌已回读，其余需对应登录态；采购、售后确认、审核领取、PROCESSING恢复会改变或消耗样本。必须先确认操作人，按最新详情执行，不能直接运行文档示例。PROCESSING为构造的中断样本，不证明真实网络故障恢复；CREATED是创建回执，订单超时取消不改变该创建结果，也不证明付款。

本机前置条件：用户于10月16日确认新样本账号**未配置**；既有本地配置记录的顾客/买手ID与新样本不同，且缺outsider。下一步先通过既有安全渠道配置customer、seller、outsider，并按需配置frozen/revoked；reviewerA/B仅用于后台。不得用旧账号的空结果证明新样本不存在，不把密码或令牌放进聊天/仓库，也不批量试登录其他账号。

| 样本 | 接口及页面 | 必须能验证 |
| --- | --- | --- |
| 至少2组不同价/库存/启停/图片的SKU，含超安全整数ID与高精度金额 | O商品create/update/detail、秒杀enroll；买手商品、详情、购物袋/结算 | 编辑保留旧ID；删/停用后历史订单快照；并发价格库存变化、模式切换限制 |
| PROCURING/PROCURED/SHIPPED及AFTERSALE_CONFIRM | O订单sold/detail/procure/ship、refunds/confirm；买手订单/售后 | can*随账号和状态变化；已采购再发货；卖家意见不直接动账 |
| PENDING_AUDIT/IN_AUDIT | O商品my/page，后台claim/release/audit | 领取归属、释放、重新送审和撤权 |
| NOT_FOUND/PROCESSING/CREATED/REJECTED原键 | O `GET /orders/by-key`，结算恢复 | 只读不建单；同键异参、整批回滚、跨账号隔离；CREATED完整回执 |

## P1：新版功能差异和正式内容

### B03 评价搜索与主题

已接：O `POST /storefront/reviews/page`中的星级、有图、三域keyword和四种sortBy；`PUT /reviews/helpful`及权威helpful/helpfulCount。公开实测正文、作者、历史规格分别total=1，冲突星级total=0；匿名评价仅脱敏名称命中，真实昵称不命中。前端保留原搜索框占位文案，已更正过时的正文限定提示。

仍需后端确认的主题契约（可直接评估实施，建议编码尚未进入前端枚举）：

| v47原始可见标签 | 建议稳定编码（后端待确认） |
| --- | --- |
| 使用体验 | USAGE_EXPERIENCE |
| 商品质感 | PRODUCT_TEXTURE |
| 规格说明 | SPEC_DESCRIPTION |
| 尺码感受 | SIZE_FIT |
| 物流包装 | LOGISTICS_PACKAGING |
| 买手服务 | BUYER_SERVICE |

原型依据：Umaomao-v47/dist/reviews.js的tags/topicCount/filtered及reviews-demo.js中的标签。名称保持原样，编码仅为技术提案。

1. 列表一次选择一个按钮：全部、有图或某个主题；星级和keyword仍可组合。全部/有图不作为主题编码写入评价。当前前端只有全部/有图，六类主题暂不伪造开放。
2. 标签来自该商品全部公开评价，summary提供稳定code、label、顺序及全量count；不从当前页推导，不因keyword/星级筛选改变汇总。无公开评价的标签不伪造数量；排序规则由后端明确，避免翻页变序。
3. 原型数据为tags数组，但当前样例每条单标签。建议本期提交可空单选、由评价人明确选择；这是生产写入建议，需后端确认，不能声称原型要求多选。缺失的生产选择控件沿用v47组件样式，确认前不新增选择器。
4. 同步确认`/reviews/create`、公开及本人/卖家评价返回、`/storefront/reviews/page`、`/storefront/reviews/summary`。明确未知编码的拒绝行为、允许的写入字段和历史回读兼容。
5. 对已有QUALITY/LOGISTICS/SERVICE/VALUE记录提供后端历史处理方案；不能由前端把QUALITY改名为商品质感、按正文推断主题、将VALUE塞进不相关标签或清掉旧评价。
6. 保留历史skuId/skuSpecs和公开匿名快照；不由当前商品或真实昵称补造。验收覆盖六类标签、单选切换/全部/有图、跨页total、全量计数、历史枚举及匿名搜索。

### B07 正式帮助/协议/公告

已接：N `POST /content/help/page`、`GET /content/help/detail`、`GET /content/agreements/current?kind=`、`POST /content/announcements/page`、`GET /content/announcements/detail`。

请Ray/内容负责人交付并审核发布：

- 用户、隐私、服务、KYC、AML五类协议正文；`code/kind`、`contentVersion`、`publishedAt/effectiveAt`及受众PUBLIC/LOGGED_IN。
- 七类帮助正文。编码已确认：`pay/delivery/return/buyer/shopping/demand/wallet`；前端已绑定新增三类，并按当前账号可读取的已发布记录启用新入口。空内容继续禁用，失败保持未知；不将七类统一为orders，不修改原型标签。
- 正式公告及发布/下线流程。列表不带正文，详情必须能按ID读取；最新协议下线不能静默回退旧版。

本轮公开只读：帮助、公告HTTP200/code1空分页；user/privacy/service/kyc/aml五类协议均为`-322`暂无有效协议。前端保留真实空态/未发布状态，不伪造正文；清洗HTML并限制链接协议。本期未新增保存同意版本接口。结算现有勾选及协议链接不等于已保存同意版本；不自行加入新的同意留痕服务或在无正文时宣称协议验收通过。

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

按“运行证据/配置 → 对应账号和现态 → 页面读写 → 权威回读”推进。四层状态分别记录。后端报告42项本地测试和102项发布检查通过，不能代替PC页面、真实断网或资金验收。本轮只做已明确的前端适配、公开只读和帮助页定向验证；不改变H5/后台、不安装依赖、不执行资金或消耗样本写入。按用户随后明确授权提交并推送main；像素/动画整站验收仍按后续安排执行。
