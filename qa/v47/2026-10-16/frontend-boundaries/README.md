# v47 前端独立收尾：列表承载与弹窗边界

2026-10-16，基线 `main@1c47373`。本批为本地工作区改动，未提交、推送或发布。接续 frontend-independent，保留主线程的后端文档和其他已有改动。没有新增依赖，没有修改 H5、后台、冻结原型 CSS 或素材。

## 本批实际修改

1. 商品列表排序恢复 v47 的原生 select。原自定义选择框高 38px，原型为 35px，导致整个商品网格下移 3px；修后桌面工具栏和首行卡片位置对齐，五种排序沿用原参数。
2. 商品列表恢复原型连续浏览：初始展示 24 条，按 12 条揭示缓存，靠近末尾自动续载，也保留原型“继续浏览”按钮。底层仍用现有分页 API，尊重服务端实际 size，保留 Long 字符串，追加去重。追加失败保留已显示内容并重试原页；筛选切换、重复点击及卸载的旧响应不覆盖新上下文。原 page 查询仍作为读取起点兼容，不再显示页码控件。
3. 地区弹窗关闭恢复可见焦点。桌面入口仍可见时返回“中国大陆”；跨到手机断点、入口已隐藏时返回 main-content。验证等待退出动画和节点卸载完成，避免将过渡中的 body 焦点作为最终结果。首次 ref 方案不能可靠取得 as-child 按钮，已改为定位保留在实际按钮上的标记并复验。
4. DEV 入口增加 catalog，只使用既有 50 条原型商品和分类，收藏不执行，分类及商品读取明确从隔离夹具提供。生产入口不传夹具，接口失败不回退演示数据。components 增加本地忙碌及实际 Modal.confirm 二级确认；gallery 增加可清理的 requestAnimationFrame 采样器，不进入生产入口。

## 已验证

| 范围 | 本轮结果及证据 |
| --- | --- |
| 列表承载 | Chrome 本地页面先 24 条，点击后 36 条，后续 IntersectionObserver 自动续载至 50 条，50 个标题唯一，无页码。第二次点击前已自动完成，不登记第二次点击成功。见 catalog-feed.json |
| 排序 | 原生选择框 96×35px，五种排序均正常更新结果。catalog-sort.json 是恢复连续浏览之前的排序检查，因此其 20 条数量不作为最终初始数量；最终 24 条见 catalog-feed.json |
| 断点 | Chrome 320/375/700/701px，工具栏坐标与宽高逐一匹配原型，无横向文档溢出；见 catalog-breakpoints.json。320px 筛选面板初焦点关闭按钮，Tab 留在面板，Esc 返回筛选入口并解除滚动锁，见 catalog-filter-keyboard.json |
| 27 配色 | Chrome 1440×900，下拉控件、首卡和工具栏 27 套均保持默认 MEME 布局；首卡 274/254.796875/269.25/490.484375，工具栏 1119×35px。颜色记录在 catalog-palettes-27.json；这是该页面默认态，不是全站所有配色状态通过 |
| 嵌套确认及忙碌 | 使用实际 FeedbackHost、Modal.confirm 和 BusinessDialog：顶层取消初焦点；Esc 仅关闭子层，回到父层触发按钮，父层滚动锁仍在。忙碌状态 Esc 不关闭，关闭/取消/确定均禁用；解除后可关闭。见 nested-busy.json、02-nested-confirm-desktop.png |
| 取消与拖拽中禁用 | Chrome CDP 触摸输入拖动 53px 后 touchCancel：位移清空、dragging=false、弹窗保留。鼠标仍按下时键盘切到本地忙碌：位移同样清空且关闭禁用。见 drag-cancel-busy-chrome.json。不是实机触摸/系统键盘验收 |
| 减少动态效果 | Chrome 模拟 prefers-reduced-motion:reduce，弹窗 animation/transition、遮罩 transition 均 none，页面 scroll-behavior=auto；已恢复模拟设置。见 reduced-motion-chrome.json |
| 账户/地区 | 375×812 账户 Tab 留在抽屉；入场结束后面板 375×568.71875、底部 812。Esc 回到顾客入口并解除滚动/指针锁。地区桌面关闭回到原按钮，跨断点关闭回到 MAIN#main-content。见 account-mobile-keyboard.json、region-focus-before/after.json、03-account-mobile.png。早期账户截图处于入场中，已用入场结束后的截图替换 |

