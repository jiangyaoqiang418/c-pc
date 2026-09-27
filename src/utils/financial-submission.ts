import { RequestError, isDefinitiveRejection } from '@/service/request/type';
import { getAccessToken } from '@/service/request/token';
import { sumPaymentAmounts } from '@/utils/checkout';

/** 不排队重放确认动作；锁覆盖持久化及请求，其他标签只能核对原操作。 */
export async function withSubmissionLock<T>(key: string, submit: () => Promise<T>): Promise<T> {
  if (!navigator.locks) {
    throw new RequestError('当前浏览器不支持安全提交，请使用新版浏览器', { code: 'SUBMISSION_LOCK_UNAVAILABLE' });
  }
  const session = getAccessToken();
  return navigator.locks.request(`cpc:submission:${key}`, { ifAvailable: true }, async lock => {
    if (!lock) throw new RequestError('该操作正在其他页面提交，请核对结果，勿重复操作', { code: 'SUBMISSION_IN_PROGRESS' });
    if (getAccessToken() !== session) {
      throw new RequestError('登录会话已切换，本次尚未提交，请重新确认', { code: 'SESSION_CHANGED' });
    }
    return submit();
  });
}

type FinancialAction = 'withdraw' | 'recharge' | `finance-subscribe:${string}` | `finance-redeem:${string}`;

/** 结算锁之后按固定顺序取得原订单锁；失败立即释放，不排队，也不转换业务 ID。 */
export async function withOrderSubmissionLocks<T>(userId: string | number, orderIds: readonly (string | number)[], submit: () => Promise<T>): Promise<T> {
  if (!validReceipt(userId) || !Array.isArray(orderIds) || !orderIds.length || !orderIds.every(validReceipt)) {
    throw new Error('付款订单或账号无效，请重新核对');
  }
  const ids = [...new Set(orderIds.map(String))].sort();
  if (ids.length !== orderIds.length) throw new Error('付款订单存在重复，请重新核对');
  const session = getAccessToken();
  const acquire = (index: number): Promise<T> => {
    if (getAccessToken() !== session) throw new RequestError('登录会话已切换，本次尚未提交，请重新确认', { code: 'SESSION_CHANGED' });
    return index === ids.length ? submit() : withSubmissionLock(refundIntentKey(userId, ids[index]), () => acquire(index + 1));
  };
  return acquire(0);
}

export interface DepositOperation {
  kind: 'pay' | 'refund';
  amount: number;
  idempotencyKey: string;
}
const depositSubmitting = new Set<string>();

function depositLockKey(userId: string | number) {
  return `cpc:deposit-pending:${encodeURIComponent(String(userId))}`;
}

/** 每次押金提交使用新幂等键，仅防止同一时刻重复提交。 */
export async function submitDepositOperation(
  userId: string | number,
  kind: DepositOperation['kind'],
  amount: number,
  submit: (operation: DepositOperation) => Promise<string | number>
) {
  const key = depositLockKey(userId);
  return withSubmissionLock(key, async () => {
    if (depositSubmitting.has(key)) throw new Error('押金操作正在提交，请勿重复操作');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('请输入正确的保证金金额');
    const operation: DepositOperation = { kind, amount, idempotencyKey: crypto.randomUUID() };
    depositSubmitting.add(key);
    try {
      const id = await submit(operation);
      if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) {
        throw new RequestError('未取得可核对的保证金流水编号，请核对余额和流水', { code: 'UNKNOWN_OPERATION_RESULT' });
      }
      return id;
    } finally {
      depositSubmitting.delete(key);
    }
  });
}
export interface FinancialSnapshot {
  amount: string | number;
  chain?: string;
  toAddress?: string;
  productId?: string | number;
}
const pendingMessage = '上次资金操作尚未取得确定结果，请先查看记录并联系平台核实，暂不可重复提交';

