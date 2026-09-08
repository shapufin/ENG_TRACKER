import api from "@/lib/api";
import type {
  Group,
  Role,
  PermissionItem,
  UserRole,
  UserGroup,
  RolePermission,
  PaginatedResponse,
  MemberCandidate,
} from "@/types";

export const permissionService = {
  async getGroups(params?: Record<string, unknown>): Promise<PaginatedResponse<Group>> {
    const { data } = await api.get<PaginatedResponse<Group>>("/permissions/groups/", { params });
    return data;
  },

  async getAllGroups(params: Record<string, unknown> = {}): Promise<Group[]> {
    const groups: Group[] = [];
    let page = 1;
    let response = await this.getGroups({ ...params, page });

    while (true) {
      groups.push(...response.results);
      if (!response.next) return groups;
      page += 1;
      response = await this.getGroups({ ...params, page });
    }
  },

  async getGroup(id: number): Promise<Group> {
    const { data } = await api.get<Group>(`/permissions/groups/${id}/`);
    return data;
  },

  async createGroup(payload: Partial<Group>): Promise<Group> {
    const { data } = await api.post<Group>("/permissions/groups/", payload);
    return data;
  },

  async updateGroup(id: number, payload: Partial<Group>): Promise<Group> {
    const { data } = await api.put<Group>(`/permissions/groups/${id}/`, payload);
    return data;
  },

  async deleteGroup(id: number): Promise<void> {
    await api.delete(`/permissions/groups/${id}/`);
  },

  async bulkDeleteGroups(ids: number[]): Promise<{
    deleted_count: number;
    deleted_ids: number[];
    access_summary: Array<{
      group_id: number;
      group_name: string;
      plugin_access: Array<{ plugin_name: string; action: string }>;
    }>;
  }> {
    const { data } = await api.post("/permissions/groups/bulk_delete/", { ids });
    return data;
  },

  async getRoles(params?: Record<string, unknown>): Promise<PaginatedResponse<Role>> {
    const { data } = await api.get<PaginatedResponse<Role>>("/permissions/roles/", { params });
    return data;
  },

  async createRole(payload: Partial<Role>): Promise<Role> {
    const { data } = await api.post<Role>("/permissions/roles/", payload);
    return data;
  },

  async updateRole(id: number, payload: Partial<Role>): Promise<Role> {
    const { data } = await api.put<Role>(`/permissions/roles/${id}/`, payload);
    return data;
  },

  async deleteRole(id: number): Promise<void> {
    await api.delete(`/permissions/roles/${id}/`);
  },

  async getPermissions(
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<PermissionItem>> {
    const { data } = await api.get<PaginatedResponse<PermissionItem>>("/permissions/permissions/", {
      params,
    });
    return data;
  },

  async getUserRoles(params?: Record<string, unknown>): Promise<PaginatedResponse<UserRole>> {
    const { data } = await api.get<PaginatedResponse<UserRole>>("/permissions/user-roles/", {
      params,
    });
    return data;
  },

  async createUserRole(payload: Partial<UserRole>): Promise<UserRole> {
    const { data } = await api.post<UserRole>("/permissions/user-roles/", payload);
    return data;
  },

  async updateUserRole(id: number, payload: Partial<UserRole>): Promise<UserRole> {
    const { data } = await api.put<UserRole>(`/permissions/user-roles/${id}/`, payload);
    return data;
  },

  async deleteUserRole(id: number): Promise<void> {
    await api.delete(`/permissions/user-roles/${id}/`);
  },

  async getUserGroups(params?: Record<string, unknown>): Promise<PaginatedResponse<UserGroup>> {
    const { data } = await api.get<PaginatedResponse<UserGroup>>("/permissions/user-groups/", {
      params,
    });
    return data;
  },

  async createUserGroup(payload: Partial<UserGroup>): Promise<UserGroup> {
    const { data } = await api.post<UserGroup>("/permissions/user-groups/", payload);
    return data;
  },

  async deleteUserGroup(id: number): Promise<void> {
    await api.delete(`/permissions/user-groups/${id}/`);
  },

  async getMemberCandidates(
    groupId: number,
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<MemberCandidate>> {
    const { data } = await api.get<PaginatedResponse<MemberCandidate>>(
      `/permissions/groups/${groupId}/member_candidates/`,
      { params }
    );
    return data;
  },

  async getRolePermissions(
    params?: Record<string, unknown>
  ): Promise<PaginatedResponse<RolePermission>> {
    const { data } = await api.get<PaginatedResponse<RolePermission>>(
      "/permissions/role-permissions/",
      { params }
    );
    return data;
  },

  async createRolePermission(payload: Partial<RolePermission>): Promise<RolePermission> {
    const { data } = await api.post<RolePermission>("/permissions/role-permissions/", payload);
    return data;
  },

  async deleteRolePermission(id: number): Promise<void> {
    await api.delete(`/permissions/role-permissions/${id}/`);
  },
};
