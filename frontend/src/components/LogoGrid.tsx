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
  'custom-theme': [
    'hsl(0, 100%, 75%)', 'hsl(30, 100%, 75%)', 'hsl(60, 100%, 75%)',
    'hsl(120, 100%, 75%)', 'hsl(180, 100%, 75%)', 'hsl(210, 100%, 75%)',
    'hsl(240, 100%, 75%)', 'hsl(270, 100%, 75%)', 'hsl(300, 100%, 75%)',
  ],
};

const themeStrokes: Record<AppThemeName, string> = {
  default: 'white',
  academia: '#fffff8',
  'custom-theme': 'white',
};

const GRID_POSITIONS = [
  [0, 0], [100, 0], [200, 0],
  [0, 100], [100, 100], [200, 100],
  [0, 200], [100, 200], [200, 200],
] as const;

interface LogoGridProps {
  theme?: AppThemeName;
  size?: number;
  className?: string;
}

export default function LogoGrid({ theme = 'default', size = 64, className }: LogoGridProps) {
  const colors = themeColors[theme] || themeColors.default;
  const stroke = themeStrokes[theme] || themeStrokes.default;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 300 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? 'flex-shrink-0'}
    >
      {GRID_POSITIONS.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={100} height={100} fill={colors[i]} stroke={stroke} strokeWidth={2} />
      ))}
    </svg>
  );
}
