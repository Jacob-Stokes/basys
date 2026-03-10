import { useEffect, useState } from 'react';

export type PixelManState = 'idle' | 'thinking' | 'talking' | 'dancing' | 'wave';

interface Props {
  state: PixelManState;
}

// Each "pixel" = 3×3 CSS px. Character is 10 cols × 16 rows.
const S = 3;
const COLS = 10;
const ROWS = 16;

export default function PixelMan({ state }: Props) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const fps =
      state === 'dancing' ? 8 :
      state === 'talking' ? 7 :
      state === 'thinking' ? 3 :
      state === 'wave' ? 6 : 2;
    const id = setInterval(() => setFrame(f => (f + 1) % 120), 1000 / fps);
    return () => clearInterval(id);
  }, [state]);

  const pixels = buildFrame(state, frame);

  return (
    <svg
      width={COLS * S}
      height={ROWS * S}
      viewBox={`0 0 ${COLS * S} ${ROWS * S}`}
      style={{ imageRendering: 'pixelated' }}
      className="shrink-0"
    >
      {pixels.map(([c, r, color], i) => (
        <rect key={i} x={c * S} y={r * S} width={S} height={S} fill={color} />
      ))}
    </svg>
  );
}

type Px = [number, number, string]; // [col, row, color]

const SK = '#f5c18a'; // skin
const HR = '#2d1a0e'; // hair
const SH = '#1d4ed8'; // shirt (blue)
const PA = '#1e3a5f'; // pants (dark blue)
const BO = '#111827'; // boots
const EY = '#111827'; // eyes
const MO = '#be123c'; // mouth
const TH = '#bfdbfe'; // thought bubble

// ─── Base body parts (col, row) ──────────────────────────────────────────────
// Head rows 0-4, body rows 5-9, legs rows 10-13, feet rows 14-15
// Centered horizontally in 10 cols (cols 2-7)

const HEAD: Px[] = [
  // hair row 0
  [3,0,HR],[4,0,HR],[5,0,HR],[6,0,HR],
  // face row 1-3
  [2,1,SK],[3,1,SK],[4,1,SK],[5,1,SK],[6,1,SK],[7,1,SK],
  [2,2,SK],[3,2,SK],[4,2,SK],[5,2,SK],[6,2,SK],[7,2,SK],
  [2,3,SK],[3,3,SK],[4,3,SK],[5,3,SK],[6,3,SK],[7,3,SK],
  // chin row 4
  [3,4,SK],[4,4,SK],[5,4,SK],[6,4,SK],
];

function eyes(blink: boolean): Px[] {
  if (blink) return [[3,2,HR],[6,2,HR]];
  return [[3,2,EY],[6,2,EY]];
}

function mouth(open: boolean, smile: boolean): Px[] {
  if (open)  return [[4,4,MO],[5,4,MO]];
  if (smile) return [[3,4,MO],[6,4,MO]];
  return [[4,4,EY],[5,4,EY]];
}

const BODY: Px[] = [
  [3,5,SH],[4,5,SH],[5,5,SH],[6,5,SH],
  [3,6,SH],[4,6,SH],[5,6,SH],[6,6,SH],
  [3,7,SH],[4,7,SH],[5,7,SH],[6,7,SH],
  [3,8,SH],[4,8,SH],[5,8,SH],[6,8,SH],
];

// ─── Arms ────────────────────────────────────────────────────────────────────
function armsDown(): Px[] {
  return [
    [2,5,SK],[2,6,SK],[2,7,SK],
    [7,5,SK],[7,6,SK],[7,7,SK],
  ];
}
function leftArmUp(): Px[] {
  return [[1,3,SK],[1,4,SK],[2,5,SK],[2,6,SK]];
}
function rightArmUp(): Px[] {
  return [[8,3,SK],[8,4,SK],[7,5,SK],[7,6,SK]];
}
function armsOut(): Px[] {
  return [
    [1,6,SK],[2,6,SK],[2,7,SK],
    [7,6,SK],[8,6,SK],[8,7,SK],
  ];
}
function leftArmOut(): Px[] {
  return [[1,6,SK],[2,6,SK],[2,7,SK],[7,5,SK],[7,6,SK],[7,7,SK]];
}
function rightArmOut(): Px[] {
  return [[2,5,SK],[2,6,SK],[2,7,SK],[7,6,SK],[8,6,SK],[8,7,SK]];
}

