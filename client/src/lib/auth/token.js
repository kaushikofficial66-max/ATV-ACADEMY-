/**
 * Access-token storage (browser only).
 * The API also sets an httpOnly `token` cookie on login; the Bearer header
 * below is what the API client sends on every request.
 */
const KEY = 'atv_token';

export const getToken = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) - session stays in memory only */
  }
};

export const clearToken = () => setToken(null);

/**
 * Admin "view as" mode: while an admin previews the app as a student/tutor,
 * their own token is parked here and restored when they exit the preview.
 */
const ADMIN_KEY = 'atv_admin_token';

export const getAdminToken = () => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ADMIN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token) => {
  try {
    if (token) window.localStorage.setItem(ADMIN_KEY, token);
    else window.localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* storage unavailable */
  }
};
