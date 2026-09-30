import { replayPointAt } from '@ore/beatmap-viewer';
import { ChevronLeft, ChevronRight, Crosshair, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMissAnalysis } from '../../missAnalysis';
import { formatTime, useEditorStore } from '../../stores/editor';
import { HitErrorBar } from '../../timeline/HitObjectHover';

const soundNames = ['normal', 'whistle', 'finish', 'clap'] as const;
const sampleNames = ['map default', 'normal', 'soft', 'drum'];
const curveNames: Record<string, string> = { B: 'Bézier', C: 'Catmull', L: 'Linear', P: 'Perfect circle' };
const fmt = (value: number, digits = 1) => Number(value.toFixed(digits)).toLocaleString('en-US');
const time = (value: number) => `${formatTime(value)} (${fmt(value, 0)} ms)`;

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="object-detail-field">
      <dt>{label}</dt>
      <dd>{value ?? 'Unavailable'}</dd>
    </div>
  );
}

export function ObjectDetailsDialog({
  index,
  onIndexChange,
  onClose,
}: {
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const objects = useEditorStore((state) => state.beatmapObjects);
  const tracks = useEditorStore((state) => state.tracks);
  const previewTrackId = useEditorStore((state) => state.previewTrackId);
  const simulation = useEditorStore((state) =>
    state.previewTrackId ? state.simulationByTrack[state.previewTrackId]?.result : null,
  );
  const windows = useEditorStore((state) => state.hitWindows);
  const radius = useEditorStore((state) => state.circleRadius);
  const sliderBreaks = useEditorStore((state) => state.sliderBreaks);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const selectObject = useEditorStore((state) => state.selectBeatmapObject);
  const focusTimeline = useEditorStore((state) => state.requestTimelineFocus);
  const misses = useMissAnalysis();
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const object = objects[index];
  const track = tracks.find((item) => item.id === previewTrackId);
  const judgement = simulation?.judgements.find((item) => item.objectIndex === index);
  const breakInfo = sliderBreaks.find((item) => item.objectIndex === index);
  const miss = misses?.find((item) => item.objectIndex === index);
  const hardRock = !!track && (track.exportMetadata.mods & 16) !== 0;
  const centre = object ? { x: object.x, y: hardRock ? 384 - object.y : object.y } : null;
  const cursorTime = judgement?.hitTime ?? object?.startTime ?? 0;
  const cursor = track ? replayPointAt(track.replay.frames, cursorTime) : null;
  const distance = cursor && centre ? Math.hypot(cursor.x - centre.x, cursor.y - centre.y) : null;
  const nearbyFrames =
    track && object
      ? track.replay.frames
          .filter((frame) => Math.abs(frame.timeMs - object.startTime) <= 100)
          .sort((a, b) => Math.abs(a.timeMs - object.startTime) - Math.abs(b.timeMs - object.startTime))
          .slice(0, 12)
          .sort((a, b) => a.timeMs - b.timeMs)
      : [];
  const nearbyKeys =
    track && object
      ? track.replay.keyEvents.filter((event) => Math.abs(event.timeMs - object.startTime) <= 200).slice(0, 16)
      : [];
  const path = object?.slider?.path;
  const hitSounds =
    object?.hitSound === undefined
      ? null
      : soundNames.filter((_, bit) => bit === 0 || !!(object.hitSound! & (1 << bit))).join(' + ');

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCallback.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!object) return null;
  return createPortal(
    <div
      className="object-details-backdrop"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="object-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${object.kind} ${index + 1}`}
      >
        <header className="object-details-header">
          <div>
            <small>
              HIT OBJECT · {index + 1} / {objects.length}
            </small>
            <h2>
              {object.kind} #{index + 1}
            </h2>
          </div>
          <div className="object-details-header-actions">
            <button
              type="button"
              title="Previous object"
              disabled={index === 0}
              onClick={() => onIndexChange(index - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              title="Next object"
              disabled={index === objects.length - 1}
              onClick={() => onIndexChange(index + 1)}
            >
              <ChevronRight size={18} />
            </button>
            <button ref={closeRef} type="button" title="Close details" aria-label="Close details" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="object-details-body">
          <div className="object-details-hero">
            <svg viewBox="0 0 512 384" role="img" aria-label="Object and replay cursor around its hit time">
              <rect width="512" height="384" fill="#0a111b" />
              {[128, 256, 384].map((x) => (
                <line key={`x${x}`} x1={x} x2={x} y1="0" y2="384" stroke="#29394b" />
              ))}
              {[96, 192, 288].map((y) => (
                <line key={`y${y}`} x1="0" x2="512" y1={y} y2={y} stroke="#29394b" />
              ))}
              {path && (
                <polyline
                  points={path.map((point) => `${point.x},${hardRock ? 384 - point.y : point.y}`).join(' ')}
                  fill="none"
                  stroke="#b985f5"
                  strokeWidth="5"
                  opacity=".65"
                />
              )}
              {track && (
                <polyline
                  points={track.replay.frames
                    .filter((frame) => Math.abs(frame.timeMs - object.startTime) <= 200)
                    .map((frame) => `${frame.x},${frame.y}`)
                    .join(' ')}
                  fill="none"
                  stroke="#54b8ff"
                  strokeWidth="2"
                  opacity=".85"
                />
              )}
              {object.kind === 'spinner' ? (
                <circle cx="256" cy="192" r="90" fill="none" stroke="#b985f5" strokeWidth="4" />
              ) : (
                <circle
                  cx={centre!.x}
                  cy={centre!.y}
                  r={radius ?? 30}
                  fill="#a385f522"
                  stroke="#b985f5"
                  strokeWidth="3"
                />
              )}
              {cursor && (
                <>
                  <line
                    x1={centre!.x}
                    y1={centre!.y}
                    x2={cursor.x}
                    y2={cursor.y}
                    stroke="#ffcb77"
                    strokeDasharray="4 4"
                  />
                  <circle cx={cursor.x} cy={cursor.y} r="7" fill="#54b8ff" stroke="white" strokeWidth="2" />
                </>
              )}
            </svg>
            <div className="object-details-hero-caption">
              <span>Map object</span>
              <span>Replay path ±200 ms</span>
              <span>Cursor at {judgement?.hitTime != null ? 'judged hit' : 'object time'}</span>
            </div>
          </div>
          <div className="object-details-sections">
            <section>
              <h3>Map object</h3>
              <dl>
                <Detail label="Start" value={time(object.startTime)} />
                <Detail label="End" value={time(object.endTime)} />
                <Detail label="Duration" value={`${fmt(object.endTime - object.startTime, 0)} ms`} />
                <Detail label="Map position" value={`${fmt(object.x)} / ${fmt(object.y)}`} />
                <Detail
                  label="Displayed position"
                  value={
                    hardRock
                      ? `${fmt(object.x)} / ${fmt(384 - object.y)} (Hard Rock)`
                      : `${fmt(object.x)} / ${fmt(object.y)}`
                  }
                />
                <Detail
                  label="Combo"
                  value={
                    object.comboIndex === undefined
                      ? null
                      : `#${object.comboIndex + 1}, number ${object.comboNumber}${object.newCombo ? ' · new combo' : ''}`
                  }
                />
                <Detail
                  label="Gap from previous"
                  value={index ? `${fmt(object.startTime - objects[index - 1].startTime, 0)} ms` : 'First object'}
                />
                <Detail
                  label="Gap to next"
                  value={
                    index < objects.length - 1
                      ? `${fmt(objects[index + 1].startTime - object.startTime, 0)} ms`
                      : 'Last object'
                  }
                />
              </dl>
            </section>
            <section>
              <h3>Replay · {track?.name ?? 'none selected'}</h3>
              <dl>
                <Detail label="Judgement" value={judgement?.result?.toUpperCase() ?? 'No simulation result'} />
                <Detail label="Hit time" value={judgement?.hitTime == null ? null : time(judgement.hitTime)} />
                <Detail
                  label="Hit error"
                  value={
                    judgement?.hitError == null
                      ? null
                      : `${judgement.hitError > 0 ? '+' : ''}${fmt(judgement.hitError)} ms`
                  }
                />
                <Detail label="Input" value={judgement?.key ?? null} />
                <Detail label="Cursor at hit" value={cursor ? `${fmt(cursor.x)} / ${fmt(cursor.y)}` : null} />
                <Detail
                  label="Aim distance"
                  value={
                    distance == null
                      ? null
                      : `${fmt(distance)} px${radius == null ? '' : distance <= radius ? ' · inside circle' : ' · outside circle'}`
                  }
                />
                <Detail label="Combo after" value={judgement?.comboAfter} />
                <Detail label="Score after" value={judgement?.scoreAfter?.toLocaleString('en-US')} />
              </dl>
              {windows && object.kind !== 'spinner' && (
                <HitErrorBar windows={windows} hitError={judgement?.hitError ?? null} />
              )}
              {miss && (
                <p className="object-details-alert">
                  <b>{miss.cause.summary}</b>
                  <br />
                  {miss.cause.detail}
                </p>
              )}
            </section>
            {object.slider && (
              <section>
                <h3>Slider</h3>
                <dl>
                  <Detail label="Curve" value={curveNames[object.slider.curveType] ?? object.slider.curveType} />
                  <Detail label="Repeats" value={object.slider.repeats} />
                  <Detail label="Length" value={`${fmt(object.slider.pixelLength)} px`} />
                  <Detail label="Span duration" value={`${fmt(object.slider.spanDuration)} ms`} />
                  <Detail label="Tick distance" value={`${fmt(object.slider.tickDistance)} px`} />
                  <Detail label="Path samples" value={object.slider.path.length} />
                  <Detail label="Edge sounds" value={object.slider.edgeSounds.join(' / ')} />
                  <Detail label="Edge sets" value={object.slider.edgeSets.map((pair) => pair.join(':')).join(' / ')} />
                  <Detail label="Missed checks" value={breakInfo?.missedChecks.length ?? 0} />
                  <Detail
                    label="Tracking loss"
                    value={
                      breakInfo?.lost.length
                        ? breakInfo.lost.map((item) => `${fmt(item.startMs, 0)}–${fmt(item.endMs, 0)} ms`).join(', ')
                        : 'None detected'
                    }
                  />
                </dl>
              </section>
            )}
            <section>
              <h3>Timing & sound</h3>
              <dl>
                <Detail label="BPM" value={object.timing?.bpm == null ? null : fmt(object.timing.bpm, 2)} />
                <Detail
                  label="Slider velocity"
                  value={object.timing?.sliderVelocity == null ? null : `${fmt(object.timing.sliderVelocity, 2)}×`}
                />
                <Detail
                  label="Timing sample set"
                  value={object.timing ? (sampleNames[object.timing.sampleSet] ?? object.timing.sampleSet) : null}
                />
                <Detail label="Timing volume" value={object.timing ? `${object.timing.volume}%` : null} />
                <Detail label="Hitsound" value={hitSounds} />
                <Detail
                  label="Object sample set"
                  value={
                    object.hitSample ? (sampleNames[object.hitSample.normalSet] ?? object.hitSample.normalSet) : null
                  }
                />
                <Detail
                  label="Addition set"
                  value={
                    object.hitSample
                      ? (sampleNames[object.hitSample.additionSet] ?? object.hitSample.additionSet)
                      : null
                  }
                />
                <Detail
                  label="Sample index / volume"
                  value={
                    object.hitSample
                      ? `${object.hitSample.index || 'inherited'} / ${object.hitSample.volume || 'inherited'}`
                      : null
                  }
                />
                <Detail label="Custom sample" value={object.hitSample?.filename || 'None'} />
              </dl>
            </section>
            <section className="object-details-wide">
              <h3>Nearby replay data</h3>
              <div className="object-details-nearby">
                <div>
                  <h4>Frames · ±100 ms</h4>
                  {nearbyFrames.length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Offset</th>
                          <th>X</th>
                          <th>Y</th>
                          <th>Keys</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nearbyFrames.map((frame, i) => (
                          <tr key={`${frame.timeMs}-${i}`}>
                            <td>{fmt(frame.timeMs - object.startTime, 0)} ms</td>
                            <td>{fmt(frame.x)}</td>
                            <td>{fmt(frame.y)}</td>
                            <td>{frame.keys}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No frames in this interval.</p>
                  )}
                </div>
                <div>
                  <h4>Key changes · ±200 ms</h4>
                  {nearbyKeys.length ? (
                    <table>
                      <thead>
                        <tr>
                          <th>Offset</th>
                          <th>Key</th>
                          <th>State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nearbyKeys.map((event, i) => (
                          <tr key={`${event.timeMs}-${event.key}-${i}`}>
                            <td>{fmt(event.timeMs - object.startTime, 0)} ms</td>
                            <td>{event.key}</td>
                            <td>{event.down ? 'Press' : 'Release'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No key changes in this interval.</p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
        <footer>
          <button
            type="button"
            onClick={() => {
              selectObject(index);
              setPlayhead(object.startTime);
              focusTimeline();
              onClose();
            }}
          >
            <Crosshair size={15} /> Go to object on timeline
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
