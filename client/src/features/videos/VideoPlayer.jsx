'use client';

import { useEffect, useRef } from 'react';
import { assetUrl } from '@/lib/utils';

/**
 * Plays a recorded video from the API's `playback` object.
 *  - vimeo: private embed (iframe) driven by @vimeo/player
 *  - local / external: native <video>
 * `onPlay` fires once per mount on the first play - that is what counts a
 * "play" for the 90% progress rule (POST /student/videos/:id/play).
 * `onTimeUpdate(seconds)` is throttled by the caller.
 */
export default function VideoPlayer({ playback, title, startAt = 0, onPlay, onTimeUpdate, onEnded }) {
  const iframeRef = useRef(null);
  const playedRef = useRef(false);
  const handlers = useRef({ onPlay, onTimeUpdate, onEnded });
  useEffect(() => {
    handlers.current = { onPlay, onTimeUpdate, onEnded };
  });

  const firePlay = () => {
    if (playedRef.current) return;
    playedRef.current = true;
    handlers.current.onPlay?.();
  };

  const isVimeo = playback?.provider === 'vimeo';
  const embedUrl = playback?.embed_url || playback?.iframe_url;

  useEffect(() => {
    if (!isVimeo || !iframeRef.current) return undefined;
    let player;
    let cancelled = false;
    import('@vimeo/player').then(({ default: Player }) => {
      if (cancelled) return;
      player = new Player(iframeRef.current);
      if (startAt > 5) player.setCurrentTime(startAt).catch(() => {});
      player.on('play', firePlay);
      player.on('timeupdate', (e) => handlers.current.onTimeUpdate?.(e.seconds));
      player.on('ended', () => handlers.current.onEnded?.());
    });
    return () => {
      cancelled = true;
      player?.destroy().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVimeo, embedUrl]);

  if (!playback) return null;
  if (!playback.ready) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-slate-900 text-sm text-slate-300">
        This video is still processing. Please check back in a few minutes.
      </div>
    );
  }

  if (isVimeo) {
    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={title || 'Lecture video'}
          className="size-full"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      </div>
    );
  }

  const src = assetUrl(playback.stream_url);
  return (
    <video
      key={src}
      src={src}
      poster={playback.thumbnail_url ? assetUrl(playback.thumbnail_url) : undefined}
      controls
      controlsList="nodownload"
      className="aspect-video w-full rounded-xl bg-black"
      onLoadedMetadata={(e) => {
        if (startAt > 5) e.currentTarget.currentTime = startAt;
      }}
      onPlay={firePlay}
      onTimeUpdate={(e) => handlers.current.onTimeUpdate?.(e.currentTarget.currentTime)}
      onEnded={() => handlers.current.onEnded?.()}
    />
  );
}
