# Swagger 真实接口匹配矩阵

> 本矩阵仅维护契约、API/类型、页面调用和真实验证四层；当前问题、责任方及后续验收统一见 [接口接入计划](./api-integration-plan.md)。旧日期流水账及已被替代的缺口由Git追溯，不作为当前事实。

## 契约来源与最近检查

- Knife4j：`http://221.128.249.198:8902/doc.html`；后台协作使用部署站 `https://testhou.merchantsale.store/`。本地 C-PC 使用5173，不把后台管理站当Swagger入口。
- 2026-09-06 已运行 `pnpm check:swagger`：admin **201/202/337**、user **50/50/92**、order **73/75/113**、notify **22/22/35**（路径/操作/Schema），关键契约通过。user/notify历史404已恢复，不再列当前缺接口。
- 路径以服务分组标识：例如 user 的 `/auth/me`；实际同源前缀由请求层配置，业务ID作为不透明原值，不作数值运算。
- 类型、9文件184项现有测试、生产构建及diff检查通过；Arco约583 kB为已有构建提醒。检查通过不等于写入闭环或发布成功。

## 最新变更四层核对

依据工作区 `20260905_C-PC_后端变更执行清单.md`，当前为**部分完成**。表中浏览器结果为9月5日契约适配后证据；9月6日显示层补验另列，不能相互替代。

| 任务/能力 | 最新契约 | API/类型 | 页面 | 本轮真实验证 |
| --- | --- | --- | --- | --- |
| 1 单笔/组付款与恢复 | pay 必填 confirmedAmount；group/pay 返回对象；group/pay-result 当前状态与 items 已核对 | 已接入，十进制原值、逐单完整性、响应丢失回查 | 首次结算/恢复/订单卡/详情/结果页已适配；-312 不自动重付 | 已恢复真实登录；资金/改价/部分成功闭环未验 |
| 2 仅退款幂等 | refunds/create.idempotencyKey 最大 64；refunds/by-key 非空/null 语义已核对 | 已接入，原键原参、归属、回执、无键旧记录保护 | 原申请恢复入口已接入 | 测试覆盖恢复分支；真实申请/冲突未验 |
| 2 提现/充值/理财幂等 | user 已恢复；三种创建支持最长 64 字符键；by-key 当前登录人范围返回 VO 或明确 null | 已接入，保存原账号/原键/原参及成功回执；原单字段/金额校验、旧无键和 -311 保护 | 三页均有恢复原操作入口；仅明确 null 才原键原参重试 | 三种真实空键查询均明确 null；异常恢复/隔离现有测试通过；没有新建资金单，真实同键成功/冲突/丢响应仍未验 |
| 3 动态承运商 | orders/carriers、动态 string carrier、自定义名称/defaultCarrier/sortNo 已核对 | 已接入 | 动态选择与失败重读；详情历史名称快照 | 已登录真实返回16项；9月6日既有隔离完成单Chrome显示顺丰/已签收/3条轨迹。动态字典变更后的新发货未验 |
| 4 KYC schema/材料/私有资源 | user/schema 实际 version=4，证件类型和四个布尔配置已核对 | 已接配置及共享规则，旧 access 保护保留 | 配置驱动字段/上传/提交入口；提交前检查新版本，规则拒绝保留草稿 | 旧两账号 detail 文件缺失；新建独立 QA 账号表单可编辑、缺材料阻止提交并保留草稿。用户桌面 PNG 上传受浏览器 `Not allowed` 限制，文件未送出，未申请认证；签名刷新/配置切换仍未验 |
| 5 IM 已读/撤回 | notify messages/page.markRead 默认 false；read 独立写接口 | 显式 false；撤回终态清媒体/正文，支持 null | 两种会话页仅可见到底后上报，失败不预清未读 | Chrome 双账号文本真实发送；非当前会话未读 1，打开可见后总未读 60→59、发送端已读 1；本批文本已撤回，双端刷新不恢复。隐藏预取/媒体/独立群和故障重连仍未完整验收 |
| 6 求购筛选 | my/page statuses 与预算/天数；hall 恒待接单，已核对 | 透传筛选，移除当前页过滤 | 后端 total 分页/状态计数，URL 保留；同步清除仅当前页的旧文案 | Chrome 全部 6→待审核 0 条、状态总数和刷新条件保持；参数测试通过，非空深分页未验 |
| 6 钱包/积分筛选及导出 | 账户桶/关键词、多行为/earned、含边界毫秒日期均已核对 | 服务端筛选，保留 false/0；不再当前页补过滤 | 同条件 records/total，URL 保留；CSV 当前页及后端原始业务名称 | 9月5日钱包39→2→0、积分1→多行为0、刷新及空结果禁导出已验；9月6日单选小金库存入40→1、URL/刷新/抽屉关闭/重置已验，321字节单行CSV实际下载，Long/类型/金额/余额/时间一致并清理；深分页及失败/在途导出未验 |
| 7 评价资格 | 详情 reviewEligibility、批量 eligibility（最多200）递归字段已核对 | 已接入，不扫描待评价列表判资格 | 详情/列表/写评价已用；失败/漏项不当无资格，不强跳已删除 reviewId | 乱序/漏项/分批测试通过；9月6日同单2093369377466966017卖家批量NOT_BUYER、顾客详情/批量ALREADY_REVIEWED且同reviewId，仅API只读验证；期限/删除及动态身份变化未验 |
| 8 求购处理进度 | my/progress.timeline 节点及推送汇总已核对 | 已封装，ID 校验、时间正序 | 本人详情已接入，非本人不查询 | 9月6日Chrome从本人列表进入2094032551400792066，显示提交→取消、0批/触达0；原生返回/purchase全部6条。另顾客REJECTED样本API有提交/审核节点，非浏览器验收；接单/非零推送及非本人边界未验，无现成非零样本 |
| 8 我的经营统计 | stats/mine，时间为含边界毫秒；比率已为百分数 | BusinessStatsDTO 已适配 | 工作台已接入，保留 >100% 的合法口径与独立错误区域 | Chrome 实际评价率 12.50%、客诉率 33.33%、平均发货 0.87 小时，完成 8/评价 1/售后 4；范围边界、>100% 及错误分支尚未真实验收 |
| AML/CMS/AI | 本期延期；最新 user/order/notify 无 AI/CMS 公告帮助路径 | 正式页面移除 AI/公告/帮助模拟 API，未扩展真实接口；本地协议内容按协调要求暂不改 | AI/公告/帮助文章改未开放状态；个人中心空公告卡已移除；协议/隐私入口及流程保留 | Chrome 插件本地补验三个未开放页及分别返回首页；隐私 query 打开/清除、关闭与原用户协议入口正常；个人中心公告无假内容。未点击同意，不计真实 CMS/AI 接入 |

