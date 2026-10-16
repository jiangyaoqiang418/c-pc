# Swagger 真实接口匹配矩阵

> 本矩阵仅维护契约、API/类型、页面调用和真实验证四层；当前问题、责任方及后续验收统一见 [接口接入计划](./api-integration-plan.md)。旧日期流水账及已被替代的缺口由Git追溯，不作为当前事实。

## 契约来源与最近检查

- Knife4j：`http://221.128.249.198:8902/doc.html`；后台协作使用部署站 `https://testhou.merchantsale.store/`。本地 C-PC 使用5173，不把后台管理站当Swagger入口。
- 2026-10-15 本轮已刷新四组 live OpenAPI 并通过更新后的 `pnpm check:swagger`：admin **227/228/388**、user **64/66/110**、order **89/91/145**、notify **30/30/43**（路径/操作/Schema）。新增契约已公开；实际业务验证按下表单列。
- 路径以服务分组标识：例如 user 的 `/auth/me`；实际同源前缀由请求层配置，业务ID作为不透明原值，不作数值运算。
- 9月8日类型、9文件205项现有测试、生产构建及diff检查通过；Arco583.19 kB为已有构建提醒。未新增测试文件/依赖；未提交推送发布，检查通过不等于页面或写入闭环。

## 最新变更四层核对

以下为10月15日本轮交付状态；代码、后端任务单和承接文档顶部同批保存，准确位置以分支Git HEAD为准。历史验收不自动转为新版能力验收。

| v47能力 | 契约确认 | API/核心逻辑 | 页面接入 | 真实验证 |
| --- | --- | --- | --- | --- |
| C01 原键恢复 | `/orders/by-key`四态及原参数已确认 | 完整批次/归属/地址/SKU/数量/价格校验，未知保留快照 | 结算只读回查及终态二次确认，恢复不自动创建/付款 | 此前两个隔离账号GET为NOT_FOUND；其他真实四态样本仍缺 |
| B02/C02 SKU与金额 | 规格组、稳定SKU、完整写入及28+8十进制已确认 | 原ID/组合/启停/图片/库存/价格校验；草稿版本锁和精确金额；编辑前新快照校验 | 详情→购物袋→结算/订单；完整创建/编辑/秒杀，SKU商品禁用整体快捷改价 | 此前普通商品加购到结算已验；无真实多SKU/可编辑样本，写入待验 |
| B08 采购/售后/审核 | stage、can*、CONFIRMING/auditStage已确认 | 采购/发货分离、独立total、意见不直接退款 | 买手订单/售后/商品Tab及顾客售后 | 此前采购中只读与桌面/375弹窗已验；已采购/售后确认/领取及写入待样本 |
| B01 品牌 | O品牌page/detail、商品brandId/brand已确认 | 校验启用/ID，列表按brandId；创建/编辑保留或显式清关联 | `/brand`及分页/搜索、详情参数、买手品牌选择；首页固定品牌文案进入目录搜索 | 游客品牌HTTP200/code1空分页；非空/停用/关联商品待验 |
| B03 评价 | keyword仅正文、四sortBy已确认；topic与原型不一致 | 服务端组合分页；不猜作者/规格搜索或主题映射 | 正文搜索、排序、星级/有图、真实SKU快照 | 参数/边界测试通过，主题/全搜索域仍部分完成，非空分页待验 |
| B04 帮助投票 | PUT目标helpful及权威计数已确认 | 布尔/ID/计数校验；未知结果通过公开列表回读，原目标重试 | 评价按钮/选中/真实数量/忙碌状态 | 现有测试通过；普通顾客给他人评价投票、并发/-305/丢响应真实待验 |
| B07 正式内容 | N帮助/协议/公告读取已确认 | 只接发布内容、详情必需正文、清洗HTML/链接协议 | 帮助FAQ/查询、协议入口、公告列表/详情；未确认help topic禁用 | 帮助/公告真实空分页，用户协议-322；正式正文、版本、其他角色待交付 |
| B09 订单搜索 | bought/sold的orderNo精确、productTitle模糊已确认 | 服务器分页/Tab计数同条件，URL保留 | 顾客/买手订单搜索；分类申请keyword沿用后端理由范围 | 参数与计数刷新测试通过；非空多页/权限待验 |
| B11 每日利息 | overview每日预估及时间窗口已确认 | 使用全量聚合dailyExpectedInterest，不按当前页求和 | 小金库概览与预估窗口 | 零/缺值/时间测试通过；非空持仓及到期/赎回待样本 |
| B12 收藏/资格 | favorites/status、sellers/qualification已确认 | 批200/漏项拒绝、共享状态、会话隔离、未知写入读回；资格精确sellerID | 商品卡/图库/收藏页同步、详情真实认证标识 | 迟到/未知/账号切换现有测试通过；深页/跨页及资格变化真实待验 |
| B05 充值矩阵 | assets三方式及记录字段已确认；asset声明仍待统一 | 按配置开放USDT，原申报核对chain/amount/source；直充跨标签锁，未知转账不重签 | 地址/钱包/申报及详情来源/链事件/确认数；USDC禁用 | 参数/原申报/异常回包测试通过；测试链、钱包签名及到账/流水未验 |