interface RefundIntent {
  userId: string | number;
  params: Api.RealRefund.RefundApplyParams;
  receipt?: string | number;
}
function refundIntentKey(userId: string | number, orderId: string | number) {
  return `cpc:refund-intent:${encodeURIComponent(String(userId))}:${encodeURIComponent(String(orderId))}`;
}
export function readRefundIntent(userId: string | number, orderId: string | number): RefundIntent | undefined {
  const raw = localStorage.getItem(refundIntentKey(userId, orderId));
  if (raw === null) return;
  const value = JSON.parse(raw) as RefundIntent;
  if (!value || String(value.userId) !== String(userId) || String(value.params?.orderId) !== String(orderId)
    || typeof value.params.reason !== 'string' || !Array.isArray(value.params.evidenceImages)
    || value.params.evidenceImages.some(item => typeof item !== 'string')
    || (value.receipt !== undefined && !validReceipt(value.receipt))
    || (value.params.idempotencyKey !== undefined && !/^[0-9a-f-]{36}$/i.test(value.params.idempotencyKey))) {
    throw new Error('原退款申请记录无法读取，请先到我的售后核实');
  }
  return value;
}

/** 有键的原申请才能回查并按同参重试；无键旧记录永远不补键重发。 */
export async function submitRefundIntent(userId: string | number, params: Api.RealRefund.RefundApplyParams, api: {
  lookup: (key: string) => Promise<Api.RealRefund.RefundDTO | null>;
  submit: (params: Api.RealRefund.RefundApplyParams) => Promise<string | number>;
}, restoring = false) {
  const key = refundIntentKey(userId, params.orderId);
  const snapshot = { orderId: params.orderId, reason: params.reason, evidenceImages: [...(params.evidenceImages || [])] };
  return withSubmissionLock(key, async () => {
    const previous = readRefundIntent(userId, params.orderId);
    if (restoring && !previous) throw new Error('原申请记录已变化，请重新读取');
    if (previous && !previous.receipt && !restoring) throw new Error('已有待核对退款申请，请先恢复原申请');
    if (previous && restoring && previous.receipt) return previous.receipt;
    const intent: RefundIntent = previous && !previous.receipt ? previous
      : { userId, params: { ...snapshot, idempotencyKey: crypto.randomUUID() } };
    if (!intent.params.idempotencyKey) throw new Error('旧申请没有幂等键，请仅到我的售后核实，不会重发');
    const session = getAccessToken();
    if (previous && !previous.receipt) {
      const result = await api.lookup(intent.params.idempotencyKey);
      if (getAccessToken() !== session) throw new Error('账号已切换，原申请保留待核对');
      if (result !== null) {
        if (!result || String(result.buyerId) !== String(userId) || String(result.orderId) !== String(intent.params.orderId)
          || result.reason !== intent.params.reason || JSON.stringify(result.evidenceImages || []) !== JSON.stringify(intent.params.evidenceImages)
          || !((typeof result.refundId === 'string' && result.refundId.trim()) || (typeof result.refundId === 'number' && Number.isSafeInteger(result.refundId)))) {
          throw new Error('原退款回查归属或参数不一致，请到我的售后核实');
        }
        localStorage.setItem(key, JSON.stringify({ ...intent, receipt: result.refundId }));
        return result.refundId;
      }
    }
    localStorage.setItem(key, JSON.stringify(intent));
    const id = await api.submit({ ...intent.params, evidenceImages: [...(intent.params.evidenceImages || [])] });
    if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isSafeInteger(id)))) throw new Error('退款申请回执无效，请恢复原申请核对');
    try { localStorage.setItem(key, JSON.stringify({ ...intent, receipt: id })); } catch { /* 原键仍保留，可以回查。 */ }
    return id;
  });
}

function storageKey(userId: string | number, action: FinancialAction) {
  return `cpc:financial-pending:${encodeURIComponent(String(userId))}:${action}`;
}

/** 与同订单退款共用请求锁，但不在浏览器保存收货结果或阻止后续操作。 */
export async function submitOrderConfirmation(userId: string | number, orderId: string | number, api: {
  submit: () => Promise<unknown>;
}) {
  return withSubmissionLock(refundIntentKey(userId, orderId), async () => {
    const receipt = await api.submit();
    if (!validReceipt(receipt) || String(receipt) !== String(orderId)) {
      throw new RequestError('收货回执无法核对，请刷新订单查看实际状态', { code: 'UNKNOWN_OPERATION_RESULT' });
    }
    return orderId;
  });
}

/** 只有原锁仓的最终赎回状态可解除未知结果，不用金额、时间或仍在持仓推断失败。 */
export function confirmFinanceRedemption(userId: string | number, orderId: string | number, detail: { id: string | number; status: string }) {
  if (String(detail.id) !== String(orderId) || detail.status !== 'REDEEMED') return false;
  try { localStorage.removeItem(storageKey(userId, `finance-redeem:${orderId}`)); } catch { /* 保留标记时仍只读取核实，不重放。 */ }
  return true;
}

