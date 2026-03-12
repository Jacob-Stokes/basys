import { useState, useEffect, useCallback } from 'react';
import type { AppThemeName } from '../context/DisplaySettingsContext';

const themeColors: Record<AppThemeName, string[]> = {
  default: [
    'hsl(0, 100%, 75%)', 'hsl(30, 100%, 75%)', 'hsl(60, 100%, 75%)',
    'hsl(120, 100%, 75%)', 'hsl(180, 100%, 75%)', 'hsl(210, 100%, 75%)',
    'hsl(240, 100%, 75%)', 'hsl(270, 100%, 75%)', 'hsl(300, 100%, 75%)',
  ],
  academia: [
    '#d4c5a9', '#c8b898', '#bfae8a',
    '#b5a47d', '#c2b48f', '#cabf9e',
    '#bfae8a', '#c8b898', '#d4c5a9',
  ],
  'academia-2026': [
    '#c8956a', '#b5784e', '#9e5020',
    '#8b4513', '#a06030', '#cabf9e',
    '#7a9448', '#96ae64', '#c8b898',
  ],
  'custom-theme': [
    'hsl(0, 100%, 75%)', 'hsl(30, 100%, 75%)', 'hsl(60, 100%, 75%)',
    'hsl(120, 100%, 75%)', 'hsl(180, 100%, 75%)', 'hsl(210, 100%, 75%)',
    'hsl(240, 100%, 75%)', 'hsl(270, 100%, 75%)', 'hsl(300, 100%, 75%)',
  ],
};

const themeStrokes: Record<AppThemeName, string> = {
  default: 'white',
  academia: '#fffff8',
  'academia-2026': 'rgba(253,250,244,0.6)',
  'custom-theme': 'white',
};

// Grid positions for each of the 9 cells (index 0-8)
const GRID_POSITIONS: [number, number][] = [
  [0, 0], [100, 0], [200, 0],
  [0, 100], [100, 100], [200, 100],
  [0, 200], [100, 200], [200, 200],
];

// Outer ring indices in clockwise order
// 0(TL) → 1(TC) → 2(TR) → 5(MR) → 8(BR) → 7(BC) → 6(BL) → 3(ML)
const RING_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const CENTER = 4;

interface LogoGridProps {
  theme?: AppThemeName;
  size?: number;
  className?: string;
}

export default function LogoGrid({ theme = 'default', size = 64, className }: LogoGridProps) {
  const colors = themeColors[theme] || themeColors.default;
  const stroke = themeStrokes[theme] || themeStrokes.default;

  // colorMap[i] = which color index is currently at grid position i
  const [colorMap, setColorMap] = useState([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const [animating, setAnimating] = useState(false);
  // progress 0→1 drives the animation
  const [progress, setProgress] = useState(0);

  const startRotation = useCallback(() => {
    if (animating) return;
    setAnimating(true);
    setProgress(0);

    const duration = 1000; // 1 second
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease in-out cubic
      const eased = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      setProgress(eased);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation done — commit the rotation to colorMap
        setColorMap(prev => {
          const next = [...prev];
          // Rotate outer ring: each position gets the color from the previous ring position
          const ringColors = RING_ORDER.map(i => prev[i]);
          // Shift clockwise: last becomes first
          const rotated = [ringColors[ringColors.length - 1], ...ringColors.slice(0, -1)];
          RING_ORDER.forEach((gridIdx, ringIdx) => {
            next[gridIdx] = rotated[ringIdx];
          });
          return next;
        });
        setProgress(0);
        setAnimating(false);
      }
    };

    requestAnimationFrame(animate);
  }, [animating]);

  useEffect(() => {
    const interval = setInterval(startRotation, 2000);
    return () => clearInterval(interval);
  }, [startRotation]);

  // Compute interpolated positions for each grid cell
  const getPosition = (gridIndex: number): [number, number] => {
    if (gridIndex === CENTER || !animating) {
      return GRID_POSITIONS[gridIndex];
    }

    const ringIdx = RING_ORDER.indexOf(gridIndex);
    if (ringIdx === -1) return GRID_POSITIONS[gridIndex];

    // This cell moves to the next clockwise position
    const nextRingIdx = (ringIdx + 1) % RING_ORDER.length;
    const from = GRID_POSITIONS[gridIndex];
    const to = GRID_POSITIONS[RING_ORDER[nextRingIdx]];

    return [
      from[0] + (to[0] - from[0]) * progress,
      from[1] + (to[1] - from[1]) * progress,
    ];
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? 'flex-shrink-0'}
    >
      {GRID_POSITIONS.map((_, i) => {
        const [x, y] = getPosition(i);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={100}
            height={100}
            fill={colors[colorMap[i]]}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      })}
    </svg>
  );
}
