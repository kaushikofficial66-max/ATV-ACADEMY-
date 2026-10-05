const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Minimal branded HTML page for links opened directly from emails
 * (e.g. email verification) when no frontend page handles them.
 */
export const renderMessagePage = ({ siteName = 'ATV Academy', title, message, success = true, actionUrl = null, actionLabel = null }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - ${escapeHtml(siteName)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f4f5f7; font-family: Arial, Helvetica, sans-serif; color: #1f2933; padding: 16px; box-sizing: border-box; }
  .card { background: #fff; border-radius: 10px; max-width: 460px; width: 100%; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .head { background: #1e3a8a; color: #fff; padding: 18px 24px; font-size: 20px; font-weight: bold; }
  .body { padding: 28px 24px; text-align: center; }
  .icon { width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; background: ${success ? '#16a34a' : '#dc2626'}; }
  h1 { font-size: 20px; margin: 0 0 10px; }
  p { line-height: 1.6; margin: 0; color: #52606d; }
  a.btn { display: inline-block; margin-top: 22px; background: #1e3a8a; color: #fff; padding: 11px 20px; border-radius: 6px; text-decoration: none; }
</style>
</head>
<body>
  <div class="card">
    <div class="head">${escapeHtml(siteName)}</div>
    <div class="body">
      <div class="icon">${success ? '&#10003;' : '!'}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${actionUrl ? `<a class="btn" href="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel || 'Continue')}</a>` : ''}
    </div>
  </div>
</body>
</html>`;

export default renderMessagePage;
