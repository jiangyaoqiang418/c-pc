# PC v47 后端适配交付

更新日期：2026-10-15。对应前端《PC-v47-后端修改任务单》。本次代码位于本机 Ecommerce 工作区，尚未提交、推送或部署；运行中的 Swagger 不代表这些改动已经发布。

## 1. 逐项结论

| 编号 | 处理结果 | 交付与边界 |
| --- | --- | --- |
| C01 | 已新增 | 下单原键只读回查、持久化创建状态、同键异参拒绝、事务内原子创建与恢复 |
| B02 | 已新增 | 真实规格组和 SKU；规格价格/库存/启停/图片；订单与评价规格快照；秒杀绑定具体 SKU |
| C02 | 已调整 | 金额输入精度校验、十进制字符串输出、未知费用拒绝购买、权威价格核对 |
| B05 | 按确认范围调整 | 仅已配置授权合约的 USDT 组合可开放；USDC 始终禁用，无兑换和 USDC 提现；链上实测待安排 |
| B08 | 已新增 | 采购完成、卖家售后确认、审核领取/释放三个独立业务流程 |
| B01 | 已新增 | 品牌目录、后台维护、商品关联及公开品牌筛选 |
| B03 | 已调整 | 评价关键词/主题/排序、数据库分页 total、商品全量主题计数 |
| B04 | 已新增 | 按目标状态设置帮助投票，返回权威计数与本人状态 |
| B07 | 已新增读取契约，正式内容待提供 | 帮助/协议/公告及版本、发布、受众规则；**正式文本、版本、生效时间找 Ray 确认**，未放入演示条款 |
| B09 | 已调整 | 订单号精确查询、商品标题模糊查询；分类申请关键词包含申请理由 |
| B11 | 已调整 | 总览增加全部持仓未来 24 小时新增利息预估；分批读取且保持一致性快照 |
| B12 | 已新增 | 本人收藏批量权威查询、公开卖家资格；收藏目标状态写入增加并发控制 |
| B10 | 明确延期 | AI 导购本期不开放，保留未开放状态 |
| B06 | 固定内容 | 首页装饰、专题使用前端固定内容；已有 Banner 继续复用，品牌读 B01 |
| E01 | 待专项联调 | Telegram Bot、授权域名/OAuth 来源未调整，不能据历史报错认定当前故障 |
| E02 | 待账号验收 | 买手资格读取使用实际买手档案、账号状态、角色；正式测试账号仍需确认 |
| E03 | 部分验证 | 已用隔离数据库与自动化测试覆盖新增核心逻辑；完整 C 端跨页、媒体、KYC、IM 等样本验收另行安排 |
| E04 | 待明确测试资金边界 | 未使用真实资金，未执行真实转账、提现或链上充值；不能将本次测试视作到账验收 |

## 2. 公共契约

- 服务前缀：O=`/api/order`，U=`/api/user`，N=`/api/notify`，A=`/api/admin`；下文路径均相对于服务前缀。
- 统一响应：`{ "code": 1, "message": "操作成功", "data": ... }`。失败根据 `code` 分支，提示使用 `message`。业务失败通常为 `-1`，未登录 `-200`，无权限 `-202`，系统故障 `-2`。
- 分页继续使用 `pageNo/pageSize` 与 `PageResult`，total 与当前完整过滤条件一致。Long ID、Long 时间戳、Long 计数和 BigDecimal 金额以字符串输出，不能转成 JS Number 后再保存。
- 新接口和新增字段已补充 OpenAPI 注解。下文示例只说明结构，示例 ID、品牌、地址和媒体不代表现有可用数据。
- 所有写入都须使用当前账号；后台操作员工由服务端注入。新增公开内容与品牌浏览明确放行，收藏状态、投票、交易和钱包仍需登录。

## 3. C01：下单结果恢复

`GET O /orders/by-key?idempotencyKey=checkout-001`，仅回查当前登录买家。

```json
{
  "code": 1,
  "data": {
    "status": "CREATED",
    "orderGroupNo": "1970000000000000000",
    "orderIds": ["1970000000000000001", "1970000000000000002"],
    "rejectionCode": null,
    "rejectionMessage": null
  }
}
```

