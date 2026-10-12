/**
 * One-time helper: moves every Vimeo video the LMS already uploaded into the folder VIMEO_FOLDER_ID.
 * New uploads go there automatically; this fixes the ones uploaded before the folder worked.
 *
 * Needs a Vimeo access token that has the "interact" scope.
 *
 *   npm run vimeo:to-folder -- --dry-run     (only lists what would be moved)
 *   npm run vimeo:to-folder                  (moves them)
 *
 * Safe to re-run: a video that is already in the folder stays there.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const dryRun = process.argv.includes('--dry-run');
const { sequelize, RecordedVideo } = await import('../models/index.js');
const { Op } = await import('sequelize');
const { getVimeoConfig, moveToConfiguredFolder } = await import('../services/vimeoService.js');

const cfg = await getVimeoConfig();
if (!cfg.token) {
  console.error('VIMEO_ACCESS_TOKEN is not set.');
  process.exit(1);
}
if (!cfg.folderId) {
  console.error('VIMEO_FOLDER_ID is not set - nothing to move videos into.');
  process.exit(1);
}

const rows = await RecordedVideo.findAll({
  where: { vimeo_video_id: { [Op.not]: null }, status: { [Op.ne]: 'deleted' } },
  attributes: ['id', 'title', 'vimeo_video_id'],
  order: [['id', 'ASC']]
});
console.log(`${rows.length} Vimeo video(s) in the LMS. Target folder: ${cfg.folderId}${dryRun ? '  (dry run)' : ''}`);

let moved = 0;
let failed = 0;
for (const v of rows) {
  if (dryRun) {
    console.log(`  would move  #${v.id}  vimeo ${v.vimeo_video_id}  "${v.title}"`);
    continue;
  }
  const result = await moveToConfiguredFolder(v.vimeo_video_id);
  if (result.moved) {
    moved += 1;
    console.log(`  moved       #${v.id}  vimeo ${v.vimeo_video_id}  "${v.title}"`);
  } else {
    failed += 1;
    console.log(`  FAILED      #${v.id}  vimeo ${v.vimeo_video_id}: ${result.error}`);
    if (/interact/i.test(result.error || '')) {
      console.log('\nStopping: the token still has no "interact" scope. Create a new token and update VIMEO_ACCESS_TOKEN.');
      break;
    }
  }
}
if (!dryRun) console.log(`\nDone. Moved ${moved}, failed ${failed}.`);
await sequelize.close();
