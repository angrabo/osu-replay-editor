import { create } from 'zustand';
import { APP_VERSION } from '../appMeta';

/// Which builds this install updates to: stable only, or beta, which also gets every stable build
/// newer than the last beta (like osu!lazer's Tachyon stream).
export type UpdateChannel = 'stable' | 'beta';
const storageKey = 'osu-replay-editor.update-channel';

// A beta build starts on the beta channel; anything else on stable.
const defaultChannel: UpdateChannel = APP_VERSION.includes('-') ? 'beta' : 'stable';

function readSaved(): UpdateChannel {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === 'beta' || saved === 'stable' ? saved : defaultChannel;
  } catch {
    return defaultChannel;
  }
}

export const useUpdateChannelStore = create<{ channel: UpdateChannel; setChannel: (channel: UpdateChannel) => void }>(
  (set) => ({
    channel: readSaved(),
    setChannel: (channel) => {
      set({ channel });
      try {
        localStorage.setItem(storageKey, channel);
      } catch {
        /* the choice still applies for this session */
      }
    },
  }),
);