| status | 含义 | 前端行为 |
| --- | --- | --- |
| NOT_FOUND | 当前尚未找到订单或创建记录 | 不能证明在途请求不会创建；继续用原键原参数查询或重试，不换键重复下单 |
| PROCESSING | 请求已登记，正在执行或等待原键恢复 | 继续回查；原键原参数再次创建可恢复未知失败 |
| CREATED | 整批订单已提交 | 使用完整 orderIds 和 orderGroupNo 回读详情 |
| REJECTED | 已确定业务拒绝，订单事务已回滚 | 显示 rejectionCode/message；同键重试返回原拒绝，不重新创建 |

创建仍使用 `POST /orders/create` 和 `POST /orders/create-batch`。单笔和批量共用同一买家的键空间。键最多 64 字符，首尾空白归一化后区分大小写；没有自动过期时间。地址、备注、商品/SKU/数量/秒杀场次、确认单价均属于请求身份；商品项顺序不改变身份，数量省略等价于 1，数值相等的确认价等价。异参复用返回 `-311`。并发处理中或状态竞争返回 `-321`，按原键回查。

不传键仍可创建，但响应丢失不能用该接口恢复。HTTP 参数校验或鉴权失败、尚未进入业务的方法调用不会登记创建记录。查询接口不创建订单、不推进状态。批量任一商品失败，整批订单和库存回滚；失败结果独立保存。未知异常保留 PROCESSING。持久化状态和订单创建成功在同一事务提交。

## 4. B02：规格与 SKU

商品创建/编辑沿用 `POST O /products/create`、`PUT O /products/update`。新增字段：

| 字段 | 规则 |
| --- | --- |
| brandId | 可空，关联启用品牌 |
| specGroups | 无规格留空或空数组；最多 3 组；每组 name 和非空 options，名称和选项不可重复 |
| skus | 规格商品必传，最多 200 个，每项必须选择每个规格组的一个有效选项；允许只提供部分组合 |
| skus[].id | 新增为空；编辑保留原 ID；原 ID 不可换成另一种组合 |
| skus[].specs | `{name,value}` 数组，完整规格组合 |
| skus[].price | 必传，正数 USDT，28 位整数/8 位小数以内 |
| skus[].stock | 必传，非负整数；商品聚合库存不能超出 Integer 上限 |
| skus[].enabled | 必传；至少一个 SKU 启用，停用不可下单 |
| skus[].image | 可空；非空为 HTTPS 图片地址，空时使用商品封面 |

```json
{
  "specGroups": [{"name":"颜色","options":["黑","白"]}],
  "skus": [
    {"id":null,"specs":[{"name":"颜色","value":"黑"}],"price":"99.90000000","stock":5,"enabled":true},
    {"id":null,"specs":[{"name":"颜色","value":"白"}],"price":"109.90000000","stock":0,"enabled":true}
  ]
}
```

这是追加到原商品表单的字段片段；原有标题、分类、图片、售后等必填项继续保留。商品读取返回 `hasSku/specGroups/skus`。规格商品的商品级 `price` 是启用 SKU 最低价，`stock` 是启用 SKU 库存之和，不能据最低价直接购买任意规格。无规格商品仍必须填写商品级 price/stock。

单笔与批量每项新增 `skuId`、`confirmedUnitPrice`。规格商品两者必传；无规格商品不得传 skuId，确认单价可传。秒杀时确认价是该场次该 SKU 秒杀价。

```json
{
  "productId":"9002",
  "skuId":"9003",
  "confirmedUnitPrice":"99.90000000",
  "quantity":2,
  "addressId":"3001",
  "idempotencyKey":"checkout-001",
  "remark":"请妥善包装"
}
```

批量使用原 `items` 数组，每项同样携带 skuId/confirmedUnitPrice。不存在、停用、归属错误或漏选规格返回 `-318`；库存不足/竞争返回 `-319`；商品不可售 `-320`；价格变化 `-312`。

订单保存 SKU ID、规格文本、成交单价和图片快照；评价从订单复制规格快照。编辑或移除商品规格不改写历史快照。商品编辑省略已有 SKU 表示移除；已删除规格不会在订单取消时自动重新上架，停用规格回补自身库存但不计入可售总库存。无规格与规格模式切换须不存在未完成订单或有效秒杀报名。

秒杀报名新增 skuId；规格商品必须选定 SKU，场次内仍是一件商品一条报名。同一商品的其他 SKU 不享受该条秒杀。规格秒杀同时扣减真实 SKU/商品库存及秒杀限量；无规格秒杀继续使用现有独立限量规则。规格商品不能用商品级快捷改价，应通过编辑维护 SKU 价格。

