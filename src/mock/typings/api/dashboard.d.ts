/**
 * 数据看板类型（R-MOD-31 前端 fan-out 调用各模块 stats）。
 */
declare namespace Api.Dashboard {
  type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

  interface AlertItem {
    id: string;
    module: string;
    moduleLabel: string;
    severity: AlertSeverity;
    title: string;
    summary: string;
    href: string;
    raisedAt: string;
  }

  interface TodayMetrics {
    gmvToday: string;
    depositInToday: string;
    withdrawOutToday: string;
    newOrdersToday: number;
    newDisputesToday: number;
  }
}