## 既有模块四层索引

下面是当前仍在使用的核心接口与已有验证基线。历史正常交易验收不能替代上表新金额/幂等/已读等契约变更的再验收。

| 能力 | 服务及契约 | API/类型 | 页面调用 | 有效验证及保留边界 |
|---|---|---|---|---|
| 注册/登录/身份 | user：POST `/auth/register`、`/auth/login`；GET `/auth/me` | 已封装；成功码1，统一解包/错误；临时凭证确认后切换 | 登录/注册、Store及守卫已调用；演示仅DEV独立身份 | 测试登录、注册QA账号、身份切换及受控401/503恢复已验；并发/迟到/真实撤权未完整验 |
| 积分/VIP | user：GET `/points/account`、`/points/rules`、`/points/vip-configs` | 已封装C端公开规则，不再借admin权限 | 积分/VIP/个人中心调用，公开与登录状态分开 | 真实规则、VIP及KYC积分非空已验；未知类型/配置变化等边界待验 |
| 积分申诉 | user：POST `/points/appeals/submit`、`/points/appeals/page` | ledgerId/reason及分页已封装 | 流水申诉、记录页、版本保护弹窗已调用 | 列表/筛选空态已验；非空提交及慢写入重开待验 |
| 首页/分类 | order：GET `/categories/tree`、`/banners/list`、`/storefront/recommend`、`/storefront/flash-sale`；POST榜单分页 | 已封装分类Long、时间/金额/必需数组校验 | 导航、首页、分类和表单选择器已调用 | 非空商品榜单、分类及分项失败已验；非空活动/秒杀及>24分类商品待验 |
| 公开商品 | order：POST `/storefront/products/page`；GET `/storefront/product/detail` | 已适配分页/排序/分类/价格/卖家/审核及售后 | 列表、详情、购物车与立即购买已调用 | 搜索、分类、详情、库存与本人禁购已验；同店sellerId查询仍缺，不以my/page替代 |
| 收藏/浏览 | order：POST/DELETE `/products/favorite`、POST `/products/favorites/page`、`/storefront/browse`、`/products/view` | 已封装，真实失败不乐观伪成功 | 详情/收藏已调用；进入详情有浏览记录副作用 | 收藏/取消回读已验并清理QA收藏；只读批次不进入商品详情冒称零写入 |
| 买手商品/文件 | order：POST `/products/my/page`、`/products/create`、`/files/upload`；PUT `/products/shelf`；DELETE `/products/delete` | bucket/filePath及scene=PRODUCT/DEMAND/REVIEW/ORDER_VOUCHER；仅ON_SALE为在售 | 创建、审核状态、上下架/删除真实调用 | 历史上传创建/审核/公开交易、下架删除已验；本次批量文件失败/新凭证待验，商品编辑接口仍缺 |
| 分类申请/秒杀 | order：`/categories/apply/my/page`、`/categories/apply/submit`、`/flash-sale/sessions/available`、`/flash-sale/my`、`/flash-sale/enroll` | 已封装申请/审核字段、报名/取消、场次商品组合键 | 买手分类及秒杀页调用 | 历史分类申请→审核→分类树、秒杀报名/取消闭环已验，QA场次已停用；新版慢写入/深页未验 |
| 买手身份 | user：GET `/buyer/application`、POST `/buyer/apply` | BUYER角色守卫，不擅加KYC门槛；未知提交核实状态 | 申请、工作台与买手路由调用 | 历史申请/后台批准/权限回读已验；审核状态变化、失败及权限撤销待验 |
| 购物车 | 本地Pinia/storage，无远端购物车契约 | 账号缓存、库存复核、同源锁和独立结算快照 | 购物车/立即购买/结算已使用 | 双标签增删改选同步及恢复空车已验；坏缓存和真实付款后并发待验 |
| 地址 | user：GET `/addresses/list`；POST `/addresses/create`；PUT `/addresses/update`、`/addresses/default`；DELETE `/addresses/delete` | 原Long、country/detailAddress/defaultFlag、返回ID与回读分离 | 管理、结算/求购共用选择器 | CRUD及保存成功后列表503重试已验；临时QA地址清理，结算在途失效待验 |
| 下单/订单 | order：POST `/orders/create-batch`、`/orders/bought/page`、`/orders/sold/page`；GET `/orders/detail` | orderGroupNo、幂等缓存；内部ID与展示号分离，未知状态不变可写 | 结算、买卖列表/详情、工作台/个人中心统计 | 历史跨账号主链及列表第二页回读已验；新版付款见上表 |
| 订单动作/物流 | order：`/orders/price`、`/orders/cancel`、`/orders/confirm`、`/orders/ship`、`/orders/logistics`、`/orders/logistics/track/create`、`/orders/logistics/exception/mark` | 状态/归属保护、动态carrier与名称快照、凭证/地址可选字段；productId实际可null，类型已补 | 卡片、详情、发货/物流弹窗调用；无商品订单保留内容，不生成无效商品跳转 | 历史发货/轨迹/签收已验；9月6日同单2093369377466966017详情/物流API均采购1+发货1，Chrome物流3节点及发货凭证区已验，图片预览未验。purchaseVouchers已保留但详情无原展示入口，记消费者差异而非后端缺字段，不扩交互；新上传/动态字典发货/物流异常闭环待验 |
| 仅退款 | order：`/orders/refunds/create`、`/orders/refunds/bought/page`、`/orders/refunds/detail`、`/orders/refunds/cancel`及by-key | 真实REFUNDED不映射归档；旧简单退款/Mock不回退 | 买家创建/详情/撤销和买手售后列表调用 | 历史申请/撤销/驳回/同意与余额冻结解冻/库存回补已验；新幂等场景见上表。不冒充全部五类售后工单 |
| 钱包/充值/提现 | user：`/wallet/overview`、`/wallet/ledger/page`、`/recharge/chains`、`/recharge/address`、充值/提现create/detail/page及by-key | 账户桶、原bizGroup/bizType、缺金额保持未知、真实业务ID | 钱包/流水、买手钱包、充值/提现页已调用 | 非空资金和测试到账、提现申请/审核/驳回历史已验；地址配置、取消申报、真实链上出款及新幂等未完成 |
| 买手押金 | user：`/buyer/deposit/page`、`/buyer/deposit/pay`、`/buyer/deposit/refund`及wallet overview | 原方向/金额/幂等键、真实流水ID；不支持独立划转则不伪造 | 押金页、工作台及买手钱包 | 历史1 U缴纳→余额/流水→退还恢复已验；故障同键恢复/跨标签仍待验 |
| 理财 | user：GET产品list/detail、订单overview/detail；POST订单subscribe/page/redeem及by-key | 产品在售/费用校验，缺金额不补零；赎回只核实同ID | 产品/详情/锁仓列表/详情及提前赎回调用 | 历史订阅/赎回不覆盖新幂等；9月6日纠正错误详情地址后，正式/finance自然显示暂无可申购产品、锁仓/待结算收益0.00，Network三个子请求各HTTP200；随后同文档QA身份独立API读取三个code=1，产品数组0项、收益4个金额字段为合法零字符串且holdingCount为数值0、钱包distribution内FINANCE_LOCKED.amount为合法零字符串；不是同一页面响应体捕获。非空产品/费用/恢复及受控异常待验 |
| 评价 | order：`/reviews/create`、`mine/page`、`received/page`、`detail`、`delete`、`reply`、`appeals/create`；storefront评分/评价 | 按订单幂等；批量/详情资格；原快照恢复、不提交无契约标签 | 商品、我的评价、写评价/回复申诉调用 | 历史顾客提交、买手回复/申诉、后台裁定回读已验；新资格和真实丢响应恢复仍未完整验 |
| 通知 | notify：page/unread/count/read/read-all/delete/clear | bizType/bizId/templateCode安全路由、账号隔离 | 通知中心/角标/关联业务详情调用 | 9月6日Chrome已读2093369380017098753跳内部订单2093369377466966017，与列表订单一致，角标仍6；历史缺字段及跨页批量动作待验 |
| IM/实时 | notify：conversations/page/by-order/delete；messages/page/send/read/recall/incr；files/upload；WebSocket | mediaFileId、clientMsgId、Long水位、撤回终态；READY心跳协商，token仅经子协议 | 主消息/独立订单群、媒体与实时Store调用 | 历史文本/图片/WS双端、迟到发送成功已验；9月6日指定零未读且水位覆盖最新的订单群，Chrome8条历史含2条仅撤回提示，已连接；前后水位/未读不变。服务端1条旧撤回残余由前端清理隐藏；未新发/撤回，语音/新媒体撤回/隐藏预取/深补偿未完整验 |
| CMS/AI/售前等 | 当前缺口不因Banner或订单群接口而满足 | 不伪造API/数据；共享协议示例保留 | 无能力模块/假按钮隐藏，旧路由安全返回 | 仅不可用态验收；详见计划PC-04/05/06/08/09/10/12 |