类型检查、现有9文件272项测试、生产构建通过；扩展后的Swagger检查覆盖上述新增字段与枚举，四域数量见顶部。未新增测试文件/依赖，包/锁文件、冻结参考CSS和主题素材未改。本轮按安排暂缓Chrome、像素、动画及资金验证，不将静态检查记作真实业务通过。剩余后端/运营/环境交付按[优先级任务单](../PC-v47-后端修改任务单.md)，实现与验证边界见[design-qa](../design-qa.md)。下方旧日期段落保留为历史证据，内容/CMS等状态以本表为准。

本批另在`18028b1`基础上保存前端边界、手机布局/键盘和筛选输入修复，涉及会话/请求/模态生命周期、原操作结果核对与恢复、精确筛选和上传上下文；没有新增接口或改动契约，没有新增写入闭环或资金验收。代码与验证记录同批保存，实际交付位置以`feat/pc-ui-v47`的Git HEAD为准；本次未更新接口计划顶部的跨设备承接节。细节与最终检查见[design-qa](../design-qa.md)。

- 2026-10-14 PC v47 UI 迁移：公开商品/分类/收藏/评价、登录与钱包首页继续使用现有 API，未变更请求封装或发布契约；本批类型、现有测试和构建通过，尚未重新完成新版真实写入验收。B01–B10 的缺少能力与语义澄清见 [v47 后端清单](../PC-v47-backend-requirements.md)，不得将品牌未开放、缺 SKU 或未支持评价筛选计作完整接入。历史业务验收不自动转为新版 UI 验收。

- 2026-09-13 商品编辑/快捷改价：live order 已提供 PUT /products/update、PUT /products/price 及 ProductDTO.imageFiles。API/类型与页面已接入：OFF_SHELF/REJECTED 复用创建表单、详情全量回显、原图存储字段回传、提交重新审核；ON_SALE/OFF_SHELF 弹窗回显价格、字符串提交并刷新列表。代码检查与现有测试通过；本轮未执行浏览器与真实写入验收，未提交推送。

依据工作区 `20260905_C-PC_后端变更执行清单.md`，当前为**部分完成**。表中浏览器结果为9月5日契约适配后证据；9月6日显示层补验另列，不能相互替代。

当前实时契约已明确：分类层级不固定、最多五级，发布商品和求购可选任一启用层级；C 端分类展示传 `onlyWithProduct=true`，创建表单传 `onlyWithProduct=false`，提交前重新读取有效分类。`CategoryNodeDTO.parentId` 没有 required 声明，允许随嵌套路径省略，但拒绝明确错父级、错误层级和未明确启用的节点。create/create-batch同键异参-311仅后端回复明确，Swagger仍描述旧单返回；请求HTTP错误保留业务code，checkout即使首次HTTP400/-311也保留原键原参数，不自动重建。错误增加可选去重traceId，不记录敏感请求或改变成功响应。均为代码适配，不是新订单真实冲突验收。

