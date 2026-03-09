'use client';

import React, { memo, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import type { Device } from '@/types';

// Local file in public/ — always available, no CSP / network issues
const GEO_URL = '/countries-110m.json';
// Remote fallbacks in case local serve fails for some reason
const GEO_FALLBACK_URLS = [
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  'https://unpkg.com/world-atlas@2/countries-110m.json',
];

// world-atlas v2 uses ISO 3166-1 numeric codes as `id` — map them to our alpha-3 codes
const numericToAlpha3: Record<string, string> = {
  '643': 'RUS', '840': 'USA', '276': 'DEU', '076': 'BRA', '156': 'CHN',
  '356': 'IND', '398': 'KAZ', '804': 'UKR', '392': 'JPN', '826': 'GBR',
  '036': 'AUS', '792': 'TUR', '616': 'POL', '124': 'CAN', '250': 'FRA',
  '380': 'ITA', '724': 'ESP', '410': 'KOR', '484': 'MEX', '032': 'ARG',
  '710': 'ZAF', '764': 'THA', '360': 'IDN', '704': 'VNM', '818': 'EGY',
  '566': 'NGA', '586': 'PAK', '050': 'BGD', '608': 'PHL', '170': 'COL',
  '152': 'CHL', '604': 'PER', '862': 'VEN', '158': 'TWN', '702': 'SGP',
  '458': 'MYS', '528': 'NLD', '056': 'BEL', '756': 'CHE', '040': 'AUT',
  '203': 'CZE', '642': 'ROU', '348': 'HUN', '752': 'SWE', '578': 'NOR',
  '208': 'DNK', '246': 'FIN', '620': 'PRT', '300': 'GRC',
  '112': 'BLR', '860': 'UZB', '031': 'AZE', '268': 'GEO', '051': 'ARM',
};

interface CountryData {
  name: string;
  total: number;
  online: number;
  offline: number;
  warning: number;
}

interface WorldMapProps {
  devices: Device[];
}

function getCountryColor(count: number, maxCount: number): string {
  if (count === 0) return '#3f3f46'; // zinc-700 — visible against black background
  const intensity = Math.min(count / Math.max(maxCount, 1), 1);
  if (intensity <= 0.15) return '#15803d'; // green-700
  if (intensity <= 0.3) return '#16a34a'; // green-600
  if (intensity <= 0.5) return '#22c55e'; // green-500
  if (intensity <= 0.75) return '#4ade80'; // green-400
  return '#86efac'; // green-300
}

const WorldMap = memo(function WorldMap({ devices }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState<CountryData | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);
  const [geoData, setGeoData] = useState<Record<string, unknown> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  // Pre-fetch topojson with fallback URLs (Electron/CSP can block CDN fetches)
  useEffect(() => {
    let cancelled = false;

    async function fetchGeo() {
      const urls = [GEO_URL, ...GEO_FALLBACK_URLS];
      for (const url of urls) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          const data = await res.json();
          if (!cancelled && data?.type === 'Topology') {
            setGeoData(data);
            setGeoLoading(false);
            return;
          }
        } catch {
          // try next URL
        }
      }
      if (!cancelled) {
        setGeoError(true);
        setGeoLoading(false);
      }
    }

    fetchGeo();
    return () => { cancelled = true; };
  }, []);

  // Native document-level mouse tracker — always accurate, works over SVG
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
      }
    };
    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }, []);

  // Build country stats from devices, keyed by alpha-3
  const countryStats = useMemo(() => {
    const map = new Map<string, CountryData>();
    devices.forEach((d) => {
      if (!d.countryCode) return;
      const existing = map.get(d.countryCode) || {
        name: d.country || d.countryCode,
        total: 0,
        online: 0,
        offline: 0,
        warning: 0,
      };
      existing.total++;
      if (d.status === 'online') existing.online++;
      else if (d.status === 'offline') existing.offline++;
      else if (d.status === 'warning') existing.warning++;
      map.set(d.countryCode, existing);
    });
    return map;
  }, [devices]);

  const maxDevices = useMemo(() => {
    let max = 0;
    countryStats.forEach((v) => { if (v.total > max) max = v.total; });
    return max;
  }, [countryStats]);

  const totalCountries = countryStats.size;

  const handleMouseEnter = useCallback(
    (geoId: string, geoName: string) => {
      const alpha3 = numericToAlpha3[geoId] || '';
      const data = countryStats.get(alpha3);
      if (data) {
        setTooltipContent(data);
      } else {
        setTooltipContent({
          name: geoName || 'Неизвестно',
          total: 0,
          online: 0,
          offline: 0,
          warning: 0,
        });
      }
      // Immediately position tooltip at current mouse pos
      if (tooltipRef.current) {
        tooltipRef.current.style.transform = `translate(${mouseRef.current.x + 12}px, ${mouseRef.current.y + 12}px)`;
      }
    },
    [countryStats]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipContent(null);
  }, []);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-white">География устройств</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{totalCountries} {totalCountries === 1 ? 'страна' : totalCountries < 5 ? 'страны' : 'стран'}</span>
          <span>{devices.length} устройств</span>
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[480px]">
        {geoLoading ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-zinc-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p>Загрузка карты...</p>
            </div>
          </div>
        ) : geoError || !geoData ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Не удалось загрузить карту</p>
            </div>
          </div>
        ) : (
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            scale: 150,
            center: [40, 35],
          }}
          width={900}
          height={480}
          style={{ width: '100%', height: '100%', background: '#09090b' }}
        >
          <ZoomableGroup>
            <Geographies geography={geoData!}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const geoId = geo.id as string;
                  const alpha3 = numericToAlpha3[geoId] || '';
                  const data = countryStats.get(alpha3);
                  const count = data?.total || 0;
                  const fillColor = getCountryColor(count, maxDevices);

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => handleMouseEnter(geoId, geo.properties.name)}
                      onMouseLeave={handleMouseLeave}
                      style={{
                        default: {
                          fill: fillColor,
                          stroke: '#27272a',
                          strokeWidth: 0.5,
                          outline: 'none',
                          transition: 'fill 0.2s ease',
                        },
                        hover: {
                          fill: count > 0 ? '#4ade80' : '#3f3f46',
                          stroke: '#52525b',
                          strokeWidth: 0.8,
                          outline: 'none',
                          cursor: 'pointer',
                        },
                        pressed: {
                          fill: count > 0 ? '#22c55e' : '#3f3f46',
                          stroke: '#52525b',
                          strokeWidth: 0.8,
                          outline: 'none',
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 px-5 py-2.5 border-t border-zinc-800">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm" style={{ background: '#27272a' }} />
          Нет
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm" style={{ background: '#14532d' }} />
          Мало
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm" style={{ background: '#16a34a' }} />
          Средне
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-3 h-3 rounded-sm" style={{ background: '#22c55e' }} />
          Много
        </div>
      </div>

      {/* Tooltip — rendered via portal on document.body to escape transforms */}
      {typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: 0,
            left: 0,
            opacity: tooltipContent ? 1 : 0,
            transform: `translate(${mouseRef.current.x + 12}px, ${mouseRef.current.y + 12}px)`,
          }}
        >
          {tooltipContent && (
            <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl shadow-2xl shadow-black/60 px-4 py-3 min-w-[180px]">
              <div className="text-sm font-semibold text-white mb-2">{tooltipContent.name}</div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Всего устройств</span>
                  <span className="text-white font-medium">{tooltipContent.total}</span>
                </div>
                {tooltipContent.total > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-zinc-400">Online</span>
                      </span>
                      <span className="text-green-400 font-medium">{tooltipContent.online}</span>
                    </div>
                    {tooltipContent.warning > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                          <span className="text-zinc-400">Warning</span>
                        </span>
                        <span className="text-yellow-400 font-medium">{tooltipContent.warning}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                        <span className="text-zinc-400">Offline</span>
                      </span>
                      <span className="text-zinc-400 font-medium">{tooltipContent.offline}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
});

export default WorldMap;
