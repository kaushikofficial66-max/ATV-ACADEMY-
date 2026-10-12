import nodemailer from 'nodemailer';
import { getGroupSettings, getSetting } from './settingsService.js';

let transporter = null;
let transporterKey = '';

const getTransporter = async () => {
  const cfg = await getGroupSettings('email');
  if (!cfg.mail_host || !cfg.mail_user) return { transporter: null, cfg };

  const key = `${cfg.mail_host}|${cfg.mail_port}|${cfg.mail_user}|${cfg.mail_password}|${cfg.mail_secure}`;
  if (!transporter || key !== transporterKey) {
    transporter = nodemailer.createTransport({
      host: cfg.mail_host,
      port: Number(cfg.mail_port) || 587,
      secure: Boolean(cfg.mail_secure) || Number(cfg.mail_port) === 465,
      auth: { user: cfg.mail_user, pass: cfg.mail_password }
    });
    transporterKey = key;
  }
  return { transporter, cfg };
};

export const isMailConfigured = async () => Boolean((await getTransporter()).transporter);

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Wraps plain text / simple HTML in the branded layout. */
const layout = async (title, bodyHtml) => {
  const siteName = await getSetting('site_name');
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background:#5b21b6;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">${escapeHtml(siteName)}</td></tr>
  <tr><td style="padding:24px"><h2 style="margin-top:0;font-size:18px">${escapeHtml(title)}</h2>${bodyHtml}</td></tr>
  <tr><td style="padding:16px 24px;font-size:12px;color:#7b8794;border-top:1px solid #e4e7eb">This email was sent by ${escapeHtml(siteName)}.</td></tr>
  </table></td></tr></table></body></html>`;
};

const button = (url, label) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#5b21b6;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>
   <p style="font-size:12px;color:#7b8794">If the button does not work, copy this link into your browser:<br>${escapeHtml(url)}</p>`;

/**
 * Sends an email. Returns { sent, messageId?, error? } and never throws, so
 * callers (registration, notifications) are not broken by SMTP outages.
 */
export const sendMail = async ({ to, subject, html, text }) => {
  try {
    const { transporter: tx, cfg } = await getTransporter();
    if (!tx) {
      console.warn(`[Mail]: SMTP not configured - skipped "${subject}" to ${to}`);
      return { sent: false, error: 'Email (SMTP) is not configured. Configure it in Admin > Settings > Email.' };
    }
    const fromAddress = cfg.mail_from_address || cfg.mail_user;
    const info = await tx.sendMail({
      from: `"${cfg.mail_from_name}" <${fromAddress}>`,
      to,
      subject,
      html,
      text
    });
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Mail Error]: ${error.message}`);
    return { sent: false, error: error.message };
  }
};

/** Free-form message (admin communications). Text is escaped and line breaks kept. */
export const sendPlainMessage = async ({ to, subject, message }) =>
  sendMail({
    to,
    subject,
    text: message,
    html: await layout(subject, `<div style="line-height:1.6">${escapeHtml(message).replace(/\n/g, '<br>')}</div>`)
  });

export const sendVerificationEmail = async (user, url) =>
  sendMail({
    to: user.email,
    subject: 'Verify your email address',
    text: `Hi ${user.first_name}, verify your email: ${url}`,
    html: await layout(
      'Verify your email address',
      `<p>Hi ${escapeHtml(user.first_name)},</p><p>Thanks for signing up. Please confirm your email address. This link expires in 24 hours.</p>${button(url, 'Verify Email')}`
    )
  });

export const sendPasswordResetEmail = async (user, url) =>
  sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `Hi ${user.first_name}, reset your password: ${url} (valid for 1 hour)`,
    html: await layout(
      'Reset your password',
      `<p>Hi ${escapeHtml(user.first_name)},</p><p>We received a request to reset your password. This link is valid for 1 hour. If you did not request this, you can ignore this email.</p>${button(url, 'Reset Password')}`
    )
  });

export const sendNotificationEmail = async (user, title, message, url = null) =>
  sendMail({
    to: user.email,
    subject: title,
    text: message,
    html: await layout(
      title,
      `<p>Hi ${escapeHtml(user.first_name)},</p><p style="line-height:1.6">${escapeHtml(message)}</p>${url ? button(url, 'Open') : ''}`
    )
  });

export default {
  sendMail,
  sendPlainMessage,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNotificationEmail,
  isMailConfigured
};
