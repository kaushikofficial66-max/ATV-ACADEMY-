import { get, post, put } from '@/lib/api/client';
import { EP } from '@/lib/api/endpoints';

export const authApi = {
  login: (body) => post(EP.auth.login, body),
  register: (body) => post(EP.auth.register, body),
  logout: () => post(EP.auth.logout),
  me: () => get(EP.auth.me),
  forgotPassword: (email) => post(EP.auth.forgotPassword, { email }),
  resetPassword: (token, new_password) => post(EP.auth.resetPassword, { token, new_password }),
  verifyEmail: (token) => post(EP.auth.verifyEmail, { token }),
  resendVerification: () => post(EP.auth.resendVerification),
  changePassword: (current_password, new_password) => put(EP.account.password, { current_password, new_password })
};

export default authApi;
