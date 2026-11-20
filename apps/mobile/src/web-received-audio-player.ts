import {createReceivedAudioPlayer} from './received-audio-player.ts';

let liveOwner: object | null = null;
const unavailable = () => Error('Audio unavailable');
/** Bytes-only browser adapter. Resolver/transport must authorize and verify the bytes first.
 * No remote URL, persistence, fetch, microphone or automatic resume is provided. */
export function createWebReceivedAudioPlayer({foreground = () => document.visibilityState === 'visible' && document.hasFocus()}: {foreground?: () => boolean} = {}) {
  return createReceivedAudioPlayer({foreground, create: () => {
    if (liveOwner !== null) throw unavailable();
    const token = {}; liveOwner = token;
    let url: string | null = null, player: HTMLAudioElement | null = null;
    let cancelLoad = () => {}, detach = () => {};
    return {
      sample: () => ({durationMs: player ? Math.round(player.duration * 1000) : 0, positionMs: player ? Math.round(player.currentTime * 1000) : 0}),
      write(bytes) {
        if (url || !(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 1048576) throw unavailable();
        // Immutable Blob copy survives the caller wiping its transfer buffer.
        url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], {type: 'audio/mp4'}));
      },
      async load(current, finished) {
        if (!url || !current()) throw unavailable();
        const next = new Audio(url); player = next; next.preload = 'auto';
        let ended = false, loaded = false;
        const finish = (failed = false) => {if (ended) return; ended = true; finished(failed);};
        await new Promise<void>((resolve, reject) => {
          const fail = () => reject(unavailable());
          const timer = setTimeout(fail, 6000);
          const ready = () => {if (!current()) {fail(); return;} loaded = true; clearTimeout(timer); resolve();};
          const background = () => {if (!foreground()) {next.pause(); if (loaded) finish(); else fail();}};
          const error = () => {if (loaded) finish(true); else fail();};
          cancelLoad = fail;
          next.addEventListener('loadeddata', ready, {once: true});
          next.addEventListener('error', error);
          next.addEventListener('ended', () => finish(), {once: true});
          document.addEventListener('visibilitychange', background);
          window.addEventListener('blur', background);
          detach = () => {clearTimeout(timer); next.removeEventListener('loadeddata', ready); next.removeEventListener('error', error); document.removeEventListener('visibilitychange', background); window.removeEventListener('blur', background);};
          if (next.readyState >= 2) ready();
          next.load();
        });
        if (!current()) throw unavailable();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([next.play(), new Promise<never>((_, reject) => {timer = setTimeout(() => reject(unavailable()), 6000);})]);
          if (!current() || player !== next) {next.pause(); throw unavailable();}
        } finally {clearTimeout(timer);}
      },
      stop() {
        cancelLoad(); detach();
        const old = player; player = null;
        if (old) {old.pause(); old.removeAttribute('src'); old.load();}
      },
      remove() {
        if (url) {URL.revokeObjectURL(url); url = null;}
        if (liveOwner === token) liveOwner = null;
      },
    };
  }});
}