## 5. C02：金额与费用

- 账本和交易单位为 USDT。金额输入接受 JSON 十进制字符串或数值，建议全程使用字符串；科学计数法可解析，但仍须满足同样精度及范围限制。
- 金额入参最多 28 位整数、8 位小数，最大 `9999999999999999999999999999.99999999`。超精度/超限输入明确拒绝，不静默截断。
- 售价、支付、充值、提现、押金、申购等正金额最小有效单位为 `0.00000001`；运费、税费允许 `0`。业务和链配置可进一步限制最小/最大金额。提现还要满足该链有效精度，不能链上精确表示的金额返回 `-308`。
- 所有 BigDecimal 输出为普通十进制字符串，不使用科学计数法。内部计算收敛到 8 位小数，向下取整；已有业务钱包入金为支付覆盖应付金额按链精度向上取整，多余部分留余额，出金不向上取整。
- 商品写入时 shippingFee/taxFee 省略按原约定存为确定的 0。读取时 null 表示未知，不能当成 0。订单创建检查售价、运费、税费已知，旧商品费用缺失需要后台补齐后再购买。
- 总额按 `成交单价 × 数量 + 运费 + 税费` 计算，费用每个订单项收取一次。普通商品确认价传入时也核验。付款继续要求 confirmedAmount 与服务端订单当前 totalAmount 一致，变化返回 `-312`。

## 6. B08：采购、售后和审核领取

### 订单采购

付款后 `status=PAID, stage=PROCURING`。卖家调用：

`POST O /orders/procure`

```json
{"id":"9001","purchaseNo":"PO20261015001","purchaseVouchers":["https://cdn.example.com/proof.jpg"]}
```

采购单号必填，最多 128 字符；采购凭证必填 1–6 张 HTTPS 地址。成功写入 procuredAt，此时 `status=PAID, stage=PROCURED`。同单号、同凭证重复提交幂等；完成后不能用另一套凭证覆盖，返回 `-311`。

`POST /orders/ship` 只允许已采购订单，采购单号和采购凭证不再放在发货入参中。发货后 stage=SHIPPED。签收、买家确认收货仍走原物流/确认收货接口。OrderDTO 新增 `stage/procuredAt/canProcure/canShip/canConfirmAftersale`，按钮资格按当前访问账号计算，服务器仍执行最终权限检查。

阶段枚举：`CREATED/PROCURING/PROCURED/SHIPPED/AFTERSALE_CONFIRM/REFUND_REVIEW/REFUNDED/COMPLETED/CANCELED`。订单 status 保留 PAID 表达已支付未发货，采购细分使用 stage。

### 售后

申请退款后退款单 `CONFIRMING`，订单 `AFTERSALE_CONFIRM`。卖家调用：

`POST O /orders/refunds/confirm`

```json
{"refundId":"9101","agree":true,"remark":"已核实，同意退款"}
```

agree 必填，说明必填且最多 500 字符。卖家意见只作为平台审核依据，agree=true/false 均转退款单 `APPLYING`、订单 `REFUND_REVIEW`，此操作不动账。相同意见重复提交幂等，不同意见重复确认返回 `-311`。响应及退款详情带 `sellerAgree/sellerRemark/sellerConfirmedAt`。

平台可在卖家确认前介入审核。买家在两个未终结阶段均可撤销。平台驳回或买家撤销恢复申请前状态，采购完成时间保留，发货后的收货倒计时按暂停时长顺延。沿用现有超时自动同意规则：从 appliedAt 起累计，默认 72 小时、以 `zusi.order.refund-review-ms` 配置为准，卖家确认与平台审核共用该期限，卖家确认不重置计时。

### 商品审核

提交商品后 `status=REVIEWING, auditStage=PENDING_AUDIT`。

- `PUT A /products/audit/claim`，body `{"id":"9002"}`：领取后 `IN_AUDIT`，记录 auditAssigneeId/auditClaimedAt。
- `PUT A /products/audit/release`，相同 body：仅领取人可释放，回到 PENDING_AUDIT。
- 现有商品审核接口仅允许领取人完成审核；三个操作均使用 `product:review` 权限。

