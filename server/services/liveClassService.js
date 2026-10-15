import { Op } from 'sequelize';
import { LiveClass, LiveClassParticipant, Enrollment, Lecture, CourseSection, RecordedVideo } from '../models/index.js';
import ApiError from '../utils/ApiError.js';

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

/** The module a class is placed in; throws 400 if it is not a module of this course. */
export const assertClassSection = async (courseId, sectionId) => {
  const section = await CourseSection.findByPk(sectionId);
  if (!section || Number(section.course_id) !== Number(courseId)) throw ApiError.badRequest('section_id must be a module of this course.');
  return section;
};

/**
 * Creates the "live class" lecture students see in the module list (with a LIVE badge) and links it
 * to the class. The recording is attached to this same lecture later. Returns the lecture.
 */
export const createClassLecture = async (liveClass, { transaction = null } = {}) => {
  const last = (await Lecture.max('sort_order', { where: { section_id: liveClass.section_id }, transaction })) || 0;
  const lecture = await Lecture.create(
    {
      section_id: liveClass.section_id,
      title: liveClass.title,
      description: liveClass.description || null,
      lecture_type: 'live_class',
      sort_order: last + 1,
      status: 'published'
    },
    { transaction }
  );
  await LiveClass.update({ lecture_id: lecture.id }, { where: { id: liveClass.id }, transaction });
  liveClass.lecture_id = lecture.id;
  return lecture;
};

/** Keeps the lecture's title / description in step with the class. */
export const syncClassLecture = async (liveClass) => {
  if (!liveClass.lecture_id) return;
  await Lecture.update({ title: liveClass.title, description: liveClass.description || null }, { where: { id: liveClass.lecture_id, lecture_type: 'live_class' } });
};

/** Cancelled / deleted class: remove its lecture unless a recording is already attached to it. */
export const removeClassLectureIfEmpty = async (liveClass) => {
  if (!liveClass.lecture_id) return;
  const hasVideo = await RecordedVideo.findOne({ where: { lecture_id: liveClass.lecture_id }, attributes: ['id'] });
  if (!hasVideo) {
    await Lecture.destroy({ where: { id: liveClass.lecture_id, lecture_type: 'live_class' } });
    await LiveClass.update({ lecture_id: null }, { where: { id: liveClass.id } });
    liveClass.lecture_id = null;
  }
};

export default { markAbsentees, assertClassSection, createClassLecture, syncClassLecture, removeClassLectureIfEmpty };
