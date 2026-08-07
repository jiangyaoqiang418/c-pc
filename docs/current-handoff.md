# C 端 PC 当前开发交接

> 更新时间：2026-08-07。此文件用于跨电脑、跨 Codex 会话恢复工作；开始开发前先核对实时代码、Swagger 和测试环境，不能仅凭本文声称完成。

## 当前目标

继续按梯队推进 C 端 PC 的 Mock 到真实接口迁移，并使用 Chrome 完成页面操作、接口结果、控制台和真实数据展示回归。已经接入真实接口的模块不得失败后自动回退 Mock，所有 Long ID 保留原值。

当前状态：**进行中**。主要前端开发和空态回归已推进；本轮新增接入地址、保证金和充值链接口。下一阶段仍依赖后台环境和业务数据完成商品、秒杀、求购抢单、订单及资金写链路回归。

## Git 基线

- 仓库：`c-pc`
- 分支：`main`
- 最近功能提交：`edaceae feat: 完成分类申请审核闭环`
- 交接后以 `git log -1 --oneline` 和 `git status -sb` 为最终依据。

## 当前进度口径

| 口径 | 当前记录 |
|---|---:|
| 接口契约严格满足度（A+B） | 约 25%，本轮新契约待 order Swagger 恢复后统一重算 |
| 接口契约覆盖度（A+B+C） | 约 53%，本轮新契约待 order Swagger 恢复后统一重算 |
| 已封装接口进度 | 约 53%，本轮地址、保证金、充值链、KYC 详情接入后待统一重算 |
| 已页面接入进度 | 约 58%，本轮地址、保证金、充值链、KYC 详情接入后待统一重算 |
| 真实回归通过进度 | 最新基线约 40%，地址新增、编辑、回读与设默认已完成真实写入回归 |
| C 端 PC 整体交付进度 | 约 47%，待统一重算 |

百分比是开发估算，不代替真实验收。必须分别记录：Swagger 存在、API 已封装、页面已调用、真实数据回归通过。

## 最近已完成

- 买手申请 `2083573396550537218` 已审核通过，当前账号角色包含 `BUYER`。
- 买手页面按 Swagger “审核通过即授予买手身份”契约放行，不再附加无接口支撑的 KYC 入口门槛。
- Chrome 已验证买手工作台、可接求购、押金、商品、卖出订单、求购大厅、分类申请、秒杀报名和商品创建基础表单。
- 分类申请 `2084925388770336770` 已审核为 `APPROVED`，审核意见为 `1`。
- 审核生成分类 `2084936769859051521`，`source=APPLY`、`enabled=true`，已进入商品创建分类下拉。
- 分类申请页面已兼容毫秒时间戳，并展示申请时间和审核时间。
- `pnpm typecheck`、`git diff --check` 已通过；上述功能已推送远端。

## 2026-08-07 user 新接口接入与地址写入回归

- 地址：新增 `src/service/api/address.ts` 与真实类型；地址管理页和结算地址选择器已迁移到 `/user/addresses/*`，包含列表、新增、编辑、默认和删除。前端新增国家/地区字段，避免用默认值伪造后端必填 `country`；编辑时保留页面未开放编辑的邮编、证件号和标签。
- 买手保证金：`/buyer/deposit/page`、`/buyer/deposit/pay`、`/buyer/deposit/refund` 已接入。页面的“充值押金”“转出至钱包”改为真实金额确认框，并为每次写操作传入 UUID 幂等键、校验钱包或可用保证金余额；工作台三个押金入口已统一进入押金管理。order 统计失败不会阻断押金主体数据加载。
- 充值：充值页链选项由 `/recharge/chains` 动态读取，使用后端 `enabled`、`label`、`minAmount` 和 `decimals`，不再固定 ETH/TRON/BSC；独立记录链配置加载状态。
- KYC：`/kyc/detail` 已接入，页面展示真实姓名、脱敏证件号、提交/审核时间与驳回意见；已封装 `/kyc/submit`，但由于真实图片上传链路和 MinIO 尚未恢复，页面继续禁用提交，避免发送模拟图片 URL。
- 实时 Swagger 可读取 `admin`（107 路径/108 操作）和 `user`（32 路径/32 操作）；`order` 文档和分类树已恢复可读，`notify` 仍 404。订单、商品、求购、秒杀和上传写链路仍需按测试数据前置条件推进。
- Chrome 已完成地址新增、编辑、回读及设默认的真实写入回归；两条 QA 地址按用户授权保留，第二条为默认地址。未执行 `pnpm typecheck` 或构建。

## 当前未完成与原因

| 优先级 | 未完成链路 | 当前原因 | 恢复后的动作 |
|---|---|---|---|
| P0 | 商品图片上传、商品创建 | `/order/files/upload?dir=product` 返回 `code=-1`，MinIO 未配置，且当前 order 网关/Swagger 返回 404 | 后台恢复 order 服务并配置 MinIO 后，使用非个人 QA 图片在 Chrome 上传并提交商品，记录商品 ID |
| P0 | 地址删除回归 | 地址的新增、编辑、回读和设默认已通过；测试数据按用户授权保留 | 如需覆盖删除接口，删除一条已保留的 QA 地址后回读确认 |
| P0 | 保证金缴纳/退还回归 | 当前钱包和保证金余额为 0 | 后台准备非零余额和保证金桶，验证金额、流水、余额刷新与幂等写入 |
| P1 | KYC 提交/审核闭环 | 提交接口已出现，但没有可用的真实图片上传链路 | 恢复上传后提交测试 KYC，使用 admin 审核接口验证状态与意见回显 |
| P1 | 商品审核、状态和上下架 | 当前买手名下商品 total=0，且 order 网关异常 | 恢复 order 服务后创建商品，由后台审核，再验证审核中、通过、驳回、在售和下架状态 |
| P1 | 秒杀报名闭环 | 可报名场次和在售商品均为 0，且 order 网关异常 | 后台恢复服务并准备秒杀场次，使用审核通过且在售商品完成报名、列表和取消 |
| P1 | 求购抢单闭环 | 求购大厅 total=0，且 order 网关异常 | 使用独立顾客账号准备一条可接求购，再用当前买手账号抢单并验证刷新及订单生成 |
| P2 | 买手订单动作 | 卖出订单 total=0，且 order 网关异常 | 准备待付款、待发货等卖出订单，验证改价、列表、详情和状态变化 |

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
