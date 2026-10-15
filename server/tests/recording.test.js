import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { pickRecordingFiles } from '../services/zoomService.js';
import { streamChunkReader } from '../services/vimeoService.js';

const file = (over) => ({
  file_type: 'MP4',
  status: 'completed',
  recording_type: 'shared_screen_with_speaker_view',
  recording_start: '2026-10-13T10:00:00Z',
  download_url: 'https://zoom.us/rec/download/abc',
  file_size: 1000,
  ...over
});

test('recording picker: uploads only the best video view (one MP4, not three)', () => {
  const r = pickRecordingFiles([
    file({ recording_type: 'gallery_view' }),
    file({ recording_type: 'shared_screen_with_speaker_view' }),
    file({ recording_type: 'active_speaker' }),
    file({ file_type: 'M4A', recording_type: 'audio_only' }),
    file({ file_type: 'TIMELINE', recording_type: 'timeline' }),
    file({ file_type: 'CHAT', recording_type: 'chat_file' })
  ]);
  assert.equal(r.state, 'ready');
  assert.equal(r.parts.length, 1);
  assert.equal(r.parts[0].recording_type, 'shared_screen_with_speaker_view');
});

test('recording picker: falls back to the next best view when the preferred one is missing', () => {
  const r = pickRecordingFiles([file({ recording_type: 'gallery_view' }), file({ recording_type: 'active_speaker' })]);
  assert.equal(r.parts[0].recording_type, 'active_speaker');
});

test('recording picker: host stopped and restarted recording -> parts in time order', () => {
  const r = pickRecordingFiles([
    file({ recording_start: '2026-10-13T11:00:00Z', id: 'second' }),
    file({ recording_start: '2026-10-13T10:00:00Z', id: 'first' })
  ]);
  assert.deepEqual(r.parts.map((p) => p.id), ['first', 'second']);
});

test('recording picker: waits while Zoom is still processing', () => {
  assert.equal(pickRecordingFiles([file({ status: 'processing' })]).state, 'processing');
  assert.equal(pickRecordingFiles([]).state, 'processing');
});

test('recording picker: audio-only recording is reported, not uploaded', () => {
  assert.equal(pickRecordingFiles([file({ file_type: 'M4A', recording_type: 'audio_only' })]).state, 'no_video');
});

test('stream chunk reader: odd-sized pieces are re-cut into exact chunks, last one short', async () => {
  const data = Buffer.from(Array.from({ length: 103 }, (_, i) => i % 251));
  const pieces = [];
  for (let i = 0; i < data.length; i += 7) pieces.push(data.subarray(i, i + 7));
  const read = streamChunkReader(Readable.from(pieces));
  const out = [];
  for (let offset = 0; offset < data.length; offset += 40) out.push(await read(offset, Math.min(40, data.length - offset)));
  assert.deepEqual(out.map((c) => c.length), [40, 40, 23]);
  assert.ok(Buffer.concat(out).equals(data), 'bytes come out unchanged and in order');
});

test('stream chunk reader: a stream that ends early returns fewer bytes (caller treats it as an error)', async () => {
  const read = streamChunkReader(Readable.from([Buffer.alloc(10, 1)]));
  assert.equal((await read(0, 25)).length, 10);
});
