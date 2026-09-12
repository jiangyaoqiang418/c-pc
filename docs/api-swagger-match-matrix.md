# Swagger 真实接口匹配矩阵

> 本矩阵仅维护契约、API/类型、页面调用和真实验证四层；当前问题、责任方及后续验收统一见 [接口接入计划](./api-integration-plan.md)。旧日期流水账及已被替代的缺口由Git追溯，不作为当前事实。

## 契约来源与最近检查

- Knife4j：`http://221.128.249.198:8902/doc.html`；后台协作使用部署站 `https://testhou.merchantsale.store/`。本地 C-PC 使用5173，不把后台管理站当Swagger入口。
- 2026-09-08 已运行 `pnpm check:swagger`：admin **202/203/338**、user **50/50/92**、order **73/75/113**、notify **22/22/35**（路径/操作/Schema），关键契约通过。user/notify历史404已恢复，不再列当前缺接口。Trace响应头不能代替业务验收。
- 路径以服务分组标识：例如 user 的 `/auth/me`；实际同源前缀由请求层配置，业务ID作为不透明原值，不作数值运算。
- 9月8日类型、9文件205项现有测试、生产构建及diff检查通过；Arco583.19 kB为已有构建提醒。未新增测试文件/依赖；未提交推送发布，检查通过不等于页面或写入闭环。

## 最新变更四层核对

依据工作区 `20260905_C-PC_后端变更执行清单.md`，当前为**部分完成**。表中浏览器结果为9月5日契约适配后证据；9月6日显示层补验另列，不能相互替代。

9月8日依据三端执行计划补齐：商品/求购分类使用当前启用树的完整三级路径，提交前刷新复核；CategoryNodeDTO.parentId没有required声明，允许随嵌套路径省略，但拒绝明确错父级、错误层级和未明确启用的节点。create/create-batch同键异参-311仅后端回复明确，Swagger仍描述旧单返回；请求HTTP错误保留业务code，checkout即使首次HTTP400/-311也保留原键原参数，不自动重建。错误增加可选去重traceId，不记录敏感请求或改变成功响应。均为代码适配，不是新订单真实冲突验收。

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

下面是当前仍在使用的核心接口与已有验证基线。历史正常交易验收不能替代上表新金额/幂等/已读等契约变更的再验收。

