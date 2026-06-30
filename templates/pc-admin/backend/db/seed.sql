-- PC Admin 默认数据 Seed
-- 前置依赖: 先执行 schema.sql
-- 密码: 123456 的 MD5 值 e10adc3949ba59abbe56e057f20f883e

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------
-- 1. 默认部门
-- ---------------------------------------------------------
INSERT INTO `departments` (`id`, `dept_code`, `dept_name`, `status`, `description`) VALUES
(1, 'ADMIN', '管理部', 1, '系统管理与配置维护'),
(2, 'OPS', '运营部', 1, '日常业务运营');

-- ---------------------------------------------------------
-- 2. 默认岗位
-- ---------------------------------------------------------
INSERT INTO `posts` (`id`, `post_code`, `post_name`, `status`, `description`) VALUES
(1, 'ADMIN', '管理员', 1, '系统管理员岗位'),
(2, 'OPERATOR', '运营人员', 1, '普通运营岗位'),
(3, 'AUDITOR', '审核人员', 1, '审核与复核岗位'),
(4, 'USER', '普通用户', 1, '默认用户岗位');

-- ---------------------------------------------------------
-- 3. 默认角色
-- ---------------------------------------------------------
INSERT INTO `roles` (`id`, `role_code`, `role_name`, `status`, `description`, `is_super_admin`) VALUES
(1, 'SUPER_ADMIN', '超级管理员', 1, '默认拥有全部菜单访问能力', 1),
(2, 'OPERATOR', '运营人员', 1, '可访问基础业务菜单', 0),
(3, 'COMMON_USER', '普通用户', 1, '仅访问个人工作台和个人信息', 0);

-- ---------------------------------------------------------
-- 4. 默认用户 (密码均为 123456 的 MD5)
-- ---------------------------------------------------------
INSERT INTO `users` (`id`, `user_code`, `login_name`, `password_hash`, `display_name`, `phone`, `email`, `dept_id`, `post_id`, `status`) VALUES
(1, 'SA001', 'superadmin', 'e10adc3949ba59abbe56e057f20f883e', '系统管理员', '13800000001', 'admin@example.com', 1, 1, 1),
(2, 'OP001', 'operator', 'e10adc3949ba59abbe56e057f20f883e', '运营人员', '13800000002', 'operator@example.com', 2, 2, 1),
(3, 'CU001', 'common', 'e10adc3949ba59abbe56e057f20f883e', '普通用户', '13800000003', 'user@example.com', 2, 4, 1);

-- ---------------------------------------------------------
-- 5. 用户角色关联
-- ---------------------------------------------------------
INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
(1, 1),
(2, 2),
(3, 3);

-- ---------------------------------------------------------
-- 6. 默认菜单
--    component_path 以 views 目录为根，例如 /welcome/index 表示
--    views/welcome/index.vue
-- ---------------------------------------------------------
INSERT INTO `menus` (`id`, `menu_code`, `menu_name`, `parent_id`, `icon`, `sort_order`, `route_path`, `component_path`, `visible`, `status`, `meta_json`) VALUES
-- 首页
(1, 'HOME', '首页', NULL, 'HomeFilled', 0, '/welcome', '/welcome/index', 1, 1, '{"title":"首页"}'),

-- 系统管理
(2, 'SYSTEM', '系统管理', NULL, 'SetUp', 10, '/system', NULL, 1, 1, '{"title":"系统管理"}'),
(3, 'SYSTEM_USER', '用户管理', 2, 'UserFilled', 0, '/system/users', '/system/user/index', 1, 1, '{"title":"用户管理"}'),
(4, 'SYSTEM_ROLE', '角色管理', 2, 'UserFilled', 1, '/system/roles', '/system/role/index', 1, 1, '{"title":"角色管理"}'),
(5, 'SYSTEM_MENU', '菜单管理', 2, 'Menu', 2, '/system/menus', '/system/menu/index', 1, 1, '{"title":"菜单管理"}'),
(6, 'SYSTEM_DEPT', '部门管理', 2, 'OfficeBuilding', 3, '/system/departments', '/system/dept/index', 1, 1, '{"title":"部门管理"}'),
(7, 'SYSTEM_POST', '岗位管理', 2, 'Postcard', 4, '/system/posts', '/system/post/index', 1, 1, '{"title":"岗位管理"}'),
(8, 'SYSTEM_CONFIG', '系统配置', 2, 'Tools', 5, '/system/configs', '/system/config/index', 1, 1, '{"title":"系统配置"}'),
(9, 'SYSTEM_DICT', '数据字典', 2, 'Collection', 6, '/system/dicts', '/system/dict/index', 1, 1, '{"title":"数据字典"}'),

-- 运营管理
(10, 'OPERATION', '运营管理', NULL, 'Operation', 20, '/operation', NULL, 1, 1, '{"title":"运营管理"}'),
(11, 'OPERATION_MESSAGE', '消息中心', 10, 'Message', 0, '/operation/messages', '/operation/message/index', 1, 1, '{"title":"消息中心"}'),
(12, 'OPERATION_ATTACHMENT', '附件管理', 10, 'Paperclip', 1, '/operation/attachments', '/operation/attachment/index', 1, 1, '{"title":"附件管理"}'),