/** 操作记录按账号和申购产品隔离，不保存登录凭证。 */
export function financialSubmissionIssue(userId: string | number | undefined, action: FinancialAction) {
  if (userId === undefined) return '';
  try {
    const raw = localStorage.getItem(storageKey(userId, action));
    if (raw === null) return '';
    const record = JSON.parse(raw);
    if (!validReceipt(record?.receipt) || String(record.userId) !== String(userId) || record.action !== action) return pendingMessage;
    if (action === 'withdraw' || action === 'recharge' || action.startsWith('finance-subscribe:')) {
      validateKeyedFinancialIntent(record, userId, action);
    }
    return '';
  } catch {
    return '无法读取本地资金操作记录，请恢复浏览器存储后重试';
  }
}

function validReceipt(id: unknown): id is string | number {
  return (typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isSafeInteger(id));
}

interface KeyedFinancialIntent {
  userId: string | number;
  action: FinancialAction;
  idempotencyKey: string;
  snapshot: FinancialSnapshot;
  receipt?: string | number;
}

function validateKeyedFinancialIntent(intent: KeyedFinancialIntent, userId: string | number, action: FinancialAction) {
  if (!intent.idempotencyKey) throw new Error('旧操作没有幂等键，请仅查看记录或联系平台核实，不会重发');
  if (String(intent.userId) !== String(userId) || intent.action !== action || !/^[0-9a-f-]{36}$/i.test(intent.idempotencyKey)
    || !intent.snapshot || !Number.isFinite(Number(intent.snapshot.amount)) || Number(intent.snapshot.amount) <= 0
    || (action === 'withdraw' && (!['ETH', 'TRON', 'BSC'].includes(intent.snapshot.chain || '') || !intent.snapshot.toAddress))
    || (action === 'recharge' && !intent.snapshot.chain)
    || (action.startsWith('finance-subscribe:') && `finance-subscribe:${intent.snapshot.productId}` !== action)) {
    throw new Error('原资金操作记录不完整，请核实后再操作');
  }
}

/** by-key 强制当前登录人范围；旧无键记录只读核实，不补键伪装成原请求。 */
export async function submitKeyedFinancialOperation(
  userId: string | number,
  action: 'withdraw' | 'recharge' | `finance-subscribe:${string}`,
  snapshot: FinancialSnapshot | undefined,
  api: {
    lookup: (key: string) => Promise<{ id: string | number; amount?: string | number; principal?: string | number; chain?: string; toAddress?: string; productId?: string | number } | null>;
    submit: (snapshot: FinancialSnapshot, key: string) => Promise<unknown>;
  },
  restoring = false
) {
  const key = storageKey(userId, action);
  const confirmed = snapshot && { ...snapshot };
  return withSubmissionLock(key, async () => {
    const raw = localStorage.getItem(key);
    const previous: KeyedFinancialIntent | undefined = raw === null ? undefined : JSON.parse(raw);
    if (raw !== null && (!previous || typeof previous !== 'object' || Array.isArray(previous))) {
      throw new Error('原资金操作记录不完整，请核实后再操作');
    }
    if (restoring && !previous) throw new Error('原操作记录已变化，请重新读取');
    if (previous && !validReceipt(previous.receipt) && !restoring) throw new Error(pendingMessage);
    if (previous && validReceipt(previous.receipt)) validateKeyedFinancialIntent(previous, userId, action);
    const intent: KeyedFinancialIntent = restoring && previous ? previous
      : { userId, action, idempotencyKey: crypto.randomUUID(), snapshot: confirmed! };
    validateKeyedFinancialIntent(intent, userId, action);
    if (restoring && validReceipt(intent.receipt)) return intent.receipt;
    const session = getAccessToken();
    const saveReceipt = (id: string | number) => {
      try { localStorage.setItem(key, JSON.stringify({ ...intent, receipt: id })); } catch { /* 原键仍可回查，不能改写服务端成功。 */ }
      return id;
    };
    if (restoring) {
      const result = await api.lookup(intent.idempotencyKey);
      if (getAccessToken() !== session) throw new Error('账号已切换，原操作保留待核对');
      if (result !== null) {
        const expected = intent.snapshot;
        if (!result || !validReceipt(result.id)
          || sumPaymentAmounts([result.amount ?? result.principal ?? '']) !== sumPaymentAmounts([expected.amount])
          || (expected.chain !== undefined && result.chain !== expected.chain)
          || (expected.toAddress !== undefined && result.toAddress !== expected.toAddress)
          || (expected.productId !== undefined && String(result.productId) !== String(expected.productId))) {
          throw new Error('原单回查参数不一致或回包不完整，暂不重发，请核实');
        }
        return saveReceipt(result.id);
      }
    }
    const marker = JSON.stringify(intent);
    localStorage.setItem(key, marker);
    try {
      const id = await api.submit({ ...intent.snapshot }, intent.idempotencyKey);
      if (!validReceipt(id)) throw new Error('未取得可核对的业务编号，请恢复原申请');
      return saveReceipt(id);
    } catch (error) {
      // 首次明确拒绝可重新填写；恢复请求的拒绝不推翻原请求，-311 始终保留原键核实。
      if (!restoring && isDefinitiveRejection(error) && !(error instanceof RequestError && error.code === '-311')) {
        try { if (localStorage.getItem(key) === marker) localStorage.removeItem(key); } catch { /* 保留安全阻挡。 */ }
      }
      throw error;
    }
  });
}

