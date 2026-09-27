import type { ReactNode } from 'react';

const PINK = '#ff66b3';
const CYAN = '#4fd1e8';
const BLUE = '#5da3ee';

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet">
      <rect width="120" height="72" fill="#0b1119" />
      {[24, 48, 72, 96].map((x) => (
        <line key={`x${x}`} x1={x} y1="0" x2={x} y2="72" stroke="#ffffff0d" />
      ))}
      {[24, 48].map((y) => (
        <line key={`y${y}`} x1="0" y1={y} x2="120" y2={y} stroke="#ffffff0d" />
      ))}
      {children}
    </svg>
  );
}

function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="5.5" fill={BLUE} stroke="#fff" strokeWidth="1.5" />
      <circle cx={x} cy={y} r="1.4" fill="#fff" />
    </g>
  );
}

function HitCircle({
  x,
  y,
  n,
  color = PINK,
  opacity = 1,
}: {
  x: number;
  y: number;
  n?: string;
  color?: string;
  opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      <circle cx={x} cy={y} r="10" fill={color} fillOpacity="0.75" stroke="#fff" strokeWidth="2" />
      <circle cx={x} cy={y} r="7" fill="#10141b" fillOpacity="0.72" />
      {n && (
        <text x={x} y={y + 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#fff">
          {n}
        </text>
      )}
    </g>
  );
}

// A straight slider whose end stretch is painted like the "slider end windows" filter draws it.
function SliderEndSample({ y, tone, inner, label }: { y: number; tone: string; inner: string; label: string }) {
  return (
    <g>
      <line x1="12" y1={y} x2="84" y2={y} stroke={PINK} strokeWidth="16" strokeLinecap="round" strokeOpacity="0.85" />
      <line x1="12" y1={y} x2="84" y2={y} stroke="#10141b" strokeWidth="12" strokeLinecap="round" />
      <line x1="64" y1={y} x2="84" y2={y} stroke={tone} strokeWidth="16" />
      <circle cx="84" cy={y} r="8" fill={tone} />
      <line x1="64" y1={y} x2="84" y2={y} stroke={inner} strokeWidth="10" />
      <circle cx="84" cy={y} r="5" fill={inner} />
      <line x1="64" y1={y - 8} x2="64" y2={y + 8} stroke={tone} strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy={y} r="6" fill={PINK} stroke="#fff" strokeWidth="1.5" />
      <text x="96" y={y + 3} fontSize="7.5" fontWeight="700" fill={tone}>
        {label}
      </text>
    </g>
  );
}

const path = 'M8 58 C 26 20, 44 18, 60 36 S 96 58, 112 14';

export const optionPreviews = {
  pastTrail: (
    <Frame>
      <path d="M8 58 C 26 20, 44 18, 60 36" fill="none" stroke="#c5ccd4" strokeOpacity="0.8" strokeWidth="1.6" />
      <path d="M60 36 S 96 58, 112 14" fill="none" stroke="#ffffff18" strokeWidth="1.2" strokeDasharray="3 3" />
      <Cursor x={60} y={36} />
    </Frame>
  ),
  futureTrail: (
    <Frame>
      <path d="M8 58 C 26 20, 44 18, 60 36" fill="none" stroke="#ffffff18" strokeWidth="1.2" strokeDasharray="3 3" />
      <path d="M60 36 S 96 58, 112 14" fill="none" stroke="#fff" strokeWidth="1.6" />
      <Cursor x={60} y={36} />
    </Frame>
  ),
  inputPaths: (
    <Frame>
      <path d={path} fill="none" stroke="#c5ccd455" strokeWidth="1.2" />
      <path d="M8 58 C 26 20, 44 18, 60 36" fill="none" stroke={PINK} strokeWidth="4" strokeLinecap="round" />
      <path d="M60 36 S 86 52, 96 40" fill="none" stroke={CYAN} strokeWidth="4" strokeLinecap="round" />
      <Cursor x={96} y={40} />
    </Frame>
  ),
  clickMarkers: (
    <Frame>
      <path d={path} fill="none" stroke="#c5ccd4aa" strokeWidth="1.4" />
      <circle cx="30" cy="30" r="5" fill="#fff" stroke={PINK} strokeWidth="2" />
      <circle cx="60" cy="36" r="5" fill={PINK} stroke="#fff" strokeWidth="1.6" />
      <circle cx="86" cy="49" r="5" fill="#fff" stroke={CYAN} strokeWidth="2" />
      <circle cx="106" cy="26" r="5" fill={CYAN} stroke="#fff" strokeWidth="1.6" />
    </Frame>
  ),
  wireframe: (
    <Frame>
      <path d="M24 50 Q 60 8, 96 44" fill="none" stroke={PINK} strokeWidth="2" />
      <circle cx="24" cy="50" r="10" fill="none" stroke={PINK} strokeWidth="2" />
      <circle cx="96" cy="44" r="4" fill="none" stroke={PINK} strokeWidth="1.6" />
      <circle cx="60" cy="54" r="10" fill="none" stroke={CYAN} strokeWidth="2" />
    </Frame>
  ),
  fadeAfterClick: (
    <Frame>
      <HitCircle x={26} y={40} n="1" opacity={0.18} />
      <HitCircle x={60} y={34} n="2" opacity={0.5} />
      <HitCircle x={94} y={40} n="3" />
      <circle cx="94" cy="40" r="16" fill="none" stroke={PINK} strokeWidth="1.5" />
      <Cursor x={60} y={34} />
    </Frame>
  ),
  judgements: (
    <Frame>
      <HitCircle x={24} y={44} opacity={0.35} />
      <text x="24" y="24" textAnchor="middle" fontSize="11" fontWeight="900" fill="#60cf8b">
        100
      </text>
      <HitCircle x={60} y={44} opacity={0.35} />
      <text x="60" y="24" textAnchor="middle" fontSize="11" fontWeight="900" fill="#f0c65c">
        50
      </text>
      <HitCircle x={96} y={44} opacity={0.35} />
      <text x="96" y="25" textAnchor="middle" fontSize="15" fontWeight="900" fill="#ff596a">
        ×
      </text>
    </Frame>
  ),
  sliderEnds: (
    <Frame>
      <SliderEndSample y={22} tone="#ffd166" inner="#5b5540" label="stable" />
      <SliderEndSample y={52} tone="#5fe3ff" inner="#2b4f5c" label="lazer" />
    </Frame>
  ),
  frameMarkers: (
    <Frame>
      <path d="M14 50 C36 44 52 26 70 24 S96 30 108 18" fill="none" stroke="#c5ccd4" strokeWidth="1.4" opacity="0.7" />
      {[
        [14, 50],
        [30, 46],
        [45, 36],
        [58, 27],
        [72, 24],
        [86, 26],
        [98, 24],
        [108, 18],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} stroke={PINK} strokeWidth="1.6" strokeLinecap="round">
          <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} />
          <line x1={x + 3} y1={y - 3} x2={x - 3} y2={y + 3} />
        </g>
      ))}
    </Frame>
  ),
  speedHeatmap: (
    <Frame>
      <defs>
        <linearGradient id="speed-heatmap-preview" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3a5bff" />
          <stop offset="0.3" stopColor="#2fc8f0" />
          <stop offset="0.5" stopColor="#3ee07a" />
          <stop offset="0.72" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#ff3b4e" />
        </linearGradient>
      </defs>
      <path
        d="M12 52 C30 50 36 44 46 40 S70 22 108 16"
        fill="none"
        stroke="url(#speed-heatmap-preview)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <text x="12" y="66" fontSize="7" fill="#7f95ab">
        slow
      </text>
      <text x="108" y="66" fontSize="7" fill="#7f95ab" textAnchor="end">
        fast
      </text>
    </Frame>
  ),
  sliderTracking: (
    <Frame>
      <path d="M18 46 Q60 8 102 46" fill="none" stroke="#fff" strokeWidth="21" strokeLinecap="round" />
      <path d="M18 46 Q60 8 102 46" fill="none" stroke={PINK} strokeWidth="18" strokeLinecap="round" />
      <path d="M18 46 Q60 8 102 46" fill="none" stroke="#11151c" strokeWidth="15" strokeLinecap="round" />
      <path
        d="M52 28 Q63 24 76 29"
        fill="none"
        stroke="#ff4d5e"
        strokeWidth="15"
        strokeLinecap="round"
        opacity="0.65"
      />
      <circle cx="88" cy="36" r="17" fill="#ff4d5e1f" stroke="#ff4d5e" strokeWidth="1.2" />
      <circle cx="88" cy="36" r="4" fill="#fff" />
      <Cursor x={104} y={16} />
    </Frame>
  ),
  hiddenFade: (
    <Frame>
      <HitCircle x={24} y={38} n="1" opacity={0.12} />
      <HitCircle x={52} y={38} n="2" opacity={0.4} />
      <HitCircle x={80} y={38} n="3" opacity={0.75} />
      <HitCircle x={106} y={38} n="4" />
      <text x="60" y="66" textAnchor="middle" fontSize="7" fill="#8196aa">
        HD
      </text>
    </Frame>
  ),
};