同一员工重复领取幂等，其他员工领取或审核被拒绝；并发版本冲突返回业务失败，刷新后再操作。没有自动转交或自动超时释放。商品重新编辑送审清空领取人与上次结论。

订单分页传 stage，商品分页传 auditStage；与其他条件取交集。各 Tab 的权威数量使用同条件分页 total，不从当前页或经营指标猜测。公开商品不会暴露审核员工信息。

## 7. B01、B03、B04、B09、B12：查询和交互

| 能力 | 正式接口 / 变化 | 规则 |
| --- | --- | --- |
| 品牌目录 | `POST O /storefront/brands/page`，body 为 BrandPageQuery | pageNo/pageSize、keyword 名称模糊；只返回启用品牌；sortOrder、id 升序 |
| 品牌详情 | `GET O /storefront/brands/detail?id=` | 停用/不存在均业务失败 |
| 品牌维护 | `POST A /brands/page`、`POST /brands/create`、`PUT /brands/update` | 权限 brand:list/create/edit；SaveDTO：id、name、aliases、logo、enabled、sortOrder；新增 id 空，编辑必传；name/启停/排序必填 |
| 商品品牌 | 商品读写新增 brandId，读取新增 brand；`PublicProductPageQuery.brandId` | ID 稳定；名称大小写不产生重复品牌；无品牌为空；已关联停用品牌仍如实返回 enabled=false，不能新关联/进入停用专区 |
| 公开商品 keyword | 原商品列表接口 | 仍仅搜索商品标题，不隐含搜索品牌或分类；品牌/分类用相应 ID 条件；推荐/热销/新品带相同品牌信息 |
| 评价搜索 | `POST O /storefront/reviews/page` | 在 productId、productScore、hasImage 上追加 keyword（评价正文模糊）、topic、sortBy，全部条件在数据库组合分页 |
| 评价主题 | `ReviewSubmitQO.topic` 可空 | QUALITY质量/LOGISTICS物流/SERVICE服务/VALUE性价比，由评价人实际选择，不根据内容自动编造；每条评价最多一个主题 |
| 评价排序 | sortBy | NEWEST 默认；MOST_HELPFUL 帮助数降序；SCORE_DESC 评分降序；SCORE_ASC 评分升序；同值均按 createdAt、id 降序 |
| 评价汇总 | `GET O /storefront/reviews/summary?productId=` | 新增 topics 数组 `{topic,count}`，统计该商品全部已发布且未删除评价，不受列表搜索条件影响；筛选后数量看分页 total；未出现主题不返回计数项 |
| 帮助投票 | `PUT O /reviews/helpful` | body `{"reviewId":"9201","helpful":true}`，helpful 为目标状态；登录必需；重复不加计数，false 取消；返回 reviewId/helpful/helpfulCount |
| 投票读取 | ReviewDTO.helpfulCount/helpful | count 权威总数；游客 helpful=null，登录后 true/false；隐藏或删除评价拒绝继续投票；忙碌返回 -305，可按原目标状态重试 |
| 订单搜索 | `POST O /orders/bought/page`、`/orders/sold/page` | orderNo 精确、productTitle 模糊，与 status/stage 取交集；账号归属由后端强制；createdAt、id 降序 |
| 分类申请搜索 | 原分类申请分页 keyword | 覆盖申请人、新分类名称、申请理由；“我的”分页仍只读本人 |
| 本人收藏态 | `POST O /products/favorites/status` | body `{"productIds":["9002","9003"]}`，必填 1–200 个 ID，返回去重后的 `{productId,favorited}` 数组；登录必需，游客 -200 |
| 收藏设置/取消 | 原 `POST/DELETE O /products/favorite` | 保持目标状态幂等，按商品锁与事务更新关系及计数；响应丢失使用批量状态接口回查 |
| 卖家资格 | `GET O /storefront/sellers/qualification?sellerId=` | 游客可读；返回 sellerId/verifiedBuyer/approvedAt。买手档案 ACTIVE 且已审批、账号正常、具备 BUYER 角色才为 true；冻结、撤销立即返回 false/approvedAt=null |

收藏批量查询反映关系本身，不用商品收藏总数或收藏第一页推断。商品是否可售仍读取商品详情。卖家资格当前没有固定到期时间，不以评分、销量或浏览者自己的角色推断。

## 8. B05：USDT 充值范围