| 任务/能力 | 最新契约 | API/类型 | 页面 | 本轮真实验证 |
| --- | --- | --- | --- | --- |
| 1 单笔/组付款与恢复 | pay必填confirmedAmount、回执仅ApiResultLong/int64未明示原订单ID；group/pay返回对象；group/pay-result当前状态与items已核对 | 十进制原值/逐单完整性/响应丢失回查保留；3B付款API复用同订单退款/收货锁，原始POST私有、限定原ID/组及回调有效期 | 两个checkout入口统一持锁预读/确认/组或历史逐单付款/结果回读，原pending锁外层不变；详情/卡片独立付款同锁；-312不自动重付 | 3B隔离测试复现并修复独立付款绕过，用户授权阶段推送前复跑9文件203测试、类型、四域Swagger及生产构建通过，diff通过。无新增真实支付/异常页面/跨标签回归；在途互斥不等于跨刷新未知结果恢复，资金/改价/部分成功真实闭环仍未验，推送不等于业务验收或部署 |
| 2 仅退款幂等 | refunds/create.idempotencyKey最大64；refunds/by-key非空/null语义已核对 | 原键原参、归属、无键旧记录保护；坏回执不冒充成功；3A同订单退款/收货共锁，3B单笔/组付款加入相同定向锁 | 原申请恢复复用工具；收货原入口在未决时只核对原订单COMPLETED，不再次确认，无技术banner | 3A本人空键HTTP200/code1/明确null；3B组付款持锁时退款首次/原键恢复与收货均被阻止的隔离测试通过。真实异常页面/跨标签/收货退款写闭环未验，跨刷新付款未知结果不计解决 |
| 2 提现/充值/理财幂等 | 三种创建支持最长64字符键；by-key当前登录人范围返回VO或明确null，3A实时再核一致 | 原账号/原键/原参及成功回执；3A修复空串/null/false/0误当无记录；完成回执也先校验原键/账号/动作/快照，不覆盖损坏记录 | 三页复用恢复工具，交互不变；仅明确null才原键原参重试，未新增业务兜底或Mock | 3A三种只读探测键均HTTP200/code1/明确null；最终全套9文件194测试/类型通过，合法原回执不重发、确认成功后新明确操作可新键。真实非空同键成功/冲突/丢响应仍未验，没有新资金单 |
| 3 动态承运商 | orders/carriers、动态 string carrier、自定义名称/defaultCarrier/sortNo 已核对 | 已接入 | 动态选择与失败重读；详情历史名称快照 | 已登录真实返回16项；9月6日既有隔离完成单Chrome显示顺丰/已签收/3条轨迹。动态字典变更后的新发货未验 |
| 4 KYC schema/材料/私有资源 | 9月8日回复称detail缺图返回null、保留状态/FileId，历史文件未恢复；空值契约声明待同步 | 三图URL显式nullable；detail根null原已支持，保留私有access逐图失败隔离 | 状态保留；必需或已有材料的单图无预览占位；无材料的选填图不制造缺图，不开放额外重提 | 历史表单/拒绝缺材料证据保留；本轮未复验真实null详情、签名、上传与跨账号资源权限，后端编译不能关闭问题 |
| 5 IM 已读/撤回 | markRead默认false；后端回复称撤回读接口清content/mediaUrl/duration/params，但旧直链仍可访问 | params支持null；统一撤回清正文/媒体/FileId/时长/params，迟到消息保持撤回终态 | 两页本地/实时撤回复用清理；已打开图片被撤回即退出预览，原可见已读/语音卸载保留 | 既有双账号文本已读/撤回刷新证据保留；新增params及迟到/现有缓存清理用既有测试验证，媒体播放/预览撤回与重连本轮页面未验，不代表旧媒体链接失效 |
| 6 求购筛选 | my/page statuses 与预算/天数；hall 恒待接单，已核对 | 透传筛选，移除当前页过滤 | 后端 total 分页/状态计数，URL 保留；同步清除仅当前页的旧文案 | Chrome 全部 6→待审核 0 条、状态总数和刷新条件保持；参数测试通过，非空深分页未验 |
| 6 钱包/积分筛选及导出 | 账户桶/关键词、多行为/earned、含边界毫秒日期均已核对 | 服务端筛选，保留 false/0；不再当前页补过滤 | 同条件 records/total，URL 保留；CSV 当前页及后端原始业务名称 | 9月5日钱包39→2→0、积分1→多行为0、刷新及空结果禁导出已验；9月6日单选小金库存入40→1、URL/刷新/抽屉关闭/重置已验，321字节单行CSV实际下载，Long/类型/金额/余额/时间一致并清理；深分页及失败/在途导出未验 |
| 7 评价资格 | 详情 reviewEligibility、批量 eligibility（最多200）递归字段已核对 | 已接入，不扫描待评价列表判资格 | 详情/列表/写评价已用；失败/漏项不当无资格，不强跳已删除 reviewId | 乱序/漏项/分批测试通过；9月6日同单2093369377466966017卖家批量NOT_BUYER、顾客详情/批量ALREADY_REVIEWED且同reviewId，仅API只读验证；期限/删除及动态身份变化未验 |
| 8 求购处理进度 | my/progress.timeline 节点及推送汇总已核对 | 已封装，ID 校验、时间正序 | 本人详情已接入，非本人不查询 | 9月6日Chrome从本人列表进入2094032551400792066，显示提交→取消、0批/触达0；原生返回/purchase全部6条。另顾客REJECTED样本API有提交/审核节点，非浏览器验收；接单/非零推送及非本人边界未验，无现成非零样本 |
| 8 我的经营统计 | stats/mine，时间为含边界毫秒；比率已为百分数 | BusinessStatsDTO 已适配 | 工作台已接入，保留 >100% 的合法口径与独立错误区域 | Chrome 实际评价率 12.50%、客诉率 33.33%、平均发货 0.87 小时，完成 8/评价 1/售后 4；范围边界、>100% 及错误分支尚未真实验收 |
| AML/CMS/AI | 本期延期；最新 user/order/notify 无 AI/CMS 公告帮助路径 | 正式页面移除 AI/公告/帮助模拟 API，未扩展真实接口；本地协议内容按协调要求暂不改 | AI/公告/帮助文章改未开放状态；个人中心空公告卡已移除；协议/隐私入口及流程保留 | Chrome 插件本地补验三个未开放页及分别返回首页；隐私 query 打开/清除、关闭与原用户协议入口正常；个人中心公告无假内容。未点击同意，不计真实 CMS/AI 接入 |