export function financialSubmissionSnapshot(userId: string | number | undefined, action: FinancialAction): FinancialSnapshot | undefined {
  if (userId === undefined) return;
  try {
    const snapshot = JSON.parse(localStorage.getItem(storageKey(userId, action)) || 'null')?.snapshot;
    if (snapshot && (typeof snapshot.amount === 'string' || typeof snapshot.amount === 'number')) return snapshot;
  } catch {
    // 损坏的快照不参与展示或自动重放；存在标记时仍保留待确认状态。
  }
}

/** 标记先于请求落盘；只有取得业务 ID 或明确拒绝才解除，网络异常不猜测结果。 */
export async function submitFinancialOperation<T>(
  userId: string | number,
  action: FinancialAction,
  submit: () => Promise<T>,
  resultId: (result: T) => unknown,
  snapshot?: FinancialSnapshot
): Promise<T> {
  // 同步复制白名单字段，锁申请期间表单变化不能改变已确认快照。
  const confirmed = snapshot && { amount: snapshot.amount, chain: snapshot.chain, toAddress: snapshot.toAddress, productId: snapshot.productId };
  return withSubmissionLock(storageKey(userId, action), () => submitFinancialUnderLock(userId, action, submit, resultId, confirmed));
}

async function submitFinancialUnderLock<T>(
  userId: string | number,
  action: FinancialAction,
  submit: () => Promise<T>,
  resultId: (result: T) => unknown,
  snapshot?: FinancialSnapshot
): Promise<T> {
  const issue = financialSubmissionIssue(userId, action);
  if (issue) throw new RequestError(issue, { code: 'FINANCIAL_PENDING' });
  const key = storageKey(userId, action);
  const marker = JSON.stringify({ attemptId: crypto.randomUUID(), startedAt: Date.now(),
    snapshot: snapshot && { amount: snapshot.amount, chain: snapshot.chain, toAddress: snapshot.toAddress, productId: snapshot.productId } });
  try {
    localStorage.setItem(key, marker);
  } catch {
    throw new RequestError('无法保存资金操作记录，本次尚未提交，请恢复浏览器存储后重试', { code: 'LOCAL_STORAGE_UNAVAILABLE' });
  }
  const clearOwnMarker = () => {
    try {
      if (localStorage.getItem(key) === marker) localStorage.removeItem(key);
    } catch {
      // 确定的业务结果不能被本地清理失败改写成提交失败；残留标记保持禁止重提。
    }
  };
  try {
    const result = await submit();
    const id = resultId(result);
    if (!((typeof id === 'string' && id.trim() !== '') || (typeof id === 'number' && Number.isSafeInteger(id)))) {
      throw new RequestError('服务端未返回可核对的业务编号，资金操作结果待确认', { code: 'UNKNOWN_OPERATION_RESULT' });
    }
    clearOwnMarker();
    return result;
  } catch (error) {
    if (isDefinitiveRejection(error)) clearOwnMarker();
    throw error;
  }
}