`GET U /recharge/assets` 返回 ETH/TRON/BSC × USDT/USDC 六个组合。USDC 的 enabled=false，methods 为空、无授权合约和收款地址。仅 enabled=true 可以继续。

USDT 项字段：asset、chain、label、enabled、tokenContract、decimals、minAmount、minConfirmations、walletNetwork、memoRule、methods。methods 为 ADDRESS/DECLARATION/WALLET；是否提供专属地址、钱包能力由真实配置决定。memoRule=ADDRESS_RESPONSE 表示使用实际地址/申报单返回的备注规则。

- `GET /recharge/address?asset=USDT&chain=TRON`：只提供本人专属地址；切资产/网络必须清空旧地址/二维码并重新读取。
- `POST /recharge/create`：新增 asset，默认 USDT；仍传 chain、amount、idempotencyKey。其他资产拒绝。
- `POST /recharge/page`：新增 asset（默认 USDT）及 chain 筛选。详情、by-key、分页均返回 asset/chain；取消按本人 rechargeId 定位原记录。
- 详情新增 source、reportedTxHash、logIndex、tokenContract、confirmations、minConfirmations。source 为 WALLET（已上报钱包哈希）、ADDRESS（自动归集建单）、DECLARATION（申报单）。申报到账匹配后仍归属原申报记录。
- confirmations 是已接收到账记录的确认数快照；未知可为 null，不是实时链上进度订阅。未达到确认阈值不会入账；不能用 reportedTxHash 或钱包弹窗成功认定余额增加。最终以 CONFIRMED 和余额/流水回读为准。
- 唯一链上身份仍为 chain+txHash+logIndex；同笔事件不重复入账，业务余额流水另有 bizNo 幂等。金额申报原键也按当前用户隔离。
- 未配置 USDT 合约不开放充值；地址与回调合约必须匹配授权合约，TRON 区分大小写。回调确认数必须达到配置阈值。
- 仅有共享地址时 methods 只含 DECLARATION，必须先申报，再读取该申报单的地址及 memo 转账；不能把共享地址展示为无需备注的专属地址。

当前所核对 develop Nacos 配置未提供完整 token-contract、min-confirmations、wallet-network、充值地址/链上服务配置，本次未擅自补主网合约或启用通道。应由运维确认测试网络、合约、精度、确认数与链服务凭据后联调。

**TronLink：** 继续使用 `POST U /tronlink/sessions/create` 与 `GET /tronlink/sessions/detail?actionId=`。创建入参增加 asset（默认且仅允许 USDT）；返回增加 asset=USDT、chain=TRON，具体网络仍以 chainId 区分。SUCCESS 仅表示钱包确认，rechargeId 为空表示尚未关联到账，不得触发余额增加。保留现有会话过期、限流、订单支付哈希补交规则。本次已接入本地主分支漏同步的现有实现，并验证结果语义，未执行手机钱包真实转账。

## 9. B07：正式内容读取和发布契约

| 接口 | 入参 | 结果 |
| --- | --- | --- |
| `POST N /content/help/page` | pageNo/pageSize、可选 topic/keyword | 生效帮助分页，keyword 搜索标题 |
| `GET N /content/help/detail?id=` | 帮助 ID | 正文详情 |
| `GET N /content/agreements/current?kind=user` | user/privacy/service/kyc/aml | 当前协议版本及正文 |
| `POST N /content/announcements/page` | pageNo/pageSize、可选 keyword | 公告分页 |
| `GET N /content/announcements/detail?id=` | 公告 ID | 公告正文 |

PublicContentVO 字段：id、contentType、code、topic、title、body、contentVersion、status、audience、sortOrder、pinned、publishedAt、effectiveAt。列表不返回正文，body=null。按置顶、sortOrder、publishedAt、id 排序。

数据位于 notify 的 `t_public_content`。审核发布流程须填入正式版本、发布时间、生效时间和受众；状态 DRAFT/PUBLISHED/OFFLINE，受众 PUBLIC/LOGGED_IN。本期没有新增 CMS 后台写接口；可由审核后的静态内容清单受控入库。每次正式修订使用新 contentVersion，禁止原地覆盖已发布正文，数据库唯一约束为内容类型+编码+版本。该版本规范是发布流程约束，不是数据库对任意手工 SQL 的防篡改保证。

