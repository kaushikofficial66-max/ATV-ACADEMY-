import { RecordedVideo } from '../models/index.js';
import ApiError from '../utils/ApiError.js';
import { verifyMediaToken } from '../utils/jwt.js';
import { streamVideoFile } from '../services/storageService.js';
import { getVideoPlayback } from '../services/videoService.js';

/**
 * GET /media/videos/:videoId/stream?token=...
 * The short-lived token is issued only after the enrollment / course-manager
 * check (student lecture endpoints and tutor/admin video endpoints).
 *  - local files: range-enabled streaming from this server
 *  - Vimeo: 302 to the Vimeo player embed URL
 *  - external URL: 302 to the stored URL
 */
export const streamVideo = async (req, res) => {
  const decoded = verifyMediaToken(req.query.token, 'video', req.params.videoId);
  if (!decoded) throw ApiError.unauthorized('This video link has expired. Reload the lecture to continue watching.');

  const video = await RecordedVideo.findByPk(req.params.videoId, {
    attributes: ['id', 'storage_key', 'video_url', 'mime_type', 'status', 'vimeo_video_id', 'thumbnail_url']
  });
  if (!video || video.status === 'deleted') throw ApiError.notFound('Video not found.');

  if (video.storage_key) return streamVideoFile(req, res, video.storage_key, video.mime_type);
  const playback = await getVideoPlayback(video, decoded.id);
  return res.redirect(playback.stream_url);
};

export default { streamVideo };