-- 日志审计
(13, 'LOG', '日志审计', NULL, 'Document', 30, '/log', NULL, 1, 1, '{"title":"日志审计"}'),
(14, 'LOG_LOGIN', '登录日志', 13, 'Key', 0, '/log/login-logs', '/log/login-log/index', 1, 1, '{"title":"登录日志"}'),
(15, 'LOG_OPERATION', '操作日志', 13, 'Pointer', 1, '/log/operation-logs', '/log/operation-log/index', 1, 1, '{"title":"操作日志"}'),
(16, 'LOG_EXCEPTION', '异常日志', 13, 'WarningFilled', 2, '/log/exception-logs', '/log/exception-log/index', 1, 1, '{"title":"异常日志"}'),

-- 个人中心
(17, 'PROFILE', '个人中心', NULL, 'User', 40, '/profile', NULL, 1, 1, '{"title":"个人中心"}'),
(18, 'PROFILE_INFO', '个人信息', 17, 'UserFilled', 0, '/profile/info', '/profile/index', 1, 1, '{"title":"个人信息"}'),
(19, 'PROFILE_PASSWORD', '修改密码', 17, 'Lock', 1, '/profile/change-password', '/profile/change-password/index', 1, 1, '{"title":"修改密码"}');

-- ---------------------------------------------------------
-- 7. 角色菜单授权
--    SUPER_ADMIN 拥有全部启用菜单
--    OPERATOR 拥有首页、运营管理、个人中心
--    COMMON_USER 拥有首页、个人中心
-- ---------------------------------------------------------
INSERT INTO `role_menus` (`role_id`, `menu_id`)
SELECT 1, id FROM `menus` WHERE `deleted` = 0;

INSERT INTO `role_menus` (`role_id`, `menu_id`) VALUES
(2, 1),
(2, 10),
(2, 11),
(2, 12),
(2, 17),
(2, 18),
(2, 19),
(3, 1),
(3, 17),
(3, 18),
(3, 19);

-- ---------------------------------------------------------
-- 8. 默认系统配置
-- ---------------------------------------------------------
INSERT INTO `system_configs` (`id`, `config_code`, `config_name`, `config_value`, `value_type`, `status`, `description`) VALUES
(1, 'SYSTEM_NAME', '系统名称', 'PC Admin', 'STRING', 1, '登录页和顶部栏展示'),
(2, 'LOGIN_TITLE', '登录页标题', 'PC Admin 管理后台', 'STRING', 1, '登录页标题'),
(3, 'UPLOAD_MAX_SIZE_MB', '文件上传大小限制', '10', 'NUMBER', 1, '单文件最大 MB'),
(4, 'UPLOAD_ALLOWED_EXTENSIONS', '允许上传文件类型', 'jpg,jpeg,png,pdf,doc,docx,xls,xlsx', 'STRING', 1, '附件上传白名单'),
(5, 'ACCESS_TOKEN_TTL_MINUTES', 'Access Token 有效期', '30', 'NUMBER', 1, '访问令牌有效期（分钟）'),
(6, 'REFRESH_TOKEN_TTL_DAYS', 'Refresh Token 有效期', '7', 'NUMBER', 1, '刷新令牌有效期（天）');

-- ---------------------------------------------------------
-- 9. 默认字典类型
-- ---------------------------------------------------------
INSERT INTO `dict_types` (`id`, `dict_code`, `dict_name`, `status`, `description`) VALUES
(1, 'user_status', '用户状态', 1, '用户启用/停用状态'),
(2, 'message_type', '消息类型', 1, '站内消息分类'),
(3, 'operation_type', '操作类型', 1, '操作日志类型');

-- ---------------------------------------------------------
-- 10. 默认字典项
-- ---------------------------------------------------------
INSERT INTO `dict_items` (`id`, `dict_type_id`, `item_value`, `item_label`, `sort_order`, `status`) VALUES
(1, 1, '0', '停用', 0, 1),
(2, 1, '1', '启用', 1, 1),
(3, 2, 'NOTICE', '通知', 0, 1),
(4, 2, 'ANNOUNCEMENT', '公告', 1, 1),
(5, 3, 'CREATE', '新增', 0, 1),
(6, 3, 'UPDATE', '修改', 1, 1),
(7, 3, 'DELETE', '删除', 2, 1),
(8, 3, 'LOGIN', '登录', 3, 1),
(9, 3, 'LOGOUT', '退出', 4, 1);

-- ---------------------------------------------------------
-- 11. 默认站内消息
-- ---------------------------------------------------------
INSERT INTO `messages`
  (`id`, `receiver_id`, `sender_id`, `title`, `summary`, `content`, `message_type`, `read_status`) VALUES
(1, 1, NULL, '系统初始化完成', 'PC Admin 模板已完成基础初始化', '默认账号、角色、菜单、字典和系统配置已经初始化完成。', 'NOTICE', 0),
(2, 1, NULL, 'Sprint 04 任务提醒', '请关注附件、消息、日志和首页概览模块', 'Sprint 04 将补齐运营与审计闭环，请按任务文档逐项验收。', 'ANNOUNCEMENT', 0),
(3, 2, 1, '运营权限已开通', '你的运营菜单权限已经生效', '当前账号可以访问运营管理和个人中心相关菜单。', 'NOTICE', 0),
(4, 3, 1, '欢迎使用系统', '请完善个人信息并定期修改密码', '首次登录后建议进入个人中心检查手机号、邮箱和头像信息。', 'NOTICE', 1);

SET FOREIGN_KEY_CHECKS = 1;
