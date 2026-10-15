import axios from 'axios';
import { API_URL } from '@/lib/config';
import { getToken, clearToken } from '@/lib/auth/token';

/**
 * Browser API client. Every request carries the Bearer token; a 401 clears
 * the session and broadcasts `auth:logout` so the app can redirect to login.
 * API responses look like { success, message, data, meta } - helpers below
 * return that body.
 */
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 30000
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * The API names model timestamps createdAt / updatedAt, while the screens read created_at / updated_at.
 * Every response gets the snake_case twin of each camelCase timestamp, so dates show everywhere.
 */
const addTimestampAliases = (value) => {
  if (Array.isArray(value)) {
    value.forEach(addTimestampAliases);
  } else if (value && typeof value === 'object') {
    if ('createdAt' in value && !('created_at' in value)) value.created_at = value.createdAt;
    if ('updatedAt' in value && !('updated_at' in value)) value.updated_at = value.updatedAt;
    Object.values(value).forEach(addTimestampAliases);
  }
  return value;
};

api.interceptors.response.use(
  (response) => {
    if (typeof response.data === 'object') addTimestampAliases(response.data);
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && getToken()) {
      clearToken();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

/** Human-readable message from an API / network error. */
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const data = error?.response?.data;
  if (data?.errors?.length && data.errors[0]?.message) return data.errors[0].message;
  if (data?.message) return data.message;
  if (error?.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the API running?';
  return error?.message || fallback;
};

/** Field errors ({ field: message }) for forms from a 422 response. */
export const getFieldErrors = (error) =>
  Object.fromEntries((error?.response?.data?.errors || []).filter((e) => e.field).map((e) => [e.field, e.message]));

// Thin helpers returning the response body ({ success, message, data, meta }).
export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const post = (url, body, config) => api.post(url, body, config).then((r) => r.data);
export const put = (url, body, config) => api.put(url, body, config).then((r) => r.data);
export const patch = (url, body, config) => api.patch(url, body, config).then((r) => r.data);
export const del = (url, config) => api.delete(url, config).then((r) => r.data);

/** Multipart upload with optional progress callback (0-100). */
export const upload = (url, formData, { method = 'post', onProgress } = {}) =>
  api
    .request({
      url,
      method,
      data: formData,
      onUploadProgress: onProgress ? (e) => e.total && onProgress(Math.round((e.loaded / e.total) * 100)) : undefined
    })
    .then((r) => r.data);

/** Downloads a protected file (Bearer auth) and saves it in the browser. */
export const downloadFile = async (url, fallbackName = 'download') => {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1] || match[2]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

export default api;
