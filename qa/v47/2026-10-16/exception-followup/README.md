# v47 异常恢复与后端剩余条件复核

日期：2026-10-16；基线`main@cffc4db`及本轮工作区。只推进c-pc功能，无新增依赖，无H5/后台代码或资金操作。

- `backend-conditions.json`：北京时间12:43公开只读。七类帮助、公告空；五类协议-322；四个评价模型仍为旧四主题。此快照不含登录凭据或私有响应。
- `response-loss.json`：Chrome对真实成功响应做定向丢弃。收藏POST和helpful PUT均HTTP200/code1后失败，页面从权威接口恢复正确结果；最终false/0恢复，拦截清空，退出会话及关闭临时标签。
- `favorite-response-loss-recovered.jpg`：收藏丢响应后已收藏；`helpful-response-loss-recovered.jpg`：投票丢响应后helpful=true/count=1。截图是功能证据，不是像素对照或资金证明。

新增8条既有测试覆盖原方向、旧会话、卸载、连续缩页及金额变化撤销确认。品牌查询使用真实SFC脚本的10个临时隔离场景检查，未新增测试文件。完整检查见`design-qa.md`顶部。

跨标签补focus/visibility只读回读，隔离事件回归通过；Chrome自动化bringToFront未可靠观察到刷新，完整真实跨标签验收仍未完成。丢响应测试不覆盖服务端延迟可见、-305繁忙、并发或在途账号切换。不将模拟事件当作浏览器通过。
