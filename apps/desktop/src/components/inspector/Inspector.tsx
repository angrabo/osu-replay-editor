import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { TabButton } from '../common/TabButton';
import { Field } from '../common/Field';
import { ReplayMetadataEditor } from '../../ReplayMetadataEditor';
import { formatTime, logicalKeys, nearestReplayFrameTime, useEditorStore } from '../../stores/editor';
import { formatAccuracy } from '../../utils/formatAccuracy';
import { CursorTimingControl } from './CursorTimingControl';
import { InfoTip } from '../InfoTip';
import { PanelCloseButton } from '../common/PanelCloseButton';

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="inspector-section">
      <button
        className="inspector-section-heading"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{title}</span>
      </button>
      {open && <div className="inspector-section-content">{children}</div>}
    </section>
  );
}

export function Inspector() {
  const tab = useEditorStore((state) => state.inspectorTab);
  const setTab = useEditorStore((state) => state.setInspectorTab);
  const previewId = useEditorStore((state) => state.previewTrackId);
  const track = useEditorStore((state) => state.tracks.find((item) => item.id === previewId));
  const playhead = useEditorStore((state) => state.playheadMs);
  const selectedCursorFrameMs = useEditorStore((state) => state.selectedCursorFrameMs);
  const setCursorFramePosition = useEditorStore((state) => state.setCursorFramePosition);
  const moveCursorFrameTime = useEditorStore((state) => state.moveCursorFrameTime);
  const frames = track?.replay.frames;
  const frameTime = frames?.length ? nearestReplayFrameTime(frames, selectedCursorFrameMs ?? playhead) : null;
  const frame = frames?.find((item) => item.timeMs === frameTime);
  const frameIndex = frames?.findIndex((item) => item.timeMs === frameTime) ?? -1;
  const simulationState = useEditorStore((state) => (previewId ? state.simulationByTrack[previewId] : undefined));
  const simulation = simulationState?.result?.status === 'unsupported' ? null : simulationState?.result;
  const nearestJudgement = simulation?.judgements.length
    ? simulation.judgements.reduce((nearest, judgement) =>
        Math.abs(judgement.startTime - playhead) < Math.abs(nearest.startTime - playhead) ? judgement : nearest,
      )
    : undefined;

  return (
    <section className="panel inspector-panel">
      <div className="tabs">
        <TabButton active={tab === 'inspector'} onClick={() => setTab('inspector')}>
          Inspector
        </TabButton>
        <TabButton active={tab === 'mods'} onClick={() => setTab('mods')}>
          Mods
        </TabButton>
        <TabButton active={tab === 'metadata'} onClick={() => setTab('metadata')}>
          Metadata
        </TabButton>
        <PanelCloseButton panel="inspector" className="in-tabs" />
      </div>
      {tab === 'inspector' && (
        <div className="inspector-body">
          <InspectorSection title={selectedCursorFrameMs === null ? 'Replay Frame (nearest)' : 'Selected Cursor Frame'}>
            {track && frame ? (
              <>
                <Field label="Replay" value={track.name} />
                <Field label="Time" value={`${formatTime(frame.timeMs)} (${frame.timeMs} ms)`} />
                <label className="field-row">
                  <span>X</span>
                  <input
                    className="field-value cursor-coordinate"
                    aria-label="Cursor X"
                    type="number"
                    step="0.1"
                    key={`${track.id}-${frame.timeMs}-x-${frame.x}`}
                    defaultValue={frame.x.toFixed(1)}
                    disabled={track.locked}
                    onBlur={(event) =>
                      setCursorFramePosition(track.id, frame.timeMs, Number(event.target.value), frame.y)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                <label className="field-row">
                  <span>Y</span>
                  <input
                    className="field-value cursor-coordinate"
                    aria-label="Cursor Y"
                    type="number"
                    step="0.1"
                    key={`${track.id}-${frame.timeMs}-y-${frame.y}`}
                    defaultValue={frame.y.toFixed(1)}
                    disabled={track.locked}
                    onBlur={(event) =>
                      setCursorFramePosition(track.id, frame.timeMs, frame.x, Number(event.target.value))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                {selectedCursorFrameMs !== null && (
                  <CursorTimingControl
                    key={`${track.id}-${frame.timeMs}`}
                    frame={frame}
                    before={frames?.[frameIndex - 1]}
                    after={frames?.[frameIndex + 1]}
                    locked={track.locked}
                    onCommit={(timeMs) => moveCursorFrameTime(track.id, frame.timeMs, timeMs)}
                  />
                )}
                <Field
                  label="Keys"
                  value={
                    ['M1', 'M2', 'K1', 'K2']
                      .filter((_, index) => (logicalKeys(frame.keys) & (1 << index)) !== 0)
                      .join(' + ') || 'none'
                  }
                />
                <Field label="Mods" value={String(track.exportMetadata.mods)} />
              </>
            ) : (
              <p className="sample-note">
                No replay
                <InfoTip text="Import a replay and choose its preview track." />
              </p>
            )}
          </InspectorSection>

          {track && (
            <InspectorSection title="Simulation result">
              {simulation ? (
                <>
                  <div className="simulation-result-grid">
                    <Field label="Score" value={simulation.score.toLocaleString('en-US')} />
                    <Field label="Accuracy" value={`${formatAccuracy(simulation)}%`} positive />
                    <Field
                      label="300 / 100 / 50"
                      value={`${simulation.count300} / ${simulation.count100} / ${simulation.count50}`}
                    />
                    <Field label="Misses" value={String(simulation.misses)} />
                    <Field label="Max combo" value={`${simulation.maxCombo}x`} />
                    <Field label="Ending combo" value={`${simulation.achievedCombo}x`} />
                    <Field label="Objects" value={`${simulation.judgements.length} / ${simulation.totalObjects}`} />
                    {simulation.sliderTicksTotal > 0 && (
                      <Field
                        label="Slider ticks"
                        value={`${simulation.sliderTicksHit} / ${simulation.sliderTicksTotal}`}
                      />
                    )}
                    {simulation.sliderEndsTotal > 0 && (
                      <Field
                        label="Slider ends"
                        value={`${simulation.sliderEndsHit} / ${simulation.sliderEndsTotal}`}
                      />
                    )}
                    {simulation.spinnerSpinsTotal > 0 && (
                      <>
                        <Field
                          label="Spinner spins"
                          value={`${simulation.spinnerSpinsHit} / ${simulation.spinnerSpinsTotal}`}
                        />
                        <Field
                          label="Spinner bonus"
                          value={`${simulation.spinnerBonusHit} / ${simulation.spinnerBonusTotal}`}
                        />
                        <Field label="Bonus score" value={simulation.bonusScore.toLocaleString('en-US')} />
                      </>
                    )}
                    <Field label="Client" value={simulation.client} />
                    <Field label="Model" value={simulation.model} />
                  </div>
                  {nearestJudgement && (
                    <div className={`judgement-detail result-${nearestJudgement.result}`}>
                      <strong>Nearest: {nearestJudgement.result}</strong>
                      <span>
                        {nearestJudgement.kind} #{nearestJudgement.objectIndex + 1} ·{' '}
                        {nearestJudgement.hitError === null
                          ? 'no hit'
                          : `${nearestJudgement.hitError > 0 ? '+' : ''}${nearestJudgement.hitError.toFixed(1)} ms`}{' '}
                        · {nearestJudgement.key ?? 'no key'}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className={`sample-note${simulationState?.status === 'error' ? ' simulation-error' : ''}`}>
                  {simulationState?.status === 'running'
                    ? 'Updating…'
                    : simulationState?.status === 'error'
                      ? simulationState.error
                      : 'Waiting for the beatmap.'}
                </p>
              )}
            </InspectorSection>
          )}
        </div>
      )}
      {tab === 'mods' && (
        <div className="inspector-body">
          <ReplayMetadataEditor track={track} simulation={simulation} section="mods" />
        </div>
      )}
      {tab === 'metadata' && (
        <div className="inspector-body">
          <ReplayMetadataEditor track={track} simulation={simulation} section="metadata" />
        </div>
      )}
    </section>
  );
}
