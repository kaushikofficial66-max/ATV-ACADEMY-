import fs from 'fs';
import { Op } from 'sequelize';
import { RecordedVideo, Lecture, FileModel } from '../models/index.js';
import { generateMediaToken } from '../utils/jwt.js';
import { storageKeyFor } from '../middlewares/upload.js';
import { shouldUseVimeo } from './storageDriver.js';
import {
  uploadVideoFile,
  getVideoDetails,
  deleteVimeoVideo,
  mapVimeoState,
  playerUrl,
  getDirectPlayLinks,
  getVimeoConfig
} from './vimeoService.js';
import { recordFile, recordRemoteFile, removeStoredFile } from './storageService.js';
import { recalculateCourseEnrollments } from './progressService.js';
import { notifyUser } from './notificationService.js';

export const PLAYABLE_VIDEO_STATUSES = ['ready', 'published'];

export const providerOf = (video) => (video.vimeo_video_id ? 'vimeo' : video.storage_key ? 'local' : 'external');

/**
 * Stores an uploaded video file (multer temp file):
 *  - Vimeo when configured -> { vimeo_video_id, video_url: player embed URL, status: 'processing' }
 *  - otherwise local disk  -> { storage_key, status: 'ready' }
 * Returns { provider, fields } with the recorded_videos fields to save.
 */
export const storeVideoUpload = async (file, { title, description } = {}) => {
  if (await shouldUseVimeo()) {
    try {
      const { videoId, embedUrl } = await uploadVideoFile(file.path, { name: title || file.originalname, description });
      return {
        provider: 'vimeo',
        fields: {
          vimeo_video_id: videoId,
          storage_key: null,
          video_url: embedUrl || `https://player.vimeo.com/video/${videoId}`,
          file_size: file.size,
          mime_type: file.mimetype,
          status: 'processing'
        }
      };
    } finally {
      await fs.promises.unlink(file.path).catch(() => {});
    }
  }
  return {
    provider: 'local',
    fields: {
      vimeo_video_id: null,
      storage_key: storageKeyFor(file),
      file_size: file.size,
      mime_type: file.mimetype,
      status: 'ready'
    }
  };
};

/**
 * Writes the `files` audit row for a stored video. For Vimeo it also marks
 * the video as uploaded by the LMS (so deleting the lesson deletes it on
 * Vimeo); videos merely linked from an existing Vimeo URL are not recorded.
 */
export const recordVideoFile = async (video, file, provider, uploadedBy, transaction = null) => {
  if (provider === 'vimeo') {
    return recordRemoteFile({
      uploadedBy,
      provider: 'vimeo',
      storageKey: video.vimeo_video_id,
      url: video.video_url,
      originalName: file?.originalname || video.title,
      mimeType: file?.mimetype || null,
      size: file?.size || null,
      entityType: 'recorded_video',
      entityId: video.id,
      transaction
    });
  }
  if (file) return recordFile(file, { uploadedBy, entityType: 'recorded_video', entityId: video.id, transaction });
  return null;
};

/** True when the LMS uploaded this Vimeo video (vs. linking an existing one). */
const isManagedVimeoVideo = async (vimeoId) =>
  Boolean(await FileModel.findOne({ where: { storage_provider: 'vimeo', storage_key: String(vimeoId), status: 'active' }, attributes: ['id'] }));

/**
 * Deletes the underlying asset. Vimeo videos are deleted only if the LMS
 * uploaded them; linked videos stay on your Vimeo account. Never throws.
 */
export const removeVideoAsset = async (video) => {
  try {
    if (video.vimeo_video_id) {
      if (await isManagedVimeoVideo(video.vimeo_video_id)) {
        await deleteVimeoVideo(video.vimeo_video_id);
        await FileModel.update({ status: 'deleted' }, { where: { storage_provider: 'vimeo', storage_key: String(video.vimeo_video_id) } });
      }
    } else if (video.storage_key) {
      await removeStoredFile(video.storage_key);
    }
  } catch (error) {
    console.warn(`[Video]: could not delete asset of video ${video.id}: ${error.message}`);
  }
};

/**
 * Applies a Vimeo video object to the row: status, duration (also copied to
 * the lecture when it has none), embed URL and thumbnail.
 */
