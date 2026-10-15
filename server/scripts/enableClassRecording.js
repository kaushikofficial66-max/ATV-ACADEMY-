/**
 * One-time helper: turns on automatic cloud recording for live classes that were scheduled BEFORE the
 * auto-recording feature existed (their Zoom meetings do not record by themselves).
 * Only upcoming classes with an LMS-created Zoom meeting are touched.
 *
 *   npm run zoom:enable-recording -- --dry-run     (only lists them)
 *   npm run zoom:enable-recording                  (updates the Zoom meetings and marks the classes as pending)
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const dryRun = process.argv.includes('--dry-run');
const { sequelize, LiveClass } = await import('../models/index.js');
const { Op } = await import('sequelize');
const { updateMeeting, isZoomConfigured } = await import('../services/zoomService.js');

if (!(await isZoomConfigured())) {
  console.error('Zoom is not configured (Admin > Settings > Zoom, or ZOOM_* in .env).');
  process.exit(1);
}

const classes = await LiveClass.findAll({
  where: { status: 'scheduled', recording_status: 'none', zoom_meeting_id: { [Op.ne]: null }, scheduled_start: { [Op.gt]: new Date() } },
  order: [['scheduled_start', 'ASC']]
});
console.log(`${classes.length} upcoming class(es) without automatic recording${dryRun ? '  (dry run)' : ''}`);

let done = 0;
for (const c of classes) {
  const label = `#${c.id}  ${new Date(c.scheduled_start).toISOString()}  "${c.title}"  (Zoom ${c.zoom_meeting_id})`;
  if (dryRun) {
    console.log(`  would enable  ${label}`);
    continue;
  }
  try {
    await updateMeeting(c.zoom_meeting_id, { ensureRecording: true });
    await c.update({ recording_status: 'pending' });
    done += 1;
    console.log(`  enabled       ${label}`);
  } catch (error) {
    console.log(`  FAILED        ${label}: ${error.message}`);
  }
}
if (!dryRun) console.log(`\nDone. Enabled ${done} of ${classes.length}.`);
await sequelize.close();
