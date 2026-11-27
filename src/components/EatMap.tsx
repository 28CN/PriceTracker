'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

import { formatKm, type LatLon } from '@/lib/eat/geo';

export type EatMapPoint = {
  chain: string;
  mark: string;
  name: string;
  suburb: string;
  lat: number;
  lon: number;
  km: number;
  deals: number;
};

type EatMapProps = {
  center: LatLon;
  here: LatLon | null;
  points: EatMapPoint[];
};

type MapLibreModule = typeof import('maplibre-gl');

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

function isDarkTheme(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function buildPopupNode(point: EatMapPoint): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'eat-map-popup';

  const title = document.createElement('strong');
  title.className = 'eat-map-popup-name';
  title.textContent = point.name;
  wrap.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'eat-map-popup-meta';
  const parts: string[] = [];
  if (point.suburb) parts.push(point.suburb);
  parts.push(formatKm(point.km));
  meta.textContent = parts.join(' · ');
  wrap.appendChild(meta);

  return wrap;
}

export default function EatMap({ center, here, points }: EatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const darkRef = useRef<boolean>(false);
  const initialCenterRef = useRef<LatLon>(center);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    const init = async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;

      const dark = isDarkTheme();
      darkRef.current = dark;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: dark ? DARK_STYLE : LIGHT_STYLE,
        center: [initialCenterRef.current.lon, initialCenterRef.current.lat],
        zoom: 12,
        attributionControl: { compact: true }
      });

      libRef.current = maplibregl;
      mapRef.current = map;
      setReady(true);
    };

    void init();

    return () => {
      cancelled = true;
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      libRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const syncStyle = () => {
      const nextDark = isDarkTheme();
      if (nextDark !== darkRef.current && mapRef.current) {
        darkRef.current = nextDark;
        mapRef.current.setStyle(nextDark ? DARK_STYLE : LIGHT_STYLE);
      }
    };

    const observer = new MutationObserver(syncStyle);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', syncStyle);

    return () => {
      observer.disconnect();
      media.removeEventListener('change', syncStyle);
    };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = libRef.current;
    if (!ready || !map || !maplibregl) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    if (here) {
      const hereEl = document.createElement('div');
      hereEl.className = 'eat-map-here';
      hereEl.setAttribute('aria-label', 'Selected location');
      const hereMarker = new maplibregl.Marker({ element: hereEl }).setLngLat([here.lon, here.lat]).addTo(map);
      markersRef.current.push(hereMarker);
    }

    for (const point of points) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'eat-map-pin';
      el.setAttribute(
        'aria-label',
        `${point.name}${point.suburb ? `, ${point.suburb}` : ''}, ${formatKm(point.km)}${
          point.deals > 0 ? `, ${point.deals} ${point.deals === 1 ? 'deal' : 'deals'}` : ''
        }`
      );

      const markEl = document.createElement('span');
      markEl.className = 'eat-map-pin-mark';
      markEl.textContent = point.mark;
      el.appendChild(markEl);

      if (point.deals > 0) {
        const countEl = document.createElement('span');
        countEl.className = 'eat-map-pin-count';
        countEl.textContent = String(point.deals);
        el.appendChild(countEl);
      }

      const popup = new maplibregl.Popup({ offset: 18 }).setDOMContent(buildPopupNode(point));
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([point.lon, point.lat])
        .setPopup(popup)
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (points.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of points) bounds.extend([point.lon, point.lat]);
      if (here) bounds.extend([here.lon, here.lat]);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: reduced ? 0 : 350 });
    } else {
      map.jumpTo({ center: [center.lon, center.lat], zoom: 12 });
    }
  }, [ready, center, here, points]);

  return (
    <div className="eat-map-wrap">
      <div ref={containerRef} className="eat-map-canvas" role="region" aria-label="Nearby fast-food stores map" />
    </div>
  );
}
