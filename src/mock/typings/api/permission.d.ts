/**
 * 权限管理模块（4.2）API 类型定义（R-DATA-8 部门即权限载体模型）。
 *
 * 不再有「角色 Role」概念；权限直接挂部门。
 * 命名空间挂在全局 Api 下：Api.Permission.*
 */
declare namespace Api {
  namespace Permission {
    /** 单个权限点 */
    interface PermissionNode {
      code: string; // e.g. 'product:audit'
      name: string; // '审核商品'
      module: string; // 'product'
      moduleName: string; // '商品管理'
      description?: string;
    }

    /** 权限点树（按 27 模块分组），用于树形 Checkbox 选择 */
    interface PermissionTreeModule {
      key: string; // module code, e.g. 'product'
      title: string; // moduleName
      icon?: string;
      children: PermissionTreeLeaf[];
    }

    interface PermissionTreeLeaf {
      key: string; // permission code
      title: string;
      isLeaf: true;
      raw: PermissionNode;
    }

    /** 反查：权限点在哪些部门的成员/负责人权限中使用 */
    interface PermissionUsageByDept {
      code: string;
      inDepartments: {
        departmentId: number;
        departmentName: string;
        /** 在该部门的成员权限集中存在 */
        asMember: boolean;
        /** 在该部门的负责人权限集中存在 */
        asLeader: boolean;
      }[];
    }

    /** 部门权限保存参数 */
    interface SetDeptPermissionsParams {
      departmentId: number;
      memberPermissions: string[];
      leaderPermissions: string[];
    }

    /** 部门负责人保存参数（可多人） */
    interface SetDeptLeadersParams {
      departmentId: number;
      /** 要任命为负责人的员工 id 列表（必须已在该部门 memberships 中） */
      employeeIds: number[];
    }

    interface DeptPermissionsResult {
      departmentId: number;
      memberPermissions: string[];
      leaderPermissions: string[];
    }
  }
}