游客仅访问 PUBLIC；登录后可以读取 LOGGED_IN。个人通知继续使用原通知接口。仅 PUBLISHED 且发布时间、生效时间均已到达的内容可读。当前协议按最新已生效版本选取；最新版本下线不回退旧协议。结算链接读取 current 的 kind/contentVersion/effectiveAt。本期没有确认“保存用户同意版本”的业务需求，因此未增加同意接口或前端步骤。

内容不存在 `-322`，未发布/未生效 `-323`，下线 `-324`，无受众权限 `-202`，系统读取失败 `-2`；列表无内容为正常空分页。正文复用 HTML 白名单清洗，移除脚本、事件、表单和 iframe，链接允许 http/https/mailto。正式发布前仍需审核正文和链接目标。

**待办回复：正式帮助、用户/隐私/服务/KYC/AML 协议、公开公告的文本、版本和生效时间，找 Ray 确认。当前未发布任何自行编造的正式内容。**

## 10. B11：小金库预估口径

`GET U /finance/orders/overview` 新增：

```json
{"dailyExpectedInterest":"0.20000000","estimatedAt":"1792022400000","estimateUntil":"1792108800000"}
```

覆盖当前用户全部 HOLDING 持仓，按每笔 `截至未来24小时的累计应计利息 - 当前累计应计利息` 求和。计息按起息时刻起每满 24 小时、年率除以 365、到期天数封顶；使用 UTC 毫秒经过时长，不按某个时区的零点分界，不受夏令时影响。未起息、已到期、已提前赎回边界按当前持仓状态与原计息规则计算；不预测未来新增申购或赎回。每笔累计利息按原规则保留 8 位向下取整，再计算增量。

合法无持仓返回 `0.00000000`；读取失败仍为失败，不用 0 掩盖故障。expectedInterest 仍是预计到期收益。服务端按 500 条分批处理全部持仓，同一数据库事务内保持一致性快照，不受前端页码影响。

## 11. 数据库、验证与接入顺序

测试库已实际执行：

- order 新建 t_brand、t_product_sku、t_order_creation、t_review_helpful；商品、订单、退款、评价、秒杀表补齐字段；品牌/审核阶段索引；下单原键统一区分大小写。
- notify 新建 t_public_content。
- admin 登记 brand:list、brand:create、brand:edit 权限目录，未给任何人员额外授权。
- `sql/order/init.sql`、`sql/notify/init.sql`、`sql/admin/init.sql` 已同步终态；没有新增 task.sql，没有清理历史业务数据。

验证记录：

- 已使用 JDK 17 执行全仓 `mvn -q test`：30 项通过，0 失败、0 错误、0 跳过，其中 4 项使用真实 MySQL 隔离库。普通本机执行未设置集成环境时会跳过这 4 项；重跑需向测试进程提供 V47_TEST_JDBC_URL、V47_TEST_DB_USER、V47_TEST_DB_PASSWORD，库名须为 test_v47_order_ 前缀的隔离库，凭据不写入仓库。
- order/notify/admin 全量 init.sql 在隔离空库执行成功，分别创建 30/7/15 张表。
- 已在最终合并后的代码及 SQL 上重新验证；临时隔离库在测试后清理。
- 隔离 MySQL 验证创建失败库存回滚、持久化 REJECTED、未知失败 PROCESSING 原键恢复、库存乐观锁、并发原键序列化、账户与大小写隔离。
- 自动化测试覆盖 SKU 组合、失效 SKU、价格/库存约束、采购前禁发货、售后确认、审核领取归属、帮助投票幂等、金额边界与 JSON 精度、内容发布/下线/受众、充值合约/确认数拒绝、全量持仓跨页预估。
- 尚未进行本版本已部署 HTTP 接口、前端页面、真实链钱包、支付/退款外部资金链路、正式协议内容的端到端验收。

接入顺序：前端先按本文件和新 Swagger 更新字段/枚举/调用顺序，再协调发布及非空样本联调。旧调用方直接发货、未领取即审核会被新规则拒绝；本次没有加入兼容分支。已有缺失费用/采购凭证记录如需继续使用，应人工决定补齐或清理，不由程序猜测。未推送/部署，避免未经协调改变运行中的流程。

已将本地 main 快进同步到已有 origin/main 的 191bb96，保留 TronLink、多平台钱包、送审历史和解冻通知等既有能力；本次适配仍为未提交改动。运行环境接入时间以协调发布之后为准。
