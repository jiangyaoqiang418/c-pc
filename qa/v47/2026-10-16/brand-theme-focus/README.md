# Logo主题色与手机聚焦缩放修复

2026-10-16，范围为c-pc及其手机响应式页面，独立c-h5项目未修改。本记录接续此前品牌素材替换，不更新接口计划顶部的承接状态。

## 改动

- 官方两个SVG及favicon保留原文件。横版从原始SVG派生为Vue内联组件，仅U字母填充改为`var(--green)`、其余字母改为`var(--ink)`；猫咪路径、填充和描边不变，图形比例不变。移除派生组件中的固定id，避免页头/页脚重复id。
- 共用Logo组件保留现有容器宽度和700px断点，桌面显示横版、手机显示原猫咪，去掉固定黑底。页头、页脚及聊天顶部共用这一逻辑；不对整张Logo加变色滤镜。
- viewport增加`maximum-scale=1.0`，保留原始设备宽度、初始比例和软键盘布局策略。手机及粗指针设备的普通输入、密码、文本域、select和可编辑内容统一16px，覆盖局部较小字体；原型大金额输入保留既有字号，不修改桌面字号。
- 基础参考CSS已有部分16px规则，但后续局部主题/组件样式仍可能覆盖。修复在集成层兜底，不修改冻结参考CSS，不新增依赖。

## 验证

- 类型检查和生产构建通过，diff检查通过。临时源码比对确认横版的path/circle几何与原SVG一致，猫咪组内容一致；没有新增测试文件。
- Chrome桌面切换MEME和深海蓝橙：页头/页脚字母分别读取到主色`rgb(182,243,107)`与`rgb(36,70,107)`，文字色分别为`rgb(242,242,237)`与`rgb(23,46,72)`，底衬均透明，桌面搜索字号仍为15px。
- Chrome 375×812：帮助搜索聚焦前后`visualViewport.scale=1`，输入字体16px，无横向溢出。临时DOM样本覆盖text/password/email/number/textarea/select/contenteditable；MEME密码框16px、大金额30px。样本检查后已移除，没有登录、输入账号凭据或执行业务写入。
- 截图：desktop-meme.png、desktop-navy.png、mobile-focus.png。检查后恢复MEME配色、默认视口并关闭临时标签。
- Chrome响应式检查不能替代iPhone软键盘与Safari真机验收。`maximum-scale`并非所有浏览器都严格执行，iOS可能仍允许用户主动缩放，见[WebKit交互说明](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)。本次不通过拦截触摸手势强制阻止浏览器行为。
