/** 老链接沿用当前视角；显式链接保持自己的查询范围，但不能越过卖家权限。 */
export function resolveOrderView(view: unknown, canSell: boolean, currentAudience: string): 'buy' | 'sell' {
  if (!canSell) return 'buy';
  return view === 'sell' || (view !== 'buy' && currentAudience === 'buyer') ? 'sell' : 'buy';
}

/** 页面展示身份不代表订单归属；操作必须同时满足归属和实际状态。 */
export function getOrderCapabilities(order: Api.RealOrder.DisplayRecord | undefined, userId?: string | number) {
  const isCustomer = userId !== undefined && !!order?.customerId && String(order.customerId) === String(userId);
  const isSeller = userId !== undefined && !!order?.shopperId && String(order.shopperId) === String(userId);
  const status = order?.status;
  return {
    isCustomer,
    isSeller,
    pay: isCustomer && status === 'PENDING_PAYMENT',
    cancel: isCustomer && status === 'PENDING_PAYMENT',
    confirm: isCustomer && (status === 'IN_TRANSIT' || status === 'AFTERSALE_CONFIRM'),
    refund: isCustomer && !!status && ['PROCURING', 'PROCURED', 'IN_TRANSIT', 'AFTERSALE_CONFIRM'].includes(status),
    review: isCustomer && (status === 'COMPLETED' || status === 'WARRANTY'),
    viewAftersale: (isCustomer || isSeller) && status === 'IN_AFTERSALE',
    logistics: (isCustomer || isSeller) && (status === 'IN_TRANSIT' || status === 'AFTERSALE_CONFIRM')
  };
}