## 静态视觉与保留差异

来源为 `D:/other_code/w3/Umaomao-v47/dist`，实现为 `http://127.0.0.1:5175/visual-v47.html?view=catalog`。默认 MEME、相同 50 条商品、未登录、页首；Chrome CSS 1440×900、DPR1，双方采集图像均 1425×891。没有缩放或掩码；只接受相同图像坐标的局部比较，不登记整页 1440×900 精确像素通过。

- 字体：对应工具栏、首卡标题与正文的字体族、字号、行高、字重及换行已核对；排序修后网格 top=254.796875。
- 间距：筛选栏、工具栏、首行卡片与图片的坐标、宽高及内边距对齐；700/701 的工具栏切换正确。
- 颜色：MEME 对应节点颜色与边框对齐；27 配色默认态几何一致，未把几何检查当作所有状态颜色像素通过。
- 图像：使用冻结原图，首行四图 naturalWidth 为 1000/1000/800/900，全部加载；未重画、替换或拉伸。
- 文案：商品名、简介、售后、销量及金额使用原型数据；工程已有的新版 Logo、公开动态汇率和生产页脚差异保留，不当成此次缺陷。

`catalog-compare-before.png` 为修改前并排图；`catalog-compare-desktop.png`、`catalog-compare-mobile.png` 为修后并排图；`catalog-focused-desktop.png` 为局部原尺寸比较，均已打开检查。固定区域 `(274,197,1393,745)` 共 613212 像素，有 92 像素色差，集中在 ITEM #004 标记的 8×16 区域，最大单通道差 5，按 P3 保留；不宣称零差分或整站还原百分比。详见 catalog-pixel-region.json、catalog-residual-detail.png。

## 动画连续帧未通过

Chrome 后段连续连接超时，未通过 shell/其他自动化绕过。切换 IAB 补采，requestAnimationFrame 出现约 1016ms 间隔；短暂显示浏览器后仍存在，已恢复原可见性和视口。该环境不能据此验收间隔 80ms 的反向切换。

- motion-reference-desktop-unaccepted-iab.json、motion-implementation-desktop-initial-unaccepted-iab.json、motion-implementation-visible-unaccepted-iab.json 均是**拒收的诊断轨迹**，不是通过证据。最后一份明确 accepted=false。
- reference-motion.html 是 QA 目录中原型 HTML 的独立包装，base 指向只读原型服务，仅增加按钮驱动原有分享/关闭事件及 DOM 采样。运行于独立 localhost 来源，不读生产账号；原型源码未改。可在具备稳定前台帧率的 Chrome 中继续对照。
- 分享弹层、公共弹窗等继续沿用冻结 modal Vue Transition。未为规避采样问题另写动画或修改原型时长；快速反向完整轨迹仍待验，不能认定实现与原型不一致，也不能认定一致。

## 自动检查与剩余

- `pnpm test`：现有 9 文件 **298 项通过**，新增 4 项均位于既有 page.test.ts，验证实际 CatalogView setup，没有新增测试文件或框架。
- `pnpm typecheck`：通过；DEV 采样器加入后再次通过。
- 原型契约检查通过：17 CSS、129 素材、50 商品、27 配色；额外检查 catalog 的显式数据源、分类短路和收藏隔离，见 reference-contract.json。
- 配色生成一致性检查及 `git diff --check` 通过。无依赖、构建配置变更，未重复生产构建。

未执行任何真实业务接口联调、账号切换、地址/退款提交、商品写入或资金操作；页面的参考汇率仍匿名读取公开行情。主线程后端整改文档未在本批修改。

仍可独立推进的范围：其他未覆盖页面/重要状态的同数据像素对照；地址和售后等实际表单的局部回归（本轮仅验证它们复用的公共确认链路）；稳定前台环境中的连续反向动画。实机键盘和安全区另需设备证据。本批局部通过不代表整个 v47 完成。