## 既有模块四层索引

### 2026-09-23 J1：USDT 钱包直付阶段接入

测试环境 order Swagger 已出现 `GET /orders/wallet-pay/chains`、`GET /orders/wallet-pay/latest`、`POST /orders/wallet-pay/create`、`POST /orders/wallet-pay/submit-tx`、`GET /orders/wallet-pay/detail`。J1 仅封装并调用 chains/create/latest，页面展示支付参数但默认隐藏入口；submit-tx/detail、钱包签名和轮询归 J2。Swagger 把 confirmedAmount/orderAmount/payAmount 标为 number、expireAt 标为 int64，后端手册描述实际 JSON 使用字符串；rawAmount 在两处均为字符串。真实登录态响应、测试链开放和链上结果尚未验证，不计接口联调通过。

### 2026-09-29：解冻通知与钱包直付链上进度

- 通知中心已识别 `product_unfrozen`，按 `bizType=PRODUCT`、`bizId=商品ID` 跳转“我的商品-已下架”，保留商品 ID 供页面定位；`product_approved`、`product_rejected` 原跳转保持不变。
- `GET /orders/wallet-pay/detail` 新增的 `chainTx` 已接入支付单类型和页面：区分 `NOT_FOUND/PENDING/CONFIRMING/CONFIRMED/FAILED`，展示确认数、块高与识别金额；`null` 保持原“链上确认中”并继续轮询。
- 识别转入金额小于应付金额时，按十进制字符串精确比较并提示可能转入平台余额；最终付款结果仍仅以支付单状态为准。本轮类型检查通过，真实不足额交易尚未验收。
- 链上失败只表示该笔转账未执行，不直接把商城支付单判为失败；页面允许使用原支付参数重新签名并通过 `/orders/wallet-pay/submit-tx` 上报新哈希。类型检查和通知定向测试通过；真实链上交易及通知点击仍待测试环境数据验收。

