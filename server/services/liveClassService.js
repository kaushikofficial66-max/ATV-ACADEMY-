import { Op } from 'sequelize';
import { LiveClassParticipant, Enrollment } from '../models/index.js';

/**
 * After a class ends: enrolled students without a join record are recorded
 * as absent, and "registered" participants who never joined become absent.
 */
export const markAbsentees = async (liveClass) => {
  const enrolled = await Enrollment.findAll({
    where: {
      course_id: liveClass.course_id,
      status: { [Op.in]: ['active', 'completed'] },
      enrolled_at: { [Op.lte]: liveClass.scheduled_end }
    },
    attributes: ['user_id']
  });
  const existing = new Set(
    (await LiveClassParticipant.findAll({ where: { live_class_id: liveClass.id }, attributes: ['user_id'] })).map((p) => p.user_id)
  );
  const rows = enrolled
    .filter((e) => !existing.has(e.user_id))
    .map((e) => ({ live_class_id: liveClass.id, user_id: e.user_id, attendance_status: 'absent' }));
  if (rows.length) await LiveClassParticipant.bulkCreate(rows, { ignoreDuplicates: true });
  await LiveClassParticipant.update(
    { attendance_status: 'absent' },
    { where: { live_class_id: liveClass.id, attendance_status: 'registered' } }
  );
};

export default { markAbsentees };
