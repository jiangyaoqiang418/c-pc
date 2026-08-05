# C 端 PC 当前开发交接

> 更新时间：2026-08-05。此文件用于跨电脑、跨 Codex 会话恢复工作；开始开发前先核对实时代码、Swagger 和测试环境，不能仅凭本文声称完成。

## 当前目标

继续按梯队推进 C 端 PC 的 Mock 到真实接口迁移，并使用 Chrome 完成页面操作、接口结果、控制台和真实数据展示回归。已经接入真实接口的模块不得失败后自动回退 Mock，所有 Long ID 保留原值。

当前状态：**进行中**。主要前端开发和空态回归已推进，下一阶段重点是依赖后台环境和业务数据完成商品、秒杀、求购抢单、订单及押金的非空写链路。

## Git 基线

- 仓库：`c-pc`
- 分支：`main`
- 最近功能提交：`edaceae feat: 完成分类申请审核闭环`
- 交接后以 `git log -1 --oneline` 和 `git status -sb` 为最终依据。

## 当前进度口径

| 口径 | 当前记录 |
|---|---:|
| 接口契约严格满足度（A+B） | 约 25% |
| 接口契约覆盖度（A+B+C） | 约 53% |
| 已封装接口进度 | 约 53% |
| 已页面接入进度 | 约 58% |
| 真实回归通过进度 | 最新基线约 40%，其后又补充买手只读页及分类申请完整闭环，尚未重新统一计数 |
| C 端 PC 整体交付进度 | 约 47% |

百分比是开发估算，不代替真实验收。必须分别记录：Swagger 存在、API 已封装、页面已调用、真实数据回归通过。

## 最近已完成

- 买手申请 `2083573396550537218` 已审核通过，当前账号角色包含 `BUYER`。
- 买手页面按 Swagger “审核通过即授予买手身份”契约放行，不再附加无接口支撑的 KYC 入口门槛。
- Chrome 已验证买手工作台、可接求购、押金、商品、卖出订单、求购大厅、分类申请、秒杀报名和商品创建基础表单。
- 分类申请 `2084925388770336770` 已审核为 `APPROVED`，审核意见为 `1`。
- 审核生成分类 `2084936769859051521`，`source=APPLY`、`enabled=true`，已进入商品创建分类下拉。
- 分类申请页面已兼容毫秒时间戳，并展示申请时间和审核时间。
- `pnpm typecheck`、`git diff --check` 已通过；上述功能已推送远端。

## 当前未完成与原因

| 优先级 | 未完成链路 | 当前原因 | 恢复后的动作 |
|---|---|---|---|
| P0 | 商品图片上传、商品创建 | `/order/files/upload?dir=product` 返回 `code=-1`，MinIO 未配置 | 后台配置 MinIO 后，使用非个人 QA 图片在 Chrome 上传并提交商品，记录商品 ID |
| P1 | 商品审核、状态和上下架 | 当前买手名下商品 total=0 | 商品创建后由后台审核，再验证审核中、通过、驳回、在售和下架状态 |
| P1 | 秒杀报名闭环 | 可报名场次和在售商品均为 0 | 后台准备秒杀场次，使用审核通过且在售商品完成报名、列表和取消 |
| P1 | 求购抢单闭环 | 求购大厅 total=0 | 使用独立顾客账号准备一条可接求购，再用当前买手账号抢单并验证刷新及订单生成 |
| P2 | 买手订单动作 | 卖出订单 total=0 | 准备待付款、待发货等卖出订单，验证改价、列表、详情和状态变化 |
| P2 | 押金非空展示 | 押金余额和流水均为 0，且无划转接口 | 后台准备非零押金桶和至少一条押金流水后验证金额、占用率和流水 |

## 换电脑恢复步骤

```powershell
git clone git@github.com:jiangyaoqiang418/c-pc.git
cd c-pc
git pull --ff-only origin main
pnpm install
git status -sb
git log -3 --oneline
pnpm dev --host 127.0.0.1
```

如果仓库已经存在，只执行 `git fetch origin`、`git pull --ff-only origin main`、`pnpm install` 和状态检查。开发地址默认是 `http://127.0.0.1:5173`。

## 新会话启动指令

可以直接对新 Codex 说：

> 先阅读 `AGENTS.md`、`README.md`、`docs/current-handoff.md`、`docs/api-integration-plan.md`、`docs/api-swagger-match-matrix.md` 和 `docs/frontend-test-data-requirements.md`。核对当前代码、实时 Swagger 和测试环境后，从 `docs/current-handoff.md` 的未完成项继续。测试默认使用 Chrome，检查页面、接口、控制台和数据展示；一批完成后统一更新文档，中文提交并推送。

## 开发与测试约定

- 测试默认使用 `[@Chrome](plugin://chrome@openai-bundled)`；页面、接口结果、控制台和数据展示都要检查。
- Chrome 上传本地文件前，需要在扩展详情中开启 `Allow access to file URLs`；但当前首要阻塞仍是后端 MinIO 未配置。
- 不在文档或提交中记录密码、token 等敏感信息。
- 每批开发完成后统一更新本文及相关计划/矩阵，再使用中文 commit message 推送。
- 实时 Swagger 扫描先读取 `/v3/api-docs/swagger-config`，再按返回分组地址拉取文档。

## 相关文档

- [真实接口接入计划](./api-integration-plan.md)
- [Swagger 匹配矩阵](./api-swagger-match-matrix.md)
- [前端真实回归测试数据清单](./frontend-test-data-requirements.md)