export const applyVimeoDetails = async (video, details) => {
  const mapped = mapVimeoState(details);
  const updates = {};
  // Keep manager choices (published / unpublished) once the video is ready.
  if (mapped.status === 'failed' && video.status !== 'failed') updates.status = 'failed';
  else if (mapped.status === 'ready' && ['processing', 'failed'].includes(video.status)) updates.status = 'ready';
  if (mapped.duration_seconds && mapped.duration_seconds !== video.duration_seconds) updates.duration_seconds = mapped.duration_seconds;
  if (mapped.embed_url && mapped.embed_url !== video.video_url) updates.video_url = mapped.embed_url;
  if (mapped.thumbnail_url && !video.thumbnail_url) updates.thumbnail_url = mapped.thumbnail_url;
  if (Object.keys(updates).length) await video.update(updates);

  if (updates.duration_seconds && video.lecture_id) {
    await Lecture.update({ duration_seconds: updates.duration_seconds }, { where: { id: video.lecture_id, duration_seconds: { [Op.or]: [null, 0] } } });
  }
  if (updates.status === 'ready') {
    setImmediate(() => recalculateCourseEnrollments(video.course_id).catch(() => {}));
  }
  if (updates.status === 'failed') {
    await notifyUser(video.uploaded_by, {
      title: 'Video processing failed',
      message: `"${video.title}" could not be processed by Vimeo (${mapped.error}). Please upload it again.`,
      type: 'video_failed',
      reference_type: 'recorded_video',
      reference_id: video.id
    });
  }
  return { video, state: mapped };
};

/** Pulls the latest transcoding state from Vimeo for one video. */
export const syncVimeoVideo = async (video) => {
  if (!video.vimeo_video_id) return { video, state: { status: video.status } };
  const details = await getVideoDetails(video.vimeo_video_id);
  return applyVimeoDetails(video, details);
};

/** Polls videos still transcoding on Vimeo (scheduler, every few minutes). */
export const syncProcessingVideos = async () => {
  const videos = await RecordedVideo.findAll({
    where: {
      status: 'processing',
      vimeo_video_id: { [Op.ne]: null },
      created_at: { [Op.gte]: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }
    },
    limit: 50
  });
  for (const video of videos) {
    await syncVimeoVideo(video).catch((e) => console.warn(`[Video sync] ${video.id}: ${e.message}`));
  }
  return videos.length;
};

/**
 * Playback info for an authorised viewer.
 *  vimeo    -> Vimeo player embed URL (use in an <iframe> or with @vimeo/player);
 *              optional time-limited HLS/MP4 links when vimeo_use_direct_links is on
 *  local    -> signed range-streaming URL on this API
 *  external -> the stored URL
 * `stream_url` is always what to hand to the player.
 */
export const getVideoPlayback = async (video, userId) => {
  const provider = providerOf(video);
  const ready = PLAYABLE_VIDEO_STATUSES.includes(video.status);
  if (provider === 'vimeo') {
    const embedUrl = playerUrl(video.video_url || `https://player.vimeo.com/video/${video.vimeo_video_id}`);
    const playback = {
      provider,
      ready,
      vimeo_video_id: video.vimeo_video_id,
      embed_url: embedUrl,
      iframe_url: embedUrl,
      stream_url: embedUrl,
      hls_url: null,
      mp4_url: null,
      thumbnail_url: video.thumbnail_url || null,
      expires_at: null
    };
    if (ready && (await getVimeoConfig()).directLinks) {
      const links = await getDirectPlayLinks(video.vimeo_video_id);
      if (links) Object.assign(playback, links);
    }
    return playback;
  }
  if (provider === 'local') {
    return {
      provider,
      ready,
      stream_url: `/api/v1/media/videos/${video.id}/stream?token=${generateMediaToken(userId, 'video', video.id)}`,
      thumbnail_url: video.thumbnail_url || null,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000)
    };
  }
  return { provider, ready: true, stream_url: video.video_url, thumbnail_url: video.thumbnail_url || null, expires_at: null };
};

export default {
  PLAYABLE_VIDEO_STATUSES,
  providerOf,
  storeVideoUpload,
  recordVideoFile,
  removeVideoAsset,
  applyVimeoDetails,
  syncVimeoVideo,
  syncProcessingVideos,
  getVideoPlayback
};
