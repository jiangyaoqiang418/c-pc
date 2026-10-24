/** Return destinations must remain inside the application. */
export function prerequisiteReturnPath(value: unknown, currentPath: string) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u0020]/.test(value) || /%(?:2f|5c|0[ad])/i.test(value)) return '';
  const path = value.split(/[?#]/, 1)[0];
  if (path === currentPath || path.startsWith('/auth/')) return '';
  return value;
}

// Only an explicit prerequisite detour retains a draft in this tab's memory.
// Session changes discard it; credentials and identity documents are never included.
let buyerApplicationDraft: { owner: string; session: number; form: Api.RealBuyer.BuyerApplyParams } | undefined;
export function saveBuyerApplicationDraft(owner: string | number, session: number, form: Api.RealBuyer.BuyerApplyParams) {
  buyerApplicationDraft = { owner: String(owner), session, form: { realName: form.realName, contact: form.contact, reason: form.reason } };
}
export function takeBuyerApplicationDraft(owner: string | number | undefined, session: number) {
  const draft = buyerApplicationDraft;
  buyerApplicationDraft = undefined;
  return owner !== undefined && draft?.owner === String(owner) && draft.session === session ? draft.form : undefined;
}
export function clearBuyerApplicationDraft() { buyerApplicationDraft = undefined; }

interface WithdrawDraft { asset: Api.RealWallet.Asset; chain: Api.RealWallet.WithdrawCreateParams['chain']; toAddress: string; amount: string; }
let withdrawDraft: { owner: string; session: number; form: WithdrawDraft } | undefined;
export function saveWithdrawDraft(owner: string | number, session: number, form: WithdrawDraft) {
  withdrawDraft = { owner: String(owner), session, form: { asset: form.asset, chain: form.chain, toAddress: form.toAddress, amount: form.amount } };
}
export function takeWithdrawDraft(owner: string | number | undefined, session: number, asset: Api.RealWallet.Asset) {
  const draft = withdrawDraft;
  withdrawDraft = undefined;
  return owner !== undefined && draft?.owner === String(owner) && draft.session === session && draft.form.asset === asset ? draft.form : undefined;
}
export function clearPrerequisiteDrafts() { clearBuyerApplicationDraft(); withdrawDraft = undefined; }
