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
