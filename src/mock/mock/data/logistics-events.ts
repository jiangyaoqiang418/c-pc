/**
 * 物流轨迹事件池 ≥ 30 条（按订单 id 关联，3 类场景：正常 / 海关扣关 / 延误）。
 *
 * 不接真物流 API，仅 mock 轨迹生成；4 家承运商 SF国际/FedEx/DHL/4PX/EMS 各覆盖。
 * 覆盖 IN_TRANSIT 10 + AFTERSALE_CONFIRM 4 + COMPLETED 12 + WARRANTY 6 + IN_AFTERSALE 5 = 37 条。
 */
import { ORDERS } from './orders';

type LogisticsEvent = Api.Order.LogisticsEvent;

function dt(daysAgo: number, h = 10, m = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - daysAgo);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
}

type Scenario = 'normal' | 'customs_hold' | 'delayed';

/**
 * 按场景生成轨迹模板。
 * shippedDaysAgo: 发货距今天数（轨迹起点）。
 */
function generateTrajectory(scenario: Scenario, shippedDaysAgo: number, withImg = false): LogisticsEvent[] {
  const events: LogisticsEvent[] = [];
  const start = shippedDaysAgo;

  events.push({
    time: dt(start, 9, 0),
    location: '东京新宿配送中心',
    description: '买手已揽收，准备出库',
    type: 'normal',
    imageUrl: withImg ? `https://picsum.photos/seed/log${start}-1/200/200` : undefined
  });
  events.push({
    time: dt(Math.max(0, start - 1), 14, 0),
    location: '东京成田机场',
    description: '已装机离港',
    type: 'normal'
  });

  if (scenario === 'customs_hold') {
    events.push({
      time: dt(Math.max(0, start - 2), 8, 30),
      location: '上海浦东口岸',
      description: '⚠ 海关查验中，需买手协助提供商品发票',
      type: 'warning'
    });
    events.push({
      time: dt(Math.max(0, start - 5), 14, 0),
      location: '上海海关',
      description: '清关延误：海关补充证明已提交',
      type: 'warning'
    });
    events.push({
      time: dt(Math.max(0, start - 6), 10, 0),
      location: '上海清关',
      description: '清关完成（延误 3 天）',
      type: 'normal'
    });
  } else if (scenario === 'delayed') {
    events.push({
      time: dt(Math.max(0, start - 2), 8, 0),
      location: '东京成田机场',
      description: '待装机（航班延误）',
      type: 'warning'
    });
    events.push({
      time: dt(Math.max(0, start - 3), 6, 0),
      location: '上海浦东口岸',
      description: '清关中',
      type: 'normal'
    });
    events.push({
      time: dt(Math.max(0, start - 4), 12, 0),
      location: '上海清关',
      description: '清关完成',
      type: 'normal'
    });
  } else {
    events.push({
      time: dt(Math.max(0, start - 2), 10, 0),
      location: '上海浦东口岸',
      description: '清关中',
      type: 'normal'
    });
    events.push({
      time: dt(Math.max(0, start - 3), 14, 0),
      location: '上海清关',
      description: '清关完成',
      type: 'normal'
    });
  }

  events.push({
    time: dt(Math.max(0, start - 4), 9, 0),
    location: '上海转运中心',
    description: '已发至顾客所在城市',
    type: 'normal'
  });
  events.push({
    time: dt(Math.max(0, start - 5), 14, 0),
    location: '北京朝阳分拣中心',
    description: '到达目的城市分拣中心',
    type: 'normal'
  });
  events.push({
    time: dt(Math.max(0, start - 6), 10, 0),
    location: '北京朝阳区望京网点',
    description: '派件中',
    type: 'normal',
    imageUrl: withImg ? `https://picsum.photos/seed/log${start}-2/200/200` : undefined
  });

  return events;
}

/** 主真实源：orderId → LogisticsEvent[] */
export const LOGISTICS_EVENTS_BY_ORDER: Map<number, LogisticsEvent[]> = new Map();

function seed() {
  LOGISTICS_EVENTS_BY_ORDER.clear();
  ORDERS.forEach((order, idx) => {
    // 仅为有运单号的订单生成轨迹（IN_TRANSIT 及之后）
    if (!order.trackingNumber) return;
    // 25% 海关扣关，10% 延误，65% 正常
    const r = idx % 10;
    let scenario: Scenario = 'normal';
    if (r === 0 || r === 5) scenario = 'customs_hold';
    else if (r === 3) scenario = 'delayed';
    // 海外过关商品 100% 进 customs_hold
    if (order.overseasCustoms) scenario = 'customs_hold';
    const shippedDaysAgo = order.shippedAt
      ? Math.max(1, Math.floor((Date.now() - Date.parse(order.shippedAt)) / 86400000))
      : 7;
    const events = generateTrajectory(scenario, shippedDaysAgo, idx % 5 === 0);
    LOGISTICS_EVENTS_BY_ORDER.set(order.id, events);
  });
}
seed();

export function findEventsByOrderId(orderId: number): LogisticsEvent[] {
  return LOGISTICS_EVENTS_BY_ORDER.get(orderId) || [];
}

export function appendLogisticsEvent(orderId: number, event: LogisticsEvent): void {
  const list = LOGISTICS_EVENTS_BY_ORDER.get(orderId) || [];
  list.unshift(event);
  LOGISTICS_EVENTS_BY_ORDER.set(orderId, list);
}
