import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

// ── Types ────────────────────────────────────────────────────────

type WidgetMode = 'weather' | 'clocks' | 'news';

interface WeatherDay {
  date: string;
  code: number;
  max: number;
  min: number;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
}

// ── Weather helpers (copied from Tasks.tsx) ──────────────────────

function getWeatherIcon(code: number, size = 'w-4 h-4'): JSX.Element {
  if (code === 0) return (
    <svg className={`${size} text-yellow-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
  if (code <= 3) return (
    <svg className={size} viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3" fill="#facc15" />
      <path d="M8 14a4 4 0 014-4h2a4 4 0 110 8H12a4 4 0 01-4-4z" fill="#9ca3af" />
    </svg>
  );
  if (code <= 48) return (
    <svg className={`${size} text-gray-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 12h16M4 8h12M6 16h14" strokeLinecap="round" />
    </svg>
  );
  if (code <= 67 || (code >= 80 && code <= 82)) return (
    <svg className={`${size} text-blue-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#9ca3af" stroke="none" />
      <path d="M8 16v3M12 15v3M16 16v3" strokeLinecap="round" />
    </svg>
  );
  if (code <= 77 || (code >= 85 && code <= 86)) return (
    <svg className={`${size} text-blue-200`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#d1d5db" stroke="none" />
      <circle cx="9" cy="17" r="1" fill="currentColor" /><circle cx="15" cy="17" r="1" fill="currentColor" /><circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
  return (
    <svg className={`${size} text-yellow-500`} viewBox="0 0 24 24" fill="none">
      <path d="M8 4a5 5 0 019.5 2H19a3 3 0 010 6H6a4 4 0 010-8z" fill="#6b7280" />
      <path d="M13 13l-2 5h3l-2 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── World clock config ───────────────────────────────────────────

const WORLD_CLOCKS = [
  { label: 'London',    tz: 'Europe/London' },
  { label: 'New York',  tz: 'America/New_York' },
  { label: 'Dubai',     tz: 'Asia/Dubai' },
  { label: 'Singapore', tz: 'Asia/Singapore' },
  { label: 'Tokyo',     tz: 'Asia/Tokyo' },
  { label: 'Sydney',    tz: 'Australia/Sydney' },
];

function clockTime(tz: string): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
}

function clockDay(tz: string): string {
  const d = new Date().toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short' });
  // Compare with local day to show +1/-1 indicator
  const tzDate = new Date().toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
  const localDate = new Date().toLocaleDateString('en-CA');
  const diff = (new Date(tzDate).getTime() - new Date(localDate).getTime()) / 86400000;
  if (diff > 0) return `${d} +1`;
  if (diff < 0) return `${d} -1`;
  return d;
}

// ── Sub-components ───────────────────────────────────────────────

function WeatherWidget({ lat, lon, unit }: { lat: number; lon: number; unit: string }) {
  const [days, setDays] = useState<WeatherDay[]>([]);

  useEffect(() => {
    const u = unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=${u}&timezone=auto&forecast_days=7`
    )
      .then(r => r.json())
      .then(data => {
        const d = data.daily;
        const result: WeatherDay[] = d.time.map((date: string, i: number) => ({
          date,
          code: d.weather_code[i],
          max: Math.round(d.temperature_2m_max[i]),
          min: Math.round(d.temperature_2m_min[i]),
        }));
        setDays(result);
      })
      .catch(() => {});
  }, [lat, lon, unit]);

  const deg = unit === 'fahrenheit' ? '°F' : '°C';

  if (days.length === 0) return (
    <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">Loading…</div>
  );

  return (
    <div className="grid grid-cols-7 gap-0.5 px-2 py-1.5 h-full items-end">
      {days.map((day, i) => {
        const dow = DAY_NAMES[new Date(day.date + 'T12:00:00').getDay()];
        return (
          <div key={day.date} className="flex flex-col items-center gap-0.5">
            <span className={`text-[9px] font-medium ${i === 0 ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {i === 0 ? 'Today' : dow}
            </span>
            {getWeatherIcon(day.code, 'w-4 h-4')}
            <span className="text-[9px] font-semibold text-gray-700 dark:text-gray-200">{day.max}{deg}</span>
            <span className="text-[9px] text-gray-400 dark:text-gray-500">{day.min}{deg}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClocksWidget() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-1.5 h-full content-center">
      {WORLD_CLOCKS.map(c => (
        <div key={c.tz} className="flex items-baseline justify-between">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate mr-1">{c.label}</span>
          <div className="flex items-baseline gap-0.5 shrink-0">
            <span className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-200">{clockTime(c.tz)}</span>
            <span className="text-[9px] text-gray-400 dark:text-gray-500">{clockDay(c.tz)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsWidget() {
  const [items, setItems] = useState<NewsItem[]>([]);

  useEffect(() => {
    // BBC World News RSS via rss2json (free, no key for limited use)
    fetch('https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Ffeeds.bbci.co.uk%2Fnews%2Fworld%2Frss.xml&count=6')
      .then(r => r.json())
      .then(data => {
        if (data.items) setItems(data.items.slice(0, 6));
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return (
    <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">Loading…</div>
  );

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 h-full overflow-hidden">
      {items.map((item, i) => (
        <a
          key={i}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] leading-tight text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 transition-colors"
        >
          {item.title}
        </a>
      ))}
    </div>
  );
}

// ── Main widget ──────────────────────────────────────────────────

const MODES: WidgetMode[] = ['weather', 'clocks', 'news'];
const MODE_LABELS: Record<WidgetMode, string> = { weather: '7-day forecast', clocks: 'World clocks', news: 'Headlines' };
const ROTATE_MS = 8000;

export default function PanelWidget() {
  const [mode, setMode] = useState<WidgetMode>('weather');
  const [modeIdx, setModeIdx] = useState(0);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);
  const [tempUnit, setTempUnit] = useState('celsius');
  const [hasLocation, setHasLocation] = useState(false);

  // Fetch user settings once
  useEffect(() => {
    api.getMe().then((u: any) => {
      if (u.weather_latitude != null && u.weather_longitude != null) {
        setUserLat(u.weather_latitude);
        setUserLon(u.weather_longitude);
        setHasLocation(true);
      }
      setTempUnit(u.temperature_unit || 'celsius');
    }).catch(() => {});
  }, []);

  // Auto-rotate
  useEffect(() => {
    const t = setInterval(() => {
      setModeIdx(prev => {
        const next = (prev + 1) % MODES.length;
        setMode(MODES[next]);
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  const handleDotClick = useCallback((i: number) => {
    setModeIdx(i);
    setMode(MODES[i]);
  }, []);

  const effectiveMode: WidgetMode = (mode === 'weather' && !hasLocation) ? 'clocks' : mode;

  return (
    <div className="shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40" style={{ height: '90px' }}>
      {/* Label + dots */}
      <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5">
        <span className="text-[9px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500">
          {MODE_LABELS[effectiveMode]}
        </span>
        <div className="flex gap-1">
          {MODES.map((m, i) => (
            (m !== 'weather' || hasLocation) && (
              <button
                key={m}
                onClick={() => handleDotClick(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  modeIdx === i ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
                }`}
              />
            )
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ height: '68px' }}>
        {effectiveMode === 'weather' && hasLocation && (
          <WeatherWidget lat={userLat!} lon={userLon!} unit={tempUnit} />
        )}
        {effectiveMode === 'clocks' && <ClocksWidget />}
        {effectiveMode === 'news' && <NewsWidget />}
      </div>
    </div>
  );
}
