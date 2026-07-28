/**
 * 客服坐席内存池 — 5 个客服员工的运行时状态（R-DATA 坐席状态机 5 态）。
 *
 * 数据基础：mock/data/employees.ts 中 opsCs 部门的 5 个员工
 *   cs（id=6）/ fanlu（id=13，leader）/ yangmiao（id=14）/ caoxin（id=15）/ tangmuyu（id=16）
 *
 * 状态在 mock 进程内可变（演示 /im/agents/status 切换）；重启回到种子初值。
 */

type Agent = Api.Im.Agent;

function nowMinus(days: number, h = 0): string {
  const t = new Date('2026-05-28T10:00:00+08:00');
  t.setDate(t.getDate() - days);
  t.setHours(t.getHours() - h);
  return t.toISOString();
}

interface AgentSeed {
  employeeId: number;
  userName: string;
  realName: string;
  isLeader: boolean;
  status: Api.Im.AgentStatus;
  skillGroups: Api.Im.SkillGroup[];
  current: number;
  max: number;
  todayCount: number;
  avgRespSec: number;
  satisfaction: number; // 1-5
  lastActiveHoursAgo: number;
}

const SEEDS: AgentSeed[] = [
  {
    employeeId: 6,
    userName: 'cs',
    realName: '孙客服',
    isLeader: false,
    status: 'ONLINE',
    skillGroups: ['general', 'aftersale'],
    current: 3,
    max: 5,
    todayCount: 12,
    avgRespSec: 38,
    satisfaction: 4.6,
    lastActiveHoursAgo: 0
  },
  {
    employeeId: 13,
    userName: 'fanlu',
    realName: '范璐',
    isLeader: true,
    status: 'ONLINE',
    skillGroups: ['general', 'aftersale', 'finance', 'crypto'],
    current: 1,
    max: 8,
    todayCount: 5,
    avgRespSec: 22,
    satisfaction: 4.9,
    lastActiveHoursAgo: 0
  },
  {
    employeeId: 14,
    userName: 'yangmiao',
    realName: '杨淼',
    isLeader: false,
    status: 'BUSY',
    skillGroups: ['general', 'crypto'],
    current: 5,
    max: 5,
    todayCount: 18,
    avgRespSec: 45,
    satisfaction: 4.3,
    lastActiveHoursAgo: 0
  },
  {
    employeeId: 15,
    userName: 'caoxin',
    realName: '曹欣',
    isLeader: false,
    status: 'AWAY',
    skillGroups: ['general'],
    current: 0,
    max: 5,
    todayCount: 8,
    avgRespSec: 52,
    satisfaction: 4.4,
    lastActiveHoursAgo: 2
  },
  {
    employeeId: 16,
    userName: 'tangmuyu',
    realName: '唐沐雨',
    isLeader: false,
    status: 'OFFLINE',
    skillGroups: ['general'],
    current: 0,
    max: 5,
    todayCount: 0,
    avgRespSec: 0,
    satisfaction: 0,
    lastActiveHoursAgo: 1440
  }
];

export const AGENTS: Agent[] = SEEDS.map(s => ({
  employeeId: s.employeeId,
  userName: s.userName,
  realName: s.realName,
  isLeader: s.isLeader,
  status: s.status,
  skillGroups: s.skillGroups,
  currentSessionCount: s.current,
  maxConcurrent: s.max,
  totalSessionsToday: s.todayCount,
  avgResponseSec: s.avgRespSec,
  satisfactionScore: s.satisfaction,
  lastActiveAt: nowMinus(0, s.lastActiveHoursAgo)
}));

export function findAgent(employeeId: number): Agent | undefined {
  return AGENTS.find(a => a.employeeId === employeeId);
}

export function updateAgentStatus(employeeId: number, status: Api.Im.AgentStatus): Agent | undefined {
  const a = findAgent(employeeId);
  if (!a) return undefined;
  a.status = status;
  a.lastActiveAt = new Date().toISOString();
  return a;
}

/** 在线（含 BUSY/TRAINING）坐席数 */
export function activeAgentCount(): number {
  return AGENTS.filter(a => a.status === 'ONLINE' || a.status === 'BUSY' || a.status === 'TRAINING').length;
}
