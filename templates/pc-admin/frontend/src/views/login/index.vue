<script setup lang="ts">
import Motion from "./utils/motion";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { loginRules } from "./utils/rule";
import { ref, reactive, watch } from "vue";
import { debounce } from "@pureadmin/utils";
import { useNav } from "@/layout/hooks/useNav";
import { useEventListener } from "@vueuse/core";
import type { FormInstance } from "element-plus";
import { useUserStoreHook } from "@/store/modules/user";
import { initRouter, getTopMenu } from "@/router/utils";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import PureLoginBg from "@/components/PureLoginBg/index.vue";
import PureLoginIllustration from "@/components/PureLoginIllustration/index.vue";
import Axios from "axios";

import Lock from "~icons/ri/lock-fill";
import User from "~icons/ri/user-3-fill";

defineOptions({
  name: "Login"
});

const router = useRouter();
const loading = ref(false);
const disabled = ref(false);
const ruleFormRef = ref<FormInstance>();

const userStore = useUserStoreHook();

const { title } = useNav();

/** 免登录天数选项 */
const loginDayOptions = [
  { label: "7 天", value: 7 },
  { label: "14 天", value: 14 },
  { label: "30 天", value: 30 }
];

const ruleForm = reactive({
  username: "superadmin",
  password: "123456"
});

/** 记住登录状态 */
const isRemembered = ref(userStore.isRemembered);
/** 免登录天数 */
const loginDay = ref(userStore.loginDay);

// 同步 store
watch(isRemembered, val => userStore.SET_ISREMEMBERED(val));
watch(loginDay, val => userStore.SET_LOGINDAY(val));

/** 根据后端返回的错误码/信息，映射为对用户友好的提示 */
function resolveLoginError(res: any): string {
  const error = res?.error ?? res?.response?.data?.error ?? {};
  const msg = error?.message ?? res?.message ?? "";
  const code = error?.code ?? res?.code ?? res?.status;

  const codeMsgMap: Record<number | string, string> = {
    BAD_REQUEST: "请求参数有误，请检查输入",
    INVALID_CREDENTIALS: "账号或密码错误",
    USER_DISABLED: "账号已被禁用，请联系管理员",
    UNAUTHORIZED: "登录已过期，请重新登录",
    INTERNAL_ERROR: "服务器异常，请稍后重试",
    400: "请求参数有误，请检查输入",
    401: "账号或密码错误",
    403: "账号已被禁用，请联系管理员",
    404: "账号不存在",
    423: "账号已被锁定，请稍后再试",
    429: "操作过于频繁，请稍后再试",
    500: "服务器异常，请稍后重试",
    502: "网关异常，请稍后重试",
    503: "服务暂不可用，请稍后重试",
    504: "请求超时，请检查网络后重试"
  };

  if (code && codeMsgMap[code]) return codeMsgMap[code];

  if (msg) {
    if (/账号不存在|用户不存在|user not found/i.test(msg))
      return "账号不存在，请检查后重试";
    if (/密码错误|password.*incorrect|密码不匹配/i.test(msg))
      return "密码错误，请重新输入";
    if (/禁用|disabled|冻结|frozen/i.test(msg))
      return "账号已被禁用，请联系管理员";
    if (/锁定|locked/i.test(msg))
      return "账号已被锁定，请稍后再试";
    if (/验证码|captcha|验证失败/i.test(msg))
      return "验证码错误，请重新输入";
    return msg;
  }

  return "登录失败，请稍后重试";
}

/** 提取网络/HTTP 错误信息 */
function resolveNetworkError(error: any): string {
  if (Axios.isCancel(error)) return "请求已取消";

  const status = error?.response?.status;
  const apiError = error?.response?.data?.error;
  if (apiError?.message || apiError?.code) {
    return resolveLoginError({ error: apiError, status });
  }
  if (status) {
    const statusMap: Record<number, string> = {
      400: "请求参数有误",
      401: "账号或密码错误",
      403: "账号已被禁用，请联系管理员",
      404: "账号不存在",
      423: "账号已被锁定，请稍后再试",
      429: "操作过于频繁，请稍后再试",
      500: "服务器异常，请稍后重试",
      502: "网关异常，请稍后重试",
      503: "服务暂不可用，请稍后重试",
      504: "请求超时，请检查网络后重试"
    };
    if (statusMap[status]) return statusMap[status];
    return `服务器错误（${status}），请稍后重试`;
  }

  if (error?.code === "ECONNABORTED" || error?.message?.includes("timeout"))
    return "请求超时，请检查网络后重试";
  if (error?.message?.includes("Network Error") || !error?.response)
    return "网络异常，请检查网络连接";

  return "网络异常，请稍后重试";
}

const onLogin = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  await formEl.validate(valid => {
    if (valid) {
      loading.value = true;
      useUserStoreHook()
        .loginByUsername({
          username: ruleForm.username,
          password: ruleForm.password
        })
        .then(res => {
          if (res.success) {
            // 获取后端路由
            return initRouter().then(() => {
              disabled.value = true;
              router
                .push(getTopMenu(true).path)
                .then(() => {
                  message("登录成功", { type: "success" });
                })
                .finally(() => (disabled.value = false));
            });
          } else {
            // 后端返回业务错误（如账号不存在、密码错误）
            message(resolveLoginError(res), { type: "error" });
          }
        })
        .catch(err => {
          // 网络/HTTP 异常
          message(resolveNetworkError(err), { type: "error" });
        })
        .finally(() => (loading.value = false));
    }
  });
};

const immediateDebounce = debounce(
  () => onLogin(ruleFormRef.value),
  1000,
  true
);

useEventListener(document, "keydown", ({ code }) => {
  if (
    ["Enter", "NumpadEnter"].includes(code) &&
    !disabled.value &&
    !loading.value
  )
    immediateDebounce();
});
</script>

<template>
  <div class="select-none">
    <PureLoginBg />
    <div class="login-container">
      <div class="img">
        <PureLoginIllustration />
      </div>
      <div class="login-box">
        <div class="login-form">
          <Motion>
            <h2 class="outline-hidden">{{ title }}</h2>
          </Motion>

          <el-form
            ref="ruleFormRef"
            :model="ruleForm"
            :rules="loginRules"
            size="large"
          >
            <Motion :delay="100">
              <el-form-item
                :rules="[
                  {
                    required: true,
                    message: '请输入账号',
                    trigger: 'blur'
                  }
                ]"
                prop="username"
              >
                <el-input
                  v-model="ruleForm.username"
                  clearable
                  placeholder="账号"
                  :prefix-icon="useRenderIcon(User)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="150">
              <el-form-item prop="password">
                <el-input
                  v-model="ruleForm.password"
                  clearable
                  show-password
                  placeholder="密码"
                  :prefix-icon="useRenderIcon(Lock)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="200">
              <div class="remember-row">
                <el-checkbox v-model="isRemembered">
                  记住登录状态
                </el-checkbox>
                <el-select
                  v-if="isRemembered"
                  v-model="loginDay"
                  class="login-day-select"
                  size="small"
                >
                  <el-option
                    v-for="item in loginDayOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </Motion>

            <Motion :delay="250">
              <el-button
                class="w-full mt-4!"
                size="default"
                type="primary"
                :loading="loading"
                :disabled="disabled"
                @click="onLogin(ruleFormRef)"
              >
                登录
              </el-button>
            </Motion>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("@/style/login.css");
</style>

<style lang="scss" scoped>
:deep(.el-input-group__append, .el-input-group__prepend) {
  padding: 0;
}

.remember-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.login-day-select {
  width: 100px;
}
</style>
