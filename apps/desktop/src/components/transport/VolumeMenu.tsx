import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useEditorStore } from '../../stores/editor';
import { useSkinStore } from '../../stores/skin';

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="volume-menu-row">
      <span>{label}</span>
      <input
        aria-label={`${label} volume`}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value}%</output>
    </label>
  );
}

/// Volume button with a hover panel: master scales both music (the beatmap audio) and effects
/// (hitsounds, combo breaks). Clicking the button mutes or restores the master volume.
export function VolumeMenu() {
  const master = useEditorStore((state) => state.volume);
  const setMaster = useEditorStore((state) => state.setVolume);
  const music = useEditorStore((state) => state.musicVolume);
  const setMusic = useEditorStore((state) => state.setMusicVolume);
  const effects = useSkinStore((state) => state.hitsoundVolume);
  const setEffects = useSkinStore((state) => state.setHitsoundVolume);
  const Icon = master === 0 ? VolumeX : master < 50 ? Volume1 : Volume2;
  return (
    <div className="volume-menu">
      <button
        type="button"
        className="volume-menu-button"
        title={master === 0 ? 'Unmute' : 'Mute'}
        aria-label="Volume"
        onClick={() => {
          const state = useEditorStore.getState();
          if (state.volume > 0) {
            state.setMutedVolume(state.volume);
            state.setVolume(0);
          } else state.setVolume(state.mutedVolume || 70);
        }}
      >
        <Icon size={16} />
        <span>{master}%</span>
      </button>
      <div className="volume-menu-popover premiere-popover">
        <VolumeSlider label="Master" value={master} onChange={setMaster} />
        <VolumeSlider label="Music" value={music} onChange={setMusic} />
        <VolumeSlider label="Effects" value={effects} onChange={setEffects} />
      </div>
    </div>
  );
}
