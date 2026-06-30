import { http } from "@/utils/http";

export type ApiResult<T> = {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type Pagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type PageResult<T> = {
  items: T[];
  pagination: Pagination;
};

export type OptionItem = {
  id: number;
  label: string;
  value: number;
  status: number;
};

export type RoleSummary = {
  id: number;
  roleCode: string;
  roleName: string;
};

export type UserListItem = {
  id: number;
  userCode: string;
  username: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  deptId: number | null;
  deptName: string | null;
  postId: number | null;
  postName: string | null;
  status: number;
  roles: RoleSummary[];
  createdAt: string;
  updatedAt: string;
};

export type UserQuery = {
  userCode?: string;
  username?: string;
  nickname?: string;
  phone?: string;
  deptId?: number | "";
  postId?: number | "";
  status?: number | "";
  page?: number;
  pageSize?: number;
};

export type UserPayload = {
  userCode: string;
  username: string;
  password?: string;
  nickname: string;
  phone?: string;
  email?: string;
  deptId: number | null;
  postId: number | null;
  status: number;
  roleIds: number[];
};

export type RoleListItem = {
  id: number;
  roleName: string;
  roleCode: string;
  status: number;
  description: string | null;
  isSuperAdmin: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RoleDetail = RoleListItem & {
  menuIds: number[];
};

export type RoleQuery = {
  roleName?: string;
  roleCode?: string;
  status?: number | "";
  page?: number;
  pageSize?: number;
};

export type RolePayload = {
  roleName: string;
  roleCode?: string;
  status: number;
  description?: string;
  menuIds: number[];
};

export type MenuDetail = {
  id: number;
  menuName: string;
  menuCode: string;
  parentId: number | null;
  icon: string | null;
  sortOrder: number;
  routePath: string;
  componentPath: string | null;
  visible: number;
  status: number;
  roleIds: number[];
  children?: MenuDetail[];
};

export const getUsers = (params: UserQuery) => {
  return http.request<ApiResult<PageResult<UserListItem>>>("get", "/users", {
    params
  });
};

export const createUser = (data: UserPayload) => {
  return http.request<ApiResult<UserListItem>>("post", "/users", { data });
};

export const updateUser = (id: number, data: UserPayload) => {
  return http.request<ApiResult<UserListItem>>("patch", `/users/${id}`, {
    data
  });
};

export const updateUserStatus = (id: number, status: number) => {
  return http.request<ApiResult<UserListItem>>(
    "patch",
    `/users/${id}/status`,
    { data: { status } }
  );
};

export const resetUserPassword = (id: number, newPassword: string) => {
  return http.request<ApiResult<{ message: string }>>(
    "post",
    `/users/${id}/reset-password`,
    { data: { newPassword } }
  );
};

export const deleteUser = (id: number) => {
  return http.request<ApiResult<{ message: string }>>("delete", `/users/${id}`);
};

export const getDepartmentOptions = () => {
  return http.request<ApiResult<OptionItem[]>>("get", "/departments/options");
};

export const getPostOptions = () => {
  return http.request<ApiResult<OptionItem[]>>("get", "/posts/options");
};

export const getRoleOptions = () => {
  return http.request<ApiResult<OptionItem[]>>("get", "/roles/options");
};

export const getRoles = (params: RoleQuery) => {
  return http.request<ApiResult<PageResult<RoleListItem>>>("get", "/roles", {
    params
  });
};

export const getRole = (id: number) => {
  return http.request<ApiResult<RoleDetail>>("get", `/roles/${id}`);
};

export const createRole = (data: RolePayload) => {
  return http.request<ApiResult<RoleDetail>>("post", "/roles", { data });
};

export const updateRole = (id: number, data: RolePayload) => {
  return http.request<ApiResult<RoleDetail>>("patch", `/roles/${id}`, {
    data
  });
};

export const updateRoleStatus = (id: number, status: number) => {
  return http.request<ApiResult<RoleDetail>>(
    "patch",
    `/roles/${id}/status`,
    { data: { status } }
  );
};

export const deleteRole = (id: number) => {
  return http.request<ApiResult<{ message: string }>>("delete", `/roles/${id}`);
};

export const getMenuTree = () => {
  return http.request<ApiResult<MenuDetail[]>>("get", "/menus/tree");
};

export type MenuPayload = {
  menuName: string;
  menuCode: string;
  parentId: number | null;
  icon?: string;
  sortOrder: number;
  routePath: string;
  componentPath?: string;
  visible: number;
  status: number;
  roleIds: number[];
};

export const getMenu = (id: number) => {
  return http.request<ApiResult<MenuDetail>>("get", `/menus/${id}`);
};

export const createMenu = (data: MenuPayload) => {
  return http.request<ApiResult<MenuDetail>>("post", "/menus", { data });
};

export const updateMenu = (id: number, data: MenuPayload) => {
  return http.request<ApiResult<MenuDetail>>("patch", `/menus/${id}`, {
    data
  });
};

export const updateMenuStatus = (id: number, status: number) => {
  return http.request<ApiResult<MenuDetail>>(
    "patch",
    `/menus/${id}/status`,
    { data: { status } }
  );
};

export const updateMenuRoles = (id: number, roleIds: number[]) => {
  return http.request<ApiResult<MenuDetail>>("put", `/menus/${id}/roles`, {
    data: { roleIds }
  });
};

export const sortMenuTree = (
  items: Array<{ id: number; parentId?: number | null; sortOrder: number }>
) => {
  return http.request<ApiResult<{ message: string }>>(
    "patch",
    "/menus/tree/sort",
    { data: { items } }
  );
};

export const deleteMenu = (id: number) => {
  return http.request<ApiResult<{ message: string }>>("delete", `/menus/${id}`);
};
