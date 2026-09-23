/** J1 只建立支付单；J2 接好钱包转账与恢复后才允许对用户开放入口。 */
export const walletPayEntryEnabled = import.meta.env.VITE_WALLET_PAY_ENTRY_ENABLED === 'true';
