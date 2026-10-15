import { Op } from 'sequelize';
import { LiveClass, RecordedVideo, FileModel, CourseSection, Lecture } from '../models/index.js';
import { getGroupSettings } from './settingsService.js';
import { isZoomConfigured, getMeetingRecordings, pickRecordingFiles, openRecordingDownload, trashMeetingRecordings } from './zoomService.js';
import { getVimeoConfig, isVimeoConfigured, uploadVideoStream, deleteVimeoVideo } from './vimeoService.js';
import { recordVideoFile } from './videoService.js';
import { notifyUser } from './notificationService.js';

/**
 * Live class recording -> Vimeo, fully automatic.
 *
 *  1. When a class is scheduled, its Zoom meeting is created with auto_recording = cloud
 *     (zoomService.createMeeting) and live_classes.recording_status = 'pending'.
 *  2. The scheduler calls processPendingRecordings() every few minutes. For every class that has
 *     ended it asks Zoom for the meeting's cloud recording. Nothing there yet = try again later.
 *  3. When Zoom has finished processing, the MP4 is streamed from Zoom straight to Vimeo (no temp
 *     file), into the recordings folder, and saved as a recorded_videos row of the class's course.
 *     The recording is attached to the class's own lecture, in the module the tutor chose when
 *     scheduling (students see it there with a LIVE badge). Extra parts become extra lectures in that module.
 *     Older classes without a module fall back to a hidden "Live class recordings" module holding DRAFT
 *     lectures (a tutor then publishes / moves them from the course Curriculum page).
 *  4. The tutor is notified.
 */

const FIRST_CHECK_AFTER_END_MINUTES = 5;
const LOOK_BACK_DAYS = 7;
const GIVE_UP_NO_RECORDING_HOURS = 24;
const MAX_ATTEMPTS = 5;
const STUCK_UPLOAD_MINUTES = 180;
const minutes = (n) => n * 60 * 1000;
const RECORDINGS_SECTION_TITLE = 'Live class recordings';

/** The course's hidden module for recordings (created on first use). */
const ensureRecordingsSection = async (courseId) => {
  const existing = await CourseSection.findOne({ where: { course_id: courseId, title: RECORDINGS_SECTION_TITLE } });
  if (existing) return existing;
  const last = (await CourseSection.max('sort_order', { where: { course_id: courseId } })) || 0;
  return CourseSection.create({
    course_id: courseId,
    title: RECORDINGS_SECTION_TITLE,
    description: 'Recordings of live classes. Hidden from students until you activate this module and publish a lecture, or move a lecture into another module.',
    sort_order: last + 1,
    status: 'inactive'
  });
};

let running = false;

const partTitle = (liveClass, index, total) => `${liveClass.title} - recording${total > 1 ? ` (part ${index + 1} of ${total})` : ''}`;

const failClass = async (liveClass, message) => {
  const attempts = liveClass.recording_attempts + 1;
  const giveUp = attempts >= MAX_ATTEMPTS;
  await liveClass.update({
    recording_status: giveUp ? 'failed' : 'pending',
    recording_attempts: attempts,
    recording_error: String(message).slice(0, 500),
    recording_checked_at: new Date()
  });
  if (giveUp) {
    await notifyUser(liveClass.tutor_id, {
      title: 'Live class recording could not be saved',
      message: `The recording of "${liveClass.title}" could not be copied to Vimeo after ${attempts} attempts (${String(message).slice(0, 200)}). It may still be in your Zoom cloud recordings.`,
      type: 'recording_failed',
      reference_type: 'live_class',
      reference_id: liveClass.id
    });
  }
  console.warn(`[Recording] class ${liveClass.id}: ${message} (attempt ${attempts}/${MAX_ATTEMPTS}${giveUp ? ', giving up' : ''})`);
};

/** Removes everything an unfinished attempt created (Vimeo videos + rows), so a retry starts clean. */
const rollback = async (vimeoIds, videos, lectures) => {
  for (const id of vimeoIds) {
    await deleteVimeoVideo(id).catch((e) => console.warn(`[Recording] could not delete Vimeo video ${id}: ${e.message}`));
    await FileModel.update({ status: 'deleted' }, { where: { storage_provider: 'vimeo', storage_key: String(id) } }).catch(() => {});
  }
  for (const video of videos) await video.destroy().catch(() => {});
  for (const lecture of lectures) await lecture.destroy().catch(() => {});
};

/**
 * Copies the recording of one class to Vimeo. Returns 'uploaded' | 'waiting' | 'failed'.
 * Safe to call repeatedly: it only uploads once Zoom reports finished MP4 files.
 */