## 页面展示补验与交付边界

- 2026-09-06 Chrome本地定向验证：工作台Hero→KPI→经营统计；钱包行、抽屉及类型选项中文；积分行为标签；求购计数；个人中心空公告卡移除；AI/公告/帮助安全返回；协议演示声明/关闭/query不改变同意。
- 钱包筛选提交已补验：40→小金库存入1条，types=FINANCE_LOCK、刷新/详情关闭保持、重置40；额外误选未复现。CSV经原生Chrome按钮实际下载并核对11列、1行、Long/金额/类型/余额及时间，测试文件已清理；插件勾选/下载无效不等于页面缺陷。
- KYC本次保持认证通过但资料读取失败；理财此前错误访问/finance/products命中finance-detail(id=products)，不能认定列表失败；正式/finance自然空态与三个HTTP200已复验。充值本批未复验。
- 全51路由做了源码定向检索，不是全51路由真实验收。无新订单、资金、上传、审核或配置写入；未修改真实金额、Long ID、业务状态、协议正文/同意、权限、三级分类和提交保护。
- 理财源码收口：products/list、orders/overview、wallet/overview失败名称分别提示；收益概览失败清旧值，pendingInterest缺失不补0。live FinanceOverviewVO未约定省略即零，H5同字段亦作校验。类型与184项既有测试通过；正确入口自然页面和独立API空数组/合法零已验，受控异常未验。用户切到H5后停止原生点击，后台控制无局部网络拦截能力，已关闭自建标签释放浏览器；补证仅用本机明确测试记录在临时进程登录并只读，没有浏览器凭据读取、仓库调试脚本或业务数据写入。
- 界面移除原因及恢复标准集中在计划PC问题表；其余原有并发/上传/资金/IM未验分支集中在“交互保护与剩余定向验收”，不再复制历史流水账。第一批理财修正已随b6bb4f0交付；本次第二批6文件交付包含空商品ID跳转修正、订单卡片读屏标签及本表定向证据，四域Swagger、类型、184项测试、差异检查和第二批独立生产构建通过（原Arco约583 kB提醒保留）。推送不代表全部业务验收或手动部署，上述未验与缺样本项继续保留。
