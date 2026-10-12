/** Runtime configuration (NEXT_PUBLIC_* values are inlined at build time). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1').replace(/\/+$/, '');

/** Origin of the API server, e.g. http://localhost:5000 (for /uploads/... assets). */
export const API_ORIGIN = API_URL.replace(/\/api\/v\d+$/, '');

export const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_ORIGIN;
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'ATV Academy';

/** Marketing / store site (where courses are bought). Shown on empty states only. */
export const STORE_URL = (process.env.NEXT_PUBLIC_STORE_URL || 'https://antarikshtv.com').replace(/\/+$/, '');

/** Logo shown in headers; falls back to the site name when it cannot load. */
export const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL || 'https://antarikshtv.com/wp-content/uploads/2026/07/LOgo-1024x668.png';
