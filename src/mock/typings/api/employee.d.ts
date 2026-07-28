/**
 * 后台员工管理模块（4.1）API 类型定义。
 *
 * R-DATA-8 模型：员工只决定「在哪些部门、是否任负责人」，权限由部门派生。
 *   - 员工 → memberships: { departmentId, isLeader }[]
 *   - 部门 → memberPermissions + leaderPermissions（每个部门两套独立权限集）
 *   - 员工有效权限 = ⋃ memberPermissions(所属部门) ⋃ ⋃ leaderPermissions(担任负责人部门)
 *
 * 命名空间挂在全局 Api 下：Api.Employee.*
 */
declare namespace Api {
  namespace Employee {
    /** 员工启停状态，复用 Api.Common.EnableStatus */
    type Status = Api.Common.EnableStatus;

    /** 员工的部门隶属 —— 权限模型的唯一权威字段（R-DATA-8） */
    interface Membership {
      departmentId: number;
      /** 该员工是否为本部门负责人；一个部门可有多名负责人 */
      isLeader: boolean;
    }

    /** 员工档案 */
    interface EmployeeRecord {
      id: number;
      /** 登录用户名，全局唯一，创建后不可改 */
      userName: string;
      realName: string;
      avatar?: string;
      phone?: string;
      email?: string;
      status: Status;
      /** 首次登录或被重置后为 true */
      mustChangePwd: boolean;
      /** ISO 8601 字符串 */
      lastLoginAt?: string;
      lastLoginIp?: string;
      /** 部门隶属（**唯一权威字段**） */
      memberships: Membership[];
      /** 派生：所属部门 id 列表（去重） */
      departmentIds: number[];
      /** 派生：担任负责人的部门 id 列表 */
      leaderOfDepartmentIds: number[];
      /**
       * 派生：员工的有效权限点（mock 后端计算并下发）
       * = ⋃ memberPermissions(所属部门) ⋃ ⋃ leaderPermissions(担任负责人部门)
       */
      effectivePermissions: string[];
      remark?: string;
      createBy: string;
      createTime: string;
      updateBy: string;
      updateTime: string;
    }

    /** 列表筛选参数 */
    type SearchParams = Partial<{
      keyword: string;
      departmentIds: number[];
      status: Status;
      mustChangePwd: '' | 'true' | 'false';
    }> &
      Api.Common.CommonSearchParams;

    /** 列表响应 */
    type EmployeeList = Api.Common.PaginatingQueryRecord<EmployeeRecord>;

    /** 新建参数 */
    interface CreateParams {
      userName: string;
      realName: string;
      phone?: string;
      email?: string;
      defaultPassword: string;
      /** 部门隶属（必填，至少 1 条；isLeader 默认 false） */
      memberships: Membership[];
      status?: Status;
      remark?: string;
    }

    interface CreateResult {
      id: number;
      userName: string;
      defaultPassword: string;
    }

    /** 编辑参数（id 必填，其余可选） */
    type UpdateParams = Partial<Omit<CreateParams, 'userName' | 'defaultPassword'>> & {
      id: number;
    };

    interface ResetPasswordParams {
      id: number;
      newPassword: string;
      forceChangeOnNextLogin: boolean;
    }

    interface ChangePasswordParams {
      oldPassword: string;
      newPassword: string;
    }

    /** 登录日志 */
    interface LoginLog {
      id: number;
      time: string;
      ip: string;
      ua: string;
      success: boolean;
      location?: string;
    }

    /** 操作日志（员工内审计视图） */
    interface OperationLog {
      id: number;
      time: string;
      operator: string;
      action: string;
      detail: string;
    }

    /** 部门节点（R-DATA-8 加权限字段） */
    interface DepartmentNode {
      id: number;
      parentId: number | null;
      name: string;
      sort: number;
      status: Api.Common.EnableStatus;
      memberCount: number;
      createTime: string;
      remark?: string;
      /** 部门成员权限集（普通成员自动获得） */
      memberPermissions: string[];
      /** 部门负责人额外权限集（仅 isLeader 员工额外获得） */
      leaderPermissions: string[];
      /** 部门负责人 id 列表（可多人） */
      leaderEmployeeIds: number[];
      /** 派生：负责人姓名列表（用于 UI） */
      leaderEmployeeNames: string[];
      children?: DepartmentNode[];
    }

    /** 部门列表的扁平形态（用于 TreeSelect 等组件） */
    interface DepartmentFlat extends Omit<DepartmentNode, 'children'> {
      depth: number;
    }

    interface DepartmentCreateParams {
      parentId: number | null;
      name: string;
      sort?: number;
      remark?: string;
    }

    interface DepartmentUpdateParams extends Partial<DepartmentCreateParams> {
      id: number;
      status?: Api.Common.EnableStatus;
    }
  }
}
