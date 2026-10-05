import { Op } from 'sequelize';
import { Communication, User, Role } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { sendPlainMessage } from './mailService.js';
import { sendWhatsAppMessage } from './whatsappService.js';

const AUDIENCE_ROLES = {
  student: ['student'],
  tutor: ['tutor'],
  all_students: ['student'],
  all_tutors: ['tutor'],
  all_users: ['student', 'tutor']
};

const BULK_DELAY_MS = 120; // gentle pacing for SMTP / WhatsApp rate limits
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const resolveRecipients = async (recipientType, recipientId) => {
  const roles = AUDIENCE_ROLES[recipientType];
  if (!roles) throw ApiError.badRequest('Invalid recipient_type.');

  const include = [{ model: Role, as: 'role', attributes: ['name'], where: { name: { [Op.in]: roles } } }];
  const attributes = ['id', 'first_name', 'last_name', 'email', 'phone', 'status'];

  if (recipientType === 'student' || recipientType === 'tutor') {
    if (!recipientId) throw ApiError.badRequest('recipient_id is required when sending to a single user.');
    const user = await User.findByPk(recipientId, { attributes, include });
    if (!user) throw ApiError.notFound(`No ${recipientType} found with id ${recipientId}.`);
    return [user];
  }
  return User.findAll({ attributes, include, where: { status: 'active' } });
};

const personalise = (text, user) =>
  String(text || '')
    .replace(/{{\s*first_name\s*}}/g, user.first_name || '')
    .replace(/{{\s*last_name\s*}}/g, user.last_name || '')
    .replace(/{{\s*email\s*}}/g, user.email || '');

const deliver = async (channel, user, subject, message) => {
  const body = personalise(message, user);
  if (channel === 'email') return sendPlainMessage({ to: user.email, subject: personalise(subject, user), message: body });
  return sendWhatsAppMessage({ to: user.phone, message: subject ? `*${personalise(subject, user)}*\n\n${body}` : body });
};

/**
 * Sends an admin communication. Single-recipient sends complete before
 * responding; broadcasts are recorded as `pending` and delivered in the
 * background, after which the record is updated with the outcome.
 */
export const sendCommunication = async ({ senderId, recipientType, recipientId = null, channel, subject = null, message }) => {
  if (!['email', 'whatsapp'].includes(channel)) throw ApiError.badRequest('channel must be "email" or "whatsapp".');
  if (channel === 'email' && !subject) throw ApiError.badRequest('subject is required for email.');

  const recipients = await resolveRecipients(recipientType, recipientId);
  if (!recipients.length) throw ApiError.badRequest('No recipients match this audience.');

  const record = await Communication.create({
    sender_id: senderId,
    recipient_id: recipients.length === 1 && ['student', 'tutor'].includes(recipientType) ? recipients[0].id : null,
    recipient_type: recipientType,
    channel,
    subject,
    message,
    status: 'pending'
  });

  const isSingle = ['student', 'tutor'].includes(recipientType);
  if (isSingle) {
    const result = await deliver(channel, recipients[0], subject, message);
    await record.update({
      status: result.sent ? 'sent' : 'failed',
      provider_message_id: result.messageId || null,
      sent_at: result.sent ? new Date() : null,
      error_message: result.sent ? null : result.error
    });
    return { communication: record, recipients: 1, queued: false };
  }

  // Broadcast: deliver asynchronously.
  setImmediate(async () => {
    let sent = 0;
    const failures = [];
    for (const user of recipients) {
      const result = await deliver(channel, user, subject, message);
      if (result.sent) sent += 1;
      else failures.push(`${user.email}: ${result.error}`);
      await sleep(BULK_DELAY_MS);
    }
    await record
      .update({
        status: sent > 0 ? 'sent' : 'failed',
        sent_at: sent > 0 ? new Date() : null,
        error_message: failures.length
          ? `Delivered ${sent}/${recipients.length}. Failures:\n${failures.slice(0, 50).join('\n')}${failures.length > 50 ? `\n...and ${failures.length - 50} more` : ''}`
          : null
      })
      .catch((e) => console.error('[Communication]: could not update record', e.message));
  });

  return { communication: record, recipients: recipients.length, queued: true };
};

export default { sendCommunication };
