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

export type DepartmentItem = {
  id: number;
  deptCode: string;
  deptName: string;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentQuery = {
  deptCode?: string;
  deptName?: string;
  status?: number | "";
  page?: number;
  pageSize?: number;
};

export type DepartmentPayload = {
  deptCode: string;
  deptName: string;
  status: number;
  description?: string;
};

export type PostItem = {
  id: number;
  postCode: string;
  postName: string;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PostQuery = {
  postCode?: string;
  postName?: string;
  status?: number | "";
  page?: number;
  pageSize?: number;
};

export type PostPayload = {
  postCode: string;
  postName: string;
  status: number;
  description?: string;
};

export type DictTypeItem = {
  id: number;
  dictCode: string;
  dictName: string;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DictTypeQuery = {
  dictCode?: string;
  dictName?: string;
  status?: number | "";
  page?: number;
  pageSize?: number;
};

export type DictTypePayload = {
  dictCode: string;
  dictName: string;
  status: number;
  description?: string;
};

export type DictItem = {
  id: number;
  dictTypeId: number;
  itemValue: string;
  itemLabel: string;
  sortOrder: number;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DictItemPayload = {
  itemValue: string;
  itemLabel: string;
  sortOrder: number;
  status: number;
  description?: string;
};

export type DictOptionItem = {
  id: number;
  label: string;
  value: string;
  status: number;
};

export type SystemConfigItem = {
  id: number;
  configCode: string;
  configName: string;
  configValue: string;
  valueType: string;
  status: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SystemConfigQuery = {
  configCode?: string;
  configName?: string;
  status?: number | "";
  page?: number;
  pageSize?: number;
};

export type SystemConfigPayload = {
  configCode: string;
  configName: string;
  configValue: string;
  valueType: string;
  status: number;
  description?: string;
};

export type SystemConfigValue = {
  configCode: string;
  configValue: string;
  valueType: string;
};

export type UserProfile = {
  id: number;
  userCode: string;
  username: string;
  nickname: string;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  deptId: number | null;
  deptName: string | null;
  postId: number | null;
  postName: string | null;
  status: number;
  roles: RoleSummary[];
};

export type ProfilePayload = {
  nickname: string;
  phone?: string;
  email?: string;
  avatar?: string;
};

export type ChangePasswordPayload = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type AttachmentItem = {
  id: number;
  originalName: string;
  storedName: string;
  url: string;
  mimeType: string;
  fileExt: string;
  fileSize: number;
  businessModule: string | null;
  businessRecordId: number | null;
  referenceStatus: number;
  uploadUserId: number;
  uploadedAt: string;
};

export type AttachmentQuery = {
  originalName?: string;
  businessModule?: string;
  referenceStatus?: number | "";
  page?: number;
  pageSize?: number;
};

export type MessageListItem = {
  id: number;
  title: string;
  messageType: string;
  summary: string | null;
  readStatus: number;
  sentAt: string;
  readAt: string | null;
};

export type MessageDetail = MessageListItem & {
  content: string;
  senderId: number | null;
};

export type MessageQuery = {
  title?: string;
  messageType?: string;
  readStatus?: number | "";
  sentStartAt?: string;
  sentEndAt?: string;
  page?: number;
  pageSize?: number;
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

export const getDepartments = (params: DepartmentQuery) => {
  return http.request<ApiResult<PageResult<DepartmentItem>>>(
    "get",
    "/departments",
    { params }
  );
};

export const createDepartment = (data: DepartmentPayload) => {
  return http.request<ApiResult<DepartmentItem>>("post", "/departments", {
    data
  });
};

export const updateDepartment = (id: number, data: DepartmentPayload) => {
  return http.request<ApiResult<DepartmentItem>>(
    "patch",
    `/departments/${id}`,
    { data }
  );
};

export const updateDepartmentStatus = (id: number, status: number) => {
  return http.request<ApiResult<DepartmentItem>>(
    "patch",
    `/departments/${id}/status`,
    { data: { status } }
  );
};

export const deleteDepartment = (id: number) => {
  return http.request<ApiResult<{ message: string }>>(
    "delete",
    `/departments/${id}`
  );
};

export const getPosts = (params: PostQuery) => {
  return http.request<ApiResult<PageResult<PostItem>>>("get", "/posts", {
    params
  });
};

export const createPost = (data: PostPayload) => {
  return http.request<ApiResult<PostItem>>("post", "/posts", { data });
};

export const updatePost = (id: number, data: PostPayload) => {
  return http.request<ApiResult<PostItem>>("patch", `/posts/${id}`, { data });
};

export const updatePostStatus = (id: number, status: number) => {
  return http.request<ApiResult<PostItem>>("patch", `/posts/${id}/status`, {
    data: { status }
  });
};

export const deletePost = (id: number) => {
  return http.request<ApiResult<{ message: string }>>("delete", `/posts/${id}`);
};

export const getDictTypes = (params: DictTypeQuery) => {
  return http.request<ApiResult<PageResult<DictTypeItem>>>(
    "get",
    "/dict-types",
    { params }
  );
};

export const getDictType = (id: number) => {
  return http.request<ApiResult<DictTypeItem>>("get", `/dict-types/${id}`);
};

export const createDictType = (data: DictTypePayload) => {
  return http.request<ApiResult<DictTypeItem>>("post", "/dict-types", { data });
};

export const updateDictType = (id: number, data: DictTypePayload) => {
  return http.request<ApiResult<DictTypeItem>>(
    "patch",
    `/dict-types/${id}`,
    { data }
  );
};

export const updateDictTypeStatus = (id: number, status: number) => {
  return http.request<ApiResult<DictTypeItem>>(
    "patch",
    `/dict-types/${id}/status`,
    { data: { status } }
  );
};

export const deleteDictType = (id: number) => {
  return http.request<ApiResult<{ message: string }>>(
    "delete",
    `/dict-types/${id}`
  );
};

export const getDictItems = (dictTypeId: number) => {
  return http.request<ApiResult<DictItem[]>>(
    "get",
    `/dict-types/${dictTypeId}/items`
  );
};

export const createDictItem = (dictTypeId: number, data: DictItemPayload) => {
  return http.request<ApiResult<DictItem>>(
    "post",
    `/dict-types/${dictTypeId}/items`,
    { data }
  );
};

export const updateDictItem = (id: number, data: DictItemPayload) => {
  return http.request<ApiResult<DictItem>>("patch", `/dict-items/${id}`, {
    data
  });
};

export const updateDictItemStatus = (id: number, status: number) => {
  return http.request<ApiResult<DictItem>>("patch", `/dict-items/${id}/status`, {
    data: { status }
  });
};

export const sortDictItems = (
  items: Array<{ id: number; sortOrder: number }>
) => {
  return http.request<ApiResult<{ message: string }>>(
    "patch",
    "/dict-items/batch-sort",
    { data: { items } }
  );
};

export const deleteDictItem = (id: number) => {
  return http.request<ApiResult<{ message: string }>>(
    "delete",
    `/dict-items/${id}`
  );
};

export const getDictOptions = (dictCode: string, enabledOnly = true) => {
  return http.request<ApiResult<DictOptionItem[]>>(
    "get",
    `/dict-types/by-code/${dictCode}/options`,
    { params: { enabledOnly } }
  );
};

export const getSystemConfigs = (params: SystemConfigQuery) => {
  return http.request<ApiResult<PageResult<SystemConfigItem>>>(
    "get",
    "/system-configs",
    { params }
  );
};

export const getSystemConfig = (id: number) => {
  return http.request<ApiResult<SystemConfigItem>>("get", `/system-configs/${id}`);
};

export const createSystemConfig = (data: SystemConfigPayload) => {
  return http.request<ApiResult<SystemConfigItem>>("post", "/system-configs", {
    data
  });
};

export const updateSystemConfig = (id: number, data: SystemConfigPayload) => {
  return http.request<ApiResult<SystemConfigItem>>(
    "patch",
    `/system-configs/${id}`,
    { data }
  );
};

export const updateSystemConfigStatus = (id: number, status: number) => {
  return http.request<ApiResult<SystemConfigItem>>(
    "patch",
    `/system-configs/${id}/status`,
    { data: { status } }
  );
};

export const deleteSystemConfig = (id: number) => {
  return http.request<ApiResult<{ message: string }>>(
    "delete",
    `/system-configs/${id}`
  );
};

export const getSystemConfigValue = (configCode: string) => {
  return http.request<ApiResult<SystemConfigValue>>(
    "get",
    `/system-configs/by-code/${configCode}/value`
  );
};

export const getProfile = () => {
  return http.request<ApiResult<UserProfile>>("get", "/profile");
};

export const updateProfile = (data: ProfilePayload) => {
  return http.request<ApiResult<UserProfile>>("patch", "/profile", { data });
};

export const changeProfilePassword = (data: ChangePasswordPayload) => {
  return http.request<ApiResult<{ message: string }>>(
    "post",
    "/profile/change-password",
    { data }
  );
};

export const getAttachments = (params: AttachmentQuery) => {
  return http.request<ApiResult<PageResult<AttachmentItem>>>(
    "get",
    "/attachments",
    { params }
  );
};

export const uploadAttachment = (data: FormData) => {
  return http.request<ApiResult<AttachmentItem>>("post", "/attachments", {
    data,
    headers: { "Content-Type": "multipart/form-data" }
  });
};

export const deleteAttachment = (id: number) => {
  return http.request<ApiResult<{ message: string }>>(
    "delete",
    `/attachments/${id}`
  );
};

export const getMessages = (params: MessageQuery) => {
  return http.request<ApiResult<PageResult<MessageListItem>>>(
    "get",
    "/messages",
    { params }
  );
};

export const getMessage = (id: number) => {
  return http.request<ApiResult<MessageDetail>>("get", `/messages/${id}`);
};

export const markMessageRead = (id: number) => {
  return http.request<ApiResult<MessageDetail>>("patch", `/messages/${id}/read`);
};

export const markMessagesRead = (data: { ids?: number[]; all?: boolean }) => {
  return http.request<ApiResult<{ message: string; count: number }>>(
    "patch",
    "/messages/read",
    { data }
  );
};

export const getUnreadMessageCount = () => {
  return http.request<ApiResult<{ count: number }>>("get", "/messages/unread-count");
};