下面是当前仍在使用的核心接口与已有验证基线。历史正常交易验收不能替代上表新金额/幂等/已读等契约变更的再验收。

| 能力 | 服务及契约 | API/类型 | 页面调用 | 有效验证及保留边界 |
|---|---|---|---|---|
| 注册/登录/身份 | user：POST `/auth/register`、`/auth/login`、`/auth/oauth/login`、`/auth/password/set`；GET `/auth/me`；登录与个人信息新增 `loginPasswordSet`，`email` 可为 null；OAuth 冲突返回 `-317` | 已封装；保留 `loginPasswordSet`/email null/未知状态；设密码时有邮箱账号不发 email，无邮箱账号同次提交 email | 登录页处理 `-317`；个人中心仅在明确未设密码时展示入口；设置页强制状态预读、6–64位与确认校验，成功后保留会话并回读，回读失败防重复提交 | 类型检查及生产构建通过；新设置页、null 邮箱、重复设置和 `-317` 尚未使用真实账号联调，不标记为已验收 |
| 支付密码前置安全 | user：POST `/auth/pay-password/set`、PUT `/auth/pay-password/reset` 在未设登录密码时返回 `-316`；update 不受影响 | set/reset 请求保留业务错误码供页面分支，不自动重试 | 首次设置或重置前检查 `loginPasswordSet`；false 或 `-316` 转设置登录密码，成功后恢复 set/reset 及合法站内返回地址；所有密码输入清空后跳转，不自动执行资金操作 | 代码已推送，类型检查及生产构建通过；待真实 `-316`/set/reset 联调 |
| 积分/VIP | user：GET `/points/account`、`/points/rules`、`/points/vip-configs` | 已封装C端公开规则，不再借admin权限 | 积分/VIP/个人中心调用，公开与登录状态分开 | 真实规则、VIP及KYC积分非空已验；未知类型/配置变化等边界待验 |
| 积分申诉 | user：POST `/points/appeals/submit`、`/points/appeals/page` | ledgerId/reason及分页已封装 | 流水申诉、记录页、版本保护弹窗已调用 | 列表/筛选空态已验；非空提交及慢写入重开待验 |
| 首页/分类 | order：GET `/categories/tree` 支持 `onlyEnabled`、`onlyWithProduct`，有商品模式返回聚合 `productCount`；另有 `/banners/list`、`/storefront/recommend`、`/storefront/flash-sale` 及榜单分页 | 分类 Long 与 `productCount` 已适配；公开导航统一读取启用且有在售商品的分类 | 导航、首页和分类页已调用 `onlyWithProduct=true`，空分类不展示 | 实时有商品树未返回零商品节点；非空活动/秒杀及>24分类商品待验 |
| 公开商品 | order：POST `/storefront/products/page`；GET `/storefront/product/detail` | 已适配分页/排序/分类/价格/卖家/审核及售后 | 列表、详情、购物车与立即购买已调用 | 搜索、分类、详情、库存与本人禁购已验；同店sellerId查询仍缺，不以my/page替代 |
| 收藏/浏览 | order：POST/DELETE `/products/favorite`、POST `/products/favorites/page`、`/storefront/browse`、`/products/view` | 已封装，真实失败不乐观伪成功 | 详情/收藏已调用；进入详情有浏览记录副作用 | 收藏/取消回读已验并清理QA收藏；只读批次不进入商品详情冒称零写入 |
| 买手商品/文件 | order：products/create与demands/create的categoryId允许当前启用树任一层级，分类最多五级 | 共用递归分类选项/验证，显式 `onlyEnabled=true`、`onlyWithProduct=false`，ID 原值 | 商品创建可手动刷新分类；商品/求购提交前重新读取分类树复核，失败/失效不创建且保留表单 | 现有测试覆盖任意启用层级、停用节点、错父级、省略父ID、过期/读取失败及有商品树计数；真实新创建仍待验 |
| 分类申请/秒杀 | order：`/categories/apply/my/page`、`/categories/apply/submit`、`/flash-sale/sessions/available`、`/flash-sale/my`、`/flash-sale/enroll` | 已封装申请/审核字段、报名/取消、场次商品组合键；申请通过的启用分类由完整分类树返回 | 买手分类及秒杀页调用；商品创建页可刷新并显示尚无商品的申请分类 | 历史分类申请→审核→分类树、秒杀报名/取消闭环已验，QA场次已停用；新版慢写入/深页未验 |
| 买手身份 | user：GET `/buyer/application`、POST `/buyer/apply` | BUYER角色守卫，不擅加KYC门槛；未知提交核实状态 | 申请、工作台与买手路由调用 | 历史申请/后台批准/权限回读已验；审核状态变化、失败及权限撤销待验 |
| 购物车 | 本地Pinia/storage，无远端购物车契约 | 账号缓存、库存复核、同源锁和独立结算快照 | 购物车/立即购买/结算已使用 | 双标签增删改选同步及恢复空车已验；坏缓存和真实付款后并发待验 |
| 地址 | user：GET `/addresses/list`；POST `/addresses/create`；PUT `/addresses/update`、`/addresses/default`；DELETE `/addresses/delete` | 原Long、country/detailAddress/defaultFlag、返回ID与回读分离 | 管理、结算/求购共用选择器 | CRUD及保存成功后列表503重试已验；临时QA地址清理，结算在途失效待验 |
| 下单/订单 | order：POST `/orders/create-batch`、`/orders/bought/page`、`/orders/sold/page`；GET `/orders/detail` | orderGroupNo、幂等缓存；内部ID与展示号分离，未知状态不变可写 | 结算、买卖列表/详情、工作台/个人中心统计 | 历史跨账号主链及列表第二页回读已验；新版付款见上表 |
| 待付款订单再次付款 | order：GET `/orders/detail`、`/orders/group/pay-result`、`/orders/wallet-pay/chains`/`latest`，POST `/orders/pay`、`/orders/wallet-pay/create` | 付款前核对归属/状态/金额与原钱包支付单；链上支付核对整组待付金额、链配置，创建尝试保留原幂等键 | 买入订单列表和详情的“立即付款”先选站内钱包余额或 USDT 链上支付；余额输入支付密码，链上进入钱包支付单页后签名 | 代码与契约已核对，类型和现有测试通过；两种方式的页面交互、真实付款及链上到账未执行，不计真实验收 |
| 订单动作/物流 | order：`/orders/price`、`/orders/cancel`、`/orders/confirm`、`/orders/extend-receipt`、`/orders/ship`、`/orders/logistics`、`/orders/logistics/track/create`、`/orders/logistics/exception/mark` | 状态/归属保护、动态carrier与名称快照、凭证/地址可选字段；`/orders/confirm` 必填 `id` 和 6 位 `payPassword`，密码未设置/错误/锁定分别为 -313/-314/-315；`/orders/extend-receipt` 仅待收货且 `receiveExtendable` 为 true 时可提交，每次顺延 5 天、最多 5 次；productId实际可null，类型已补 | 卡片、详情、发货/物流弹窗调用；确认收货先输入支付密码，旧无密码尝试仅核对状态后解除标记，不自动重发；买入订单卡片和详情在可延长时显示“延长收货”，提交前回读详情，未知结果不自动重发；无商品订单保留内容，不生成无效商品跳转 | 历史发货/轨迹/签收已验；本次延长收货契约已与当前 Swagger 核对，页面交互及真实提交按用户要求未测试。9月6日同单2093369377466966017详情/物流API均采购1+发货1，Chrome物流3节点及发货凭证区已验，图片预览未验。purchaseVouchers已保留但详情无原展示入口，记消费者差异而非后端缺字段，不扩交互；新上传/动态字典发货/物流异常闭环待验 |
| 仅退款 | order：`/orders/refunds/create`、`/orders/refunds/bought/page`、`/orders/refunds/detail`、`/orders/refunds/cancel`及by-key | 真实REFUNDED不映射归档；旧简单退款/Mock不回退 | 买家创建/详情/撤销和买手售后列表调用 | 历史申请/撤销/驳回/同意与余额冻结解冻/库存回补已验；新幂等场景见上表。不冒充全部五类售后工单 |
| 钱包/充值/提现 | user：`/wallet/overview`、`/wallet/ledger/page`、`/recharge/chains`、`/recharge/address`、充值/提现create/detail/page及by-key；order：`/orders/wallet-pay/chains`提供浏览器钱包网络配置，充值接口无交易哈希上报；WithdrawVO.actualAmount为申请额扣手续费后金额，非到账证明 | 账户桶、原bizGroup/bizType、原始缺失余额保持未知、真实业务ID；充值链/地址/网络/USDT合约与精度交叉核对，直充金额按整数最小单位换算并保留本机签名记录；提现不改金额和状态 | 钱包/流水、买手钱包、充值/提现页已调用；PC充值页新增“钱包直充”入口，直转专属地址、不自动创建申报；提现三处标签改“扣费后金额”；本次资产分布展示缺失桶按0，原始余额不改，已知总额可展示分布；总额/今日收支缺失仍提示重读 | 本次资产分布改动及对应测试用例未运行测试、类型检查、构建或浏览器校验，待手动验收。测试环境只读核对ETH/TRON充值地址与钱包网络配置相符、BSC未开放；直充真实签名/链上到账/平台入账及页面回归未验。3A Chrome本地原QA账号5条提现及APPROVED/REJECTED详情只读核对；列表/APPROVED详情刷新后新标签已验，新申请回执未触发。历史申请/审核/驳回不替代地址配置、取消申报、真实链上出款及新幂等验收 |
| 买手押金 | user：`/buyer/deposit/page`、`/buyer/deposit/pay`、`/buyer/deposit/refund`及wallet overview | 原方向/金额/幂等键、真实流水ID；不支持独立划转则不伪造 | 押金页、工作台及买手钱包 | 历史1 U缴纳→余额/流水→退还恢复已验；故障同键恢复/跨标签仍待验 |
| 理财 | user：GET产品list/detail、订单overview/detail；POST订单subscribe/page/redeem及by-key；FinanceOrderVO 提供 heldDays / accruedInterest / settledInterest / redeemedAt / settledAt | 产品在售/费用校验，缺金额不补零；赎回只核实同ID。收益展示复用现有订单字段，不新增请求或修改资金业务 | 产品/详情/锁仓列表/详情及提前赎回调用不变。详情优先后台持有天数，已赎回/结算缺天数时固定结束依据，不能按当前时间继续增长；实际利息与理论参考曲线分开，真实0保留，缺字段待确认/无实际点，取消单不展示计息点 | 历史正式入口自然空态、三个HTTP200及独立API合法零值证据保留，不计为本次展示验收。本次曲线/已结束收益展示按用户要求未运行测试、类型检查、构建或浏览器校验；真实赎回、结算、取消、缺字段及标点位置待手动验收。非空产品/费用/恢复及受控异常仍待验 |
| 评价 | order：`/reviews/create`、`mine/page`、`received/page`、`detail`、`delete`、`reply`、`appeals/create`；storefront评分/评价 | 按订单幂等；批量/详情资格；原快照恢复、不提交无契约标签 | 商品、我的评价、写评价/回复申诉调用 | 历史顾客提交、买手回复/申诉、后台裁定回读已验；新资格和真实丢响应恢复仍未完整验 |
| 通知 | notify：page/unread/count/read/read-all/delete/clear | bizType/bizId/templateCode安全路由、账号隔离 | 通知中心/角标/关联业务详情调用 | 9月6日Chrome已读2093369380017098753跳内部订单2093369377466966017，与列表订单一致，角标仍6；历史缺字段及跨页批量动作待验 |
| IM/实时 | notify：conversations/page/by-order/delete；messages/page/send/read/recall/incr；files/upload；WebSocket | mediaFileId、clientMsgId、Long水位、撤回终态；READY心跳协商，token仅经子协议 | 主消息/独立订单群、媒体与实时Store调用 | 历史文本/图片/WS双端、迟到发送成功已验；9月6日指定零未读且水位覆盖最新的订单群，Chrome8条历史含2条仅撤回提示，已连接；前后水位/未读不变。服务端1条旧撤回残余由前端清理隐藏；未新发/撤回，语音/新媒体撤回/隐藏预取/深补偿未完整验 |
| CMS/AI/售前等 | 当前缺口不因Banner或订单群接口而满足 | 不伪造API/数据；共享协议示例保留 | 无能力模块/假按钮隐藏，旧路由安全返回 | 仅不可用态验收；详见计划PC-04/05/06/08/09/10/12 |