| 能力 | 服务及契约 | API/类型 | 页面调用 | 有效验证及保留边界 |
|---|---|---|---|---|
| 注册/登录/身份 | user：POST `/auth/register`、`/auth/login`；GET `/auth/me` | 已封装；成功码1，统一解包/错误；临时凭证确认后切换 | 登录页Mock账号及快捷入口已移除，正常登录/注册和回跳不变；未扩全仓Mock清理 | Chrome本地登录页只读确认入口清理，类型/203测试通过；历史真实登录、QA注册、身份切换及401/503证据保留，本次未重新登录；并发/迟到/真实撤权未完整验 |
| 积分/VIP | user：GET `/points/account`、`/points/rules`、`/points/vip-configs` | 已封装C端公开规则，不再借admin权限 | 积分/VIP/个人中心调用，公开与登录状态分开 | 真实规则、VIP及KYC积分非空已验；未知类型/配置变化等边界待验 |
| 积分申诉 | user：POST `/points/appeals/submit`、`/points/appeals/page` | ledgerId/reason及分页已封装 | 流水申诉、记录页、版本保护弹窗已调用 | 列表/筛选空态已验；非空提交及慢写入重开待验 |
| 首页/分类 | order：GET `/categories/tree`、`/banners/list`、`/storefront/recommend`、`/storefront/flash-sale`；POST榜单分页 | 已封装分类Long、时间/金额/必需数组校验 | 导航、首页、分类和表单选择器已调用 | 非空商品榜单、分类及分项失败已验；非空活动/秒杀及>24分类商品待验 |
| 公开商品 | order：POST `/storefront/products/page`；GET `/storefront/product/detail` | 已适配分页/排序/分类/价格/卖家/审核及售后 | 列表、详情、购物车与立即购买已调用 | 搜索、分类、详情、库存与本人禁购已验；同店sellerId查询仍缺，不以my/page替代 |
| 收藏/浏览 | order：POST/DELETE `/products/favorite`、POST `/products/favorites/page`、`/storefront/browse`、`/products/view` | 已封装，真实失败不乐观伪成功 | 详情/收藏已调用；进入详情有浏览记录副作用 | 收藏/取消回读已验并清理QA收藏；只读批次不进入商品详情冒称零写入 |
| 买手商品/文件 | order：products/create与demands/create的categoryId已明确第三级，启用树默认true | 共用有效三级选项/验证，显式onlyEnabled=true，ID原值 | 两种创建移除中间层可选；提交前新树复核，失败/失效不创建且保留表单；求购异步后再核地址并保持确认快照 | 现有测试覆盖三级/低级叶子/停用祖先/错父级/省略父ID/过期/读取失败；两页三级选择/路径回显已验，清除重选与新创建未验，分类由用户配置、前端未造数；其他商品能力保留历史证据 |
| 分类申请/秒杀 | order：`/categories/apply/my/page`、`/categories/apply/submit`、`/flash-sale/sessions/available`、`/flash-sale/my`、`/flash-sale/enroll` | 已封装申请/审核字段、报名/取消、场次商品组合键 | 买手分类及秒杀页调用 | 历史分类申请→审核→分类树、秒杀报名/取消闭环已验，QA场次已停用；新版慢写入/深页未验 |
| 买手身份 | user：GET `/buyer/application`、POST `/buyer/apply` | BUYER角色守卫，不擅加KYC门槛；未知提交核实状态 | 申请、工作台与买手路由调用 | 历史申请/后台批准/权限回读已验；审核状态变化、失败及权限撤销待验 |
| 购物车 | 本地Pinia/storage，无远端购物车契约 | 账号缓存、库存复核、同源锁和独立结算快照 | 购物车/立即购买/结算已使用 | 双标签增删改选同步及恢复空车已验；坏缓存和真实付款后并发待验 |
| 地址 | user：GET `/addresses/list`；POST `/addresses/create`；PUT `/addresses/update`、`/addresses/default`；DELETE `/addresses/delete` | 原Long、country/detailAddress/defaultFlag、返回ID与回读分离 | 管理、结算/求购共用选择器 | CRUD及保存成功后列表503重试已验；临时QA地址清理，结算在途失效待验 |
| 下单/订单 | order：POST `/orders/create-batch`、`/orders/bought/page`、`/orders/sold/page`；GET `/orders/detail` | orderGroupNo、幂等缓存；内部ID与展示号分离，未知状态不变可写 | 结算、买卖列表/详情、工作台/个人中心统计 | 历史跨账号主链及列表第二页回读已验；新版付款见上表 |
| 订单动作/物流 | order：`/orders/price`、`/orders/cancel`、`/orders/confirm`、`/orders/ship`、`/orders/logistics`、`/orders/logistics/track/create`、`/orders/logistics/exception/mark` | 状态/归属保护、动态carrier与名称快照、凭证/地址可选字段；productId实际可null，类型已补 | 卡片、详情、发货/物流弹窗调用；无商品订单保留内容，不生成无效商品跳转 | 历史发货/轨迹/签收已验；9月6日同单2093369377466966017详情/物流API均采购1+发货1，Chrome物流3节点及发货凭证区已验，图片预览未验。purchaseVouchers已保留但详情无原展示入口，记消费者差异而非后端缺字段，不扩交互；新上传/动态字典发货/物流异常闭环待验 |
| 仅退款 | order：`/orders/refunds/create`、`/orders/refunds/bought/page`、`/orders/refunds/detail`、`/orders/refunds/cancel`及by-key | 真实REFUNDED不映射归档；旧简单退款/Mock不回退 | 买家创建/详情/撤销和买手售后列表调用 | 历史申请/撤销/驳回/同意与余额冻结解冻/库存回补已验；新幂等场景见上表。不冒充全部五类售后工单 |
| 钱包/充值/提现 | user：`/wallet/overview`、`/wallet/ledger/page`、`/recharge/chains`、`/recharge/address`、充值/提现create/detail/page及by-key；WithdrawVO.actualAmount为申请额扣手续费后金额，非到账证明 | 账户桶、原bizGroup/bizType、缺金额保持未知、真实业务ID；提现不改金额和状态 | 钱包/流水、买手钱包、充值/提现页已调用；提现三处标签改“扣费后金额” | 3A Chrome本地原QA账号5条提现及APPROVED/REJECTED详情只读核对；列表/APPROVED详情刷新后新标签已验，新申请回执未触发。历史申请/审核/驳回不替代地址配置、取消申报、真实链上出款及新幂等验收 |
| 买手押金 | user：`/buyer/deposit/page`、`/buyer/deposit/pay`、`/buyer/deposit/refund`及wallet overview | 原方向/金额/幂等键、真实流水ID；不支持独立划转则不伪造 | 押金页、工作台及买手钱包 | 历史1 U缴纳→余额/流水→退还恢复已验；故障同键恢复/跨标签仍待验 |
| 理财 | user：GET产品list/detail、订单overview/detail；POST订单subscribe/page/redeem及by-key | 产品在售/费用校验，缺金额不补零；赎回只核实同ID | 产品/详情/锁仓列表/详情及提前赎回调用 | 历史订阅/赎回不覆盖新幂等；9月6日纠正错误详情地址后，正式/finance自然显示暂无可申购产品、锁仓/待结算收益0.00，Network三个子请求各HTTP200；随后同文档QA身份独立API读取三个code=1，产品数组0项、收益4个金额字段为合法零字符串且holdingCount为数值0、钱包distribution内FINANCE_LOCKED.amount为合法零字符串；不是同一页面响应体捕获。非空产品/费用/恢复及受控异常待验 |
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