export const processClassRecording = async (liveClass) => {
  const recordings = await getMeetingRecordings(liveClass.zoom_meeting_id);
  const picked = recordings ? pickRecordingFiles(recordings.recording_files) : { state: 'none' };

  if (picked.state === 'none' || picked.state === 'processing') {
    const waitedHours = (Date.now() - new Date(liveClass.scheduled_end).getTime()) / 3600000;
    if (picked.state === 'none' && waitedHours > GIVE_UP_NO_RECORDING_HOURS) {
      await liveClass.update({
        recording_status: 'failed',
        recording_error: 'Zoom has no recording for this class (it may not have been started, or recording was stopped).',
        recording_checked_at: new Date()
      });
      return 'failed';
    }
    await liveClass.update({ recording_checked_at: new Date() });
    return 'waiting';
  }
  if (picked.state === 'no_video') {
    await failClass(liveClass, 'Zoom produced no video file for this class (audio only?).');
    return 'failed';
  }

  // Claim the class so a second scheduler run / server instance does not upload it twice.
  const [claimed] = await LiveClass.update(
    { recording_status: 'uploading', recording_checked_at: new Date() },
    { where: { id: liveClass.id, recording_status: 'pending' } }
  );
  if (!claimed) return 'waiting';

  const vimeo = await getVimeoConfig();
  const created = [];
  const lectures = [];
  const vimeoIds = [];
  let placedInClassLecture = false;
  try {
    // The class's own lecture (module chosen when scheduling) - else the hidden fallback module.
    const classLecture = liveClass.lecture_id ? await Lecture.findByPk(liveClass.lecture_id) : null;
    placedInClassLecture = Boolean(classLecture);
    const section = classLecture ? await CourseSection.findByPk(classLecture.section_id) : await ensureRecordingsSection(liveClass.course_id);
    const firstOrder = ((await Lecture.max('sort_order', { where: { section_id: section.id } })) || 0) + 1;
    for (const [index, part] of picked.parts.entries()) {
      const { stream, size } = await openRecordingDownload(part);
      const title = partTitle(liveClass, index, picked.parts.length);
      const description = `Recorded automatically from the live class "${liveClass.title}".`;
      const { videoId, embedUrl } = await uploadVideoStream(stream, size, { name: title, description, folderId: vimeo.recordingsFolderId });
      vimeoIds.push(videoId);
      let lecture;
      if (classLecture && index === 0) lecture = classLecture;
      else {
        lecture = await Lecture.create({
          section_id: section.id,
          title,
          description,
          lecture_type: classLecture ? 'live_class' : 'video',
          sort_order: firstOrder + index,
          status: classLecture ? 'published' : 'draft'
        });
        lectures.push(lecture);
      }
      const video = await RecordedVideo.create({
        course_id: liveClass.course_id,
        section_id: section.id,
        lecture_id: lecture.id,
        uploaded_by: liveClass.tutor_id,
        title,
        description,
        vimeo_video_id: videoId,
        video_url: embedUrl || `https://player.vimeo.com/video/${videoId}`,
        file_size: size,
        mime_type: 'video/mp4',
        sort_order: index,
        status: 'processing'
      });
      created.push(video);
      await recordVideoFile(video, null, 'vimeo', liveClass.tutor_id);
    }
  } catch (error) {
    await rollback(vimeoIds, created, lectures);
    await liveClass.reload();
    await failClass(liveClass, error.message);
    return 'failed';
  }

  await liveClass.update({ recording_status: 'uploaded', recording_video_id: created[0].id, recording_error: null, recording_checked_at: new Date() });
  await notifyUser(liveClass.tutor_id, {
    title: 'Live class recording is on Vimeo',
    message: placedInClassLecture
      ? `The recording of "${liveClass.title}" was added to its lecture${created.length > 1 ? ` (${created.length} parts)` : ''}. Vimeo may need a few minutes to process it; then students can watch it in the module.`
      : `The recording of "${liveClass.title}" was saved to your course${created.length > 1 ? ` (${created.length} parts)` : ''} as a draft lecture in the hidden module "${RECORDINGS_SECTION_TITLE}". Vimeo may need a few minutes to process it. Open the course Curriculum to publish it or move it into a module.`,
    type: 'recording_ready',
    reference_type: 'recorded_video',
    reference_id: created[0].id
  });

  const zoomCfg = await getGroupSettings('zoom');
  if (zoomCfg.zoom_trash_after_upload) await trashMeetingRecordings(liveClass.zoom_meeting_id);
  console.log(`[Recording] class ${liveClass.id} "${liveClass.title}": ${created.length} video(s) uploaded to Vimeo`);
  return 'uploaded';
};

/** Scheduler entry point: handles every ended class that is still waiting for its recording. */
export const processPendingRecordings = async () => {
  if (running) return 0;
  running = true;
  try {
    if (!(await isZoomConfigured()) || !(await isVimeoConfigured())) return 0;

    // An upload that died with the server (crash / deploy) is released after a while.
    await LiveClass.update(
      { recording_status: 'pending' },
      { where: { recording_status: 'uploading', recording_checked_at: { [Op.lt]: new Date(Date.now() - minutes(STUCK_UPLOAD_MINUTES)) } } }
    );

    const now = Date.now();
    const classes = await LiveClass.findAll({
      where: {
        recording_status: 'pending',
        zoom_meeting_id: { [Op.ne]: null },
        status: { [Op.ne]: 'cancelled' },
        scheduled_end: { [Op.gt]: new Date(now - LOOK_BACK_DAYS * 24 * 3600 * 1000) },
        // Ended: either its scheduled time has passed, or it was ended early (marked completed).
        [Op.or]: [{ status: 'completed' }, { scheduled_end: { [Op.lt]: new Date(now - minutes(FIRST_CHECK_AFTER_END_MINUTES)) } }]
      },
      order: [['scheduled_end', 'ASC']],
      limit: 20
    });

    let handled = 0;
    for (const liveClass of classes) {
      // After a failed attempt wait longer each time (10, 20, 30 ... minutes).
      const waitMs = minutes(10) * liveClass.recording_attempts;
      if (waitMs && liveClass.recording_checked_at && now - new Date(liveClass.recording_checked_at).getTime() < waitMs) continue;
      try {
        await processClassRecording(liveClass);
      } catch (error) {
        await liveClass.reload().catch(() => {});
        if (liveClass.recording_status === 'uploading') await failClass(liveClass, error.message);
        else console.warn(`[Recording] class ${liveClass.id}: ${error.message}`);
      }
      handled += 1;
    }
    return handled;
  } finally {
    running = false;
  }
};

export default { processClassRecording, processPendingRecordings };
