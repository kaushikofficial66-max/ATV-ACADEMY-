import axios from 'axios';
import { getGroupSettings } from './settingsService.js';

/** Normalises a phone number to E.164 digits without '+', e.g. 919876543210 */
export const normalizePhone = (phone, defaultCountryCode = '91') => {
  if (!phone) return null;
  let digits = String(phone).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  digits = digits.replace(/^0+/, '');
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
};

export const isWhatsAppConfigured = async () => {
  const cfg = await getGroupSettings('whatsapp');
  return Boolean(cfg.whatsapp_enabled && cfg.whatsapp_phone_number_id && cfg.whatsapp_access_token);
};

/**
 * Sends a text message via the Meta WhatsApp Cloud API.
 * Note: outside a 24h customer-service window Meta only delivers approved
 * template messages; pass `template` ({ name, language, components }) for that.
 * Returns { sent, messageId?, error? } and never throws.
 */
export const sendWhatsAppMessage = async ({ to, message, template = null }) => {
  try {
    const cfg = await getGroupSettings('whatsapp');
    if (!cfg.whatsapp_enabled || !cfg.whatsapp_phone_number_id || !cfg.whatsapp_access_token) {
      return { sent: false, error: 'WhatsApp is not configured. Configure it in Admin > Settings > WhatsApp.' };
    }
    const phone = normalizePhone(to, cfg.whatsapp_default_country_code);
    if (!phone) return { sent: false, error: 'Recipient has no phone number.' };

    const payload = template
      ? {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language || 'en' },
            ...(template.components && { components: template.components })
          }
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: true, body: message }
        };

    const { data } = await axios.post(
      `https://graph.facebook.com/${cfg.whatsapp_api_version}/${cfg.whatsapp_phone_number_id}/messages`,
      payload,
      {
        headers: { Authorization: `Bearer ${cfg.whatsapp_access_token}`, 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    return { sent: true, messageId: data?.messages?.[0]?.id || null };
  } catch (error) {
    const apiMessage = error.response?.data?.error?.message;
    console.error(`[WhatsApp Error]: ${apiMessage || error.message}`);
    return { sent: false, error: apiMessage || error.message };
  }
};

export default { sendWhatsAppMessage, normalizePhone, isWhatsAppConfigured };