// ─── Legs ─────────────────────────────────────────────────────────────────────
function legsStand(): Px[] {
  return [
    [3,9,PA],[4,9,PA],[5,9,PA],[6,9,PA],
    [3,10,PA],[6,10,PA],
    [3,11,PA],[6,11,PA],
    [3,12,PA],[6,12,PA],
    [2,13,BO],[3,13,BO],[4,13,BO],
    [5,13,BO],[6,13,BO],[7,13,BO],
  ];
}
function legsWalkA(): Px[] {
  return [
    [3,9,PA],[4,9,PA],[5,9,PA],[6,9,PA],
    [2,10,PA],[6,10,PA],
    [2,11,PA],[7,11,PA],
    [2,12,PA],[7,12,PA],
    [1,13,BO],[2,13,BO],[3,13,BO],
    [6,13,BO],[7,13,BO],[8,13,BO],
  ];
}
function legsWalkB(): Px[] {
  return [
    [3,9,PA],[4,9,PA],[5,9,PA],[6,9,PA],
    [3,10,PA],[7,10,PA],
    [4,11,PA],[7,11,PA],
    [4,12,PA],[7,12,PA],
    [3,13,BO],[4,13,BO],[5,13,BO],
    [6,13,BO],[7,13,BO],[8,13,BO],
  ];
}
function legsDanceA(): Px[] {
  return [
    [3,9,PA],[4,9,PA],[5,9,PA],[6,9,PA],
    [2,10,PA],[7,10,PA],
    [1,11,PA],[8,11,PA],
    [1,12,PA],[8,12,PA],
    [0,13,BO],[1,13,BO],[2,13,BO],
    [7,13,BO],[8,13,BO],[9,13,BO],
  ];
}
function legsDanceB(): Px[] {
  return [
    [3,9,PA],[4,9,PA],[5,9,PA],[6,9,PA],
    [3,10,PA],[6,10,PA],
    [3,11,PA],[6,11,PA],
    [4,12,PA],[5,12,PA],
    [3,13,BO],[4,13,BO],[5,13,BO],
    [4,13,BO],[5,13,BO],[6,13,BO],
  ];
}

// ─── Thought dots ─────────────────────────────────────────────────────────────
function thoughtDots(f: number): Px[] {
  const phase = f % 12;
  const p: Px[] = [];
  if (phase > 2)  p.push([7,2,TH],[8,2,TH]);
  if (phase > 5)  p.push([8,1,TH],[9,1,TH]);
  if (phase > 8)  p.push([9,0,TH]);
  return p;
}

// ─── Frame builder ────────────────────────────────────────────────────────────
function buildFrame(state: PixelManState, f: number): Px[] {
  const blink = state === 'idle' && f % 60 > 56;
  const smile = state === 'dancing' || state === 'wave';
  const mouthOpen = state === 'talking' && f % 6 < 3;

  let arms: Px[];
  let legs: Px[];
  const extras: Px[] = [];

  switch (state) {
    case 'thinking':
      arms = leftArmOut();
      legs = legsStand();
      extras.push(...thoughtDots(f));
      break;
    case 'talking':
      arms = f % 4 < 2 ? armsOut() : armsDown();
      legs = f % 8 < 4 ? legsWalkA() : legsWalkB();
      break;
    case 'wave':
      arms = f % 4 < 2 ? [...rightArmUp(), [2,5,SK],[2,6,SK],[2,7,SK]] : [...rightArmOut().slice(3), [2,5,SK],[2,6,SK],[2,7,SK]];
      legs = legsStand();
      break;
    case 'dancing':
      if (f % 8 < 2)      { arms = [...leftArmUp(), [7,5,SK],[7,6,SK],[7,7,SK]]; legs = legsDanceA(); }
      else if (f % 8 < 4) { arms = [[2,5,SK],[2,6,SK],[2,7,SK],...rightArmUp()]; legs = legsDanceB(); }
      else if (f % 8 < 6) { arms = [...leftArmUp(), [7,5,SK],[7,6,SK],[7,7,SK]]; legs = legsDanceA(); }
      else                 { arms = [[2,5,SK],[2,6,SK],[2,7,SK],...rightArmUp()]; legs = legsDanceB(); }
      break;
    default: // idle
      arms = armsDown();
      legs = legsStand();
  }

  return [
    ...HEAD,
    ...eyes(blink),
    ...mouth(mouthOpen, smile),
    ...BODY,
    ...arms,
    ...legs,
    ...extras,
  ];
}