## 页面展示补验与交付边界

- 9月8日用户手动登录并确认本轮测试会话后，Chrome桌面复用127.0.0.1:5173：商品/求购最初空态，用户补齐分类后两页均展开QA测试→QA-1→QA-3；一级/二级只展开不选中，三级可选且完整路径回显，当前不再缺完整启用三级链。清除重选未确认（商品工具点击后仍原值，未判代码缺陷）、失效提交和创建闭环未验。KYC已通过与原资料正常显示，三图分别暂无可用预览，刷新保持、无提交入口或整页资料读取失败；未抓响应体，不断言URL/null或具体签名错误。有效图/部分缺图/选填无材料仍未验。初始导航短暂页面不存在后自然恢复目标页，不计稳定故障。未写业务，保留用户登录标签在KYC并释放Chrome。充值源码确认专属地址来自recharge/address而非chains.depositAddress，取地址会触发分配，本轮未调用；回调/链服务仍缺条件。理财数组/空态旧修复保留，不造产品或Mock。
- 文档口径纠偏：管理端分配/推送/批量/日志及buyer-applications/detail已存在，不能替代买手收到的求购查询或混用申请ID与用户ID；finance/reports/overview不等于全部旧模拟财务卡；支付密码无当前后端业务模型。通知不再笼统列当前字段缺失，后端称存量完整后须指定通知ID复现；历史/异常安全路由保留。未新增跨端API或扩大权限。

