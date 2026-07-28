# BW Shop PC 端原型

Vue3 + Vite + Arco Design 的 PC 端原型工程。

## 启动

```bash
cd client/pc
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # 产物 dist/
pnpm typecheck
```

## 目录

```
src/
├── main.ts / App.vue
├── router/                # vue-router
├── layouts/               # default / buyer / checkout
├── stores/                # Pinia
├── views/                 # 按模块组织（home / product / order / wallet / finance / ...）
├── components/            # 公用组件
├── composables/
└── styles/tokens.scss
```

Mock 层已内置于 `src/mock/`。`@shared/*` 仅为 PC 内部别名，不依赖仓库根目录的 `shared/`：

- `@shared` — 主入口（auth/product/order/wallet/finance/... mock API）
- `@shared/api/<module>` — 直接引用具体模块
- `@shared/mock/data/<file>` — 直接引用 seed 数据池
- `@shared/enums/<file>` — label / color / icon 映射
- `@shared/utils/format` — 金额 / 积分 / 利率 / 地址简短化
- `@shared/constants` — MOCK_USERS / BRAND / THEME

## 模块进度

- [x] Phase 0：基础设施（当前）
- [ ] Phase 1：核心电商（首页 / 商品 / 购物车 / 订单）
- [ ] Phase 2：钱包 / 理财 / KYC / VIP
- [ ] Phase 3：售后 / 求购 / 评价 / IM / 公告
- [ ] Phase 4：买手中心 / AI 导购 / 完善