- 2026-09-06 Chrome本地定向验证：工作台Hero→KPI→经营统计；钱包行、抽屉及类型选项中文；积分行为标签；求购计数；个人中心空公告卡移除；AI/公告/帮助安全返回；协议演示声明/关闭/query不改变同意。
- 钱包筛选提交已补验：40→小金库存入1条，types=FINANCE_LOCK、刷新/详情关闭保持、重置40；额外误选未复现。CSV经原生Chrome按钮实际下载并核对11列、1行、Long/金额/类型/余额及时间，测试文件已清理；插件勾选/下载无效不等于页面缺陷。
- KYC本次保持认证通过但资料读取失败；理财此前错误访问/finance/products命中finance-detail(id=products)，不能认定列表失败；正式/finance自然空态与三个HTTP200已复验。充值本批未复验。
- 全51路由做了源码定向检索，不是全51路由真实验收。无新订单、资金、上传、审核或配置写入；未修改真实金额、Long ID、业务状态、协议正文/同意、权限、三级分类和提交保护。
- 理财源码收口：products/list、orders/overview、wallet/overview失败名称分别提示；收益概览失败清旧值，pendingInterest缺失不补0。live FinanceOverviewVO未约定省略即零，H5同字段亦作校验。类型与184项既有测试通过；正确入口自然页面和独立API空数组/合法零已验，受控异常未验。用户切到H5后停止原生点击，后台控制无局部网络拦截能力，已关闭自建标签释放浏览器；补证仅用本机明确测试记录在临时进程登录并只读，没有浏览器凭据读取、仓库调试脚本或业务数据写入。
- 界面移除原因及恢复标准集中在计划PC问题表；其余原有并发/上传/资金/IM未验分支集中在“交互保护与剩余定向验收”，不再复制历史流水账。第一批理财修正已随b6bb4f0交付；本次第二批6文件交付包含空商品ID跳转修正、订单卡片读屏标签及本表定向证据，四域Swagger、类型、184项测试、差异检查和第二批独立生产构建通过（原Arco约583 kB提醒保留）。推送不代表全部业务验收或手动部署，上述未验与缺样本项继续保留。
