'use client';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { Map as MapLibreMap, Marker as MapLibreMarker, Popup as MapLibrePopup } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clusterPoints } from '@/lib/eat/cluster';
import { formatKm, type LatLon } from '@/lib/eat/geo';

export type EatMapPoint = {
  chain: string;
  mark: string;
  logo?: string;
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

const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE = 'https://tiles.openfreemap.org/styles/fiord';
const CLUSTER_RADIUS_PX = 44;
const CLUSTER_MAX_ZOOM = 16;

function isDarkTheme(): boolean {
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function createPinMedia(point: EatMapPoint, imgClass: string, markClass: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'eat-map-pin-media';

  if (point.logo) {
    const img = document.createElement('img');
    img.className = imgClass;
    img.src = point.logo;
    img.alt = '';
    img.width = 30;
    img.height = 30;
    img.decoding = 'async';
    img.addEventListener('error', () => {
      const mark = document.createElement('span');
      mark.className = markClass;
      mark.textContent = point.mark;
      img.replaceWith(mark);
    });
    wrap.appendChild(img);
  } else {
    const mark = document.createElement('span');
    mark.className = markClass;
    mark.textContent = point.mark;
    wrap.appendChild(mark);
  }

  return wrap;
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

function buildClusterPopupNode(items: EatMapPoint[]): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'eat-map-popup eat-map-cluster-popup';

  const list = document.createElement('ul');
  list.className = 'eat-map-cluster-list';

  for (const point of items) {
    const row = document.createElement('li');
    row.className = 'eat-map-cluster-item';

    row.appendChild(createPinMedia(point, 'eat-map-cluster-popup-img', 'eat-map-cluster-popup-mark'));

    const text = document.createElement('div');
    text.className = 'eat-map-cluster-item-text';

    const title = document.createElement('strong');
    title.className = 'eat-map-popup-name';
    title.textContent = point.name;
    text.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'eat-map-popup-meta';
    const parts: string[] = [];
    if (point.suburb) parts.push(point.suburb);
    parts.push(formatKm(point.km));
    meta.textContent = parts.join(' · ');
    text.appendChild(meta);

    row.appendChild(text);
    list.appendChild(row);
  }

  wrap.appendChild(list);
  return wrap;
}

export default function EatMap({ center, here, points }: EatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const storeMarkersRef = useRef<MapLibreMarker[]>([]);
  const hereMarkerRef = useRef<MapLibreMarker | null>(null);
  const clusterPopupRef = useRef<MapLibrePopup | null>(null);
  const clusterSigRef = useRef<string>('');
  const pointsRef = useRef<EatMapPoint[]>(points);
  const darkRef = useRef<boolean>(false);
  const initialCenterRef = useRef<LatLon>(center);
  const [ready, setReady] = useState(false);

  pointsRef.current = points;

  const clearStoreMarkers = useCallback(() => {
    clusterPopupRef.current?.remove();
    clusterPopupRef.current = null;
    for (const marker of storeMarkersRef.current) marker.remove();
    storeMarkersRef.current = [];
    clusterSigRef.current = '';
  }, []);

  const syncStoreMarkers = useCallback(
    (force: boolean) => {
      const map = mapRef.current;
      const maplibregl = libRef.current;
      if (!map || !maplibregl) return;

      const sorted = [...pointsRef.current].sort(
        (a, b) => b.deals - a.deals || a.km - b.km || a.chain.localeCompare(b.chain)
      );

      const projected = sorted.map((item) => {
        const pt = map.project([item.lon, item.lat]);
        return { item, x: pt.x, y: pt.y };
      });

      const clusters = clusterPoints(projected, CLUSTER_RADIUS_PX);
      const signature = clusters
        .map((cluster) => cluster.items.map((item) => `${item.chain}:${item.lat}:${item.lon}:${item.deals}`).join('+'))
        .join('|');

      if (!force && signature === clusterSigRef.current) return;

      clearStoreMarkers();
      clusterSigRef.current = signature;

      for (const cluster of clusters) {
        if (cluster.items.length === 1) {
          const point = cluster.items[0];
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'eat-map-pin';
          el.setAttribute(
            'aria-label',
            `${point.name}${point.suburb ? `, ${point.suburb}` : ''}, ${formatKm(point.km)}${
              point.deals > 0 ? `, ${point.deals} ${point.deals === 1 ? 'deal' : 'deals'}` : ''
            }`
          );

          el.appendChild(createPinMedia(point, 'eat-map-pin-img', 'eat-map-pin-mark'));

          if (point.deals > 0) {
            const countEl = document.createElement('span');
            countEl.className = 'eat-map-pin-count';
            countEl.textContent = String(point.deals);
            el.appendChild(countEl);
          }

          const popup = new maplibregl.Popup({ offset: 22 }).setDOMContent(buildPopupNode(point));
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([point.lon, point.lat])
            .setPopup(popup)
            .addTo(map);
          storeMarkersRef.current.push(marker);
          continue;
        }

        const items = cluster.items;
        const avgLat = items.reduce((sum, item) => sum + item.lat, 0) / items.length;
        const avgLon = items.reduce((sum, item) => sum + item.lon, 0) / items.length;
        const totalDeals = items.reduce((sum, item) => sum + item.deals, 0);
        const extra = items.length - 2;

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'eat-map-pin eat-map-cluster';
        el.dataset.clusterCount = String(items.length);
        el.setAttribute(
          'aria-label',
          `${items.length} stores: ${items.map((item) => item.name).join(', ')}${
            totalDeals > 0 ? `, ${totalDeals} ${totalDeals === 1 ? 'deal' : 'deals'}` : ''
          }`
        );

        const logosEl = document.createElement('span');
        logosEl.className = 'eat-map-cluster-logos';
        for (const item of items.slice(0, 2)) {
          const slot = document.createElement('span');
          slot.className = 'eat-map-cluster-slot';
          slot.appendChild(createPinMedia(item, 'eat-map-cluster-img', 'eat-map-cluster-mark'));
          logosEl.appendChild(slot);
        }
        el.appendChild(logosEl);

        if (extra > 0) {
          const moreEl = document.createElement('span');
          moreEl.className = 'eat-map-cluster-more';
          moreEl.textContent = `+${extra}`;
          el.appendChild(moreEl);
        }

        if (totalDeals > 0) {
          const countEl = document.createElement('span');
          countEl.className = 'eat-map-pin-count';
          countEl.textContent = String(totalDeals);
          el.appendChild(countEl);
        }

        el.addEventListener('click', (event) => {
          event.stopPropagation();
          const bounds = new maplibregl.LngLatBounds();
          for (const item of items) bounds.extend([item.lon, item.lat]);
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const tooClose = Math.abs(ne.lng - sw.lng) < 0.0001 && Math.abs(ne.lat - sw.lat) < 0.0001;

          if (map.getZoom() >= CLUSTER_MAX_ZOOM - 0.05 || tooClose) {
            clusterPopupRef.current?.remove();
            clusterPopupRef.current = new maplibregl.Popup({ offset: 24 })
              .setLngLat([avgLon, avgLat])
              .setDOMContent(buildClusterPopupNode(items))
              .addTo(map);
            return;
          }

          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          map.fitBounds(bounds, { padding: 60, maxZoom: CLUSTER_MAX_ZOOM, duration: reduced ? 0 : 350 });
        });

        const marker = new maplibregl.Marker({ element: el }).setLngLat([avgLon, avgLat]).addTo(map);
        storeMarkersRef.current.push(marker);
      }
    },
    [clearStoreMarkers]
  );

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
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

      map.once('load', () => {
        map.resize();
        containerRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      });
      resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);

      libRef.current = maplibregl;
      mapRef.current = map;
      setReady(true);
    };

    void init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      clearStoreMarkers();
      hereMarkerRef.current?.remove();
      hereMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      libRef.current = null;
      setReady(false);
    };
  }, [clearStoreMarkers]);

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
    if (!ready || !map) return;

    const onViewportChange = () => syncStoreMarkers(false);
    map.on('moveend', onViewportChange);
    map.on('zoomend', onViewportChange);
    return () => {
      map.off('moveend', onViewportChange);
      map.off('zoomend', onViewportChange);
    };
  }, [ready, syncStoreMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = libRef.current;
    if (!ready || !map || !maplibregl) return;

    hereMarkerRef.current?.remove();
    hereMarkerRef.current = null;

    if (here) {
      const hereEl = document.createElement('div');
      hereEl.className = 'eat-map-here';
      hereEl.setAttribute('aria-label', 'Selected location');
      hereMarkerRef.current = new maplibregl.Marker({ element: hereEl })
        .setLngLat([here.lon, here.lat])
        .addTo(map);
    }

    map.resize();
    if (points.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of points) bounds.extend([point.lon, point.lat]);
      if (here) bounds.extend([here.lon, here.lat]);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: reduced ? 0 : 350 });
    } else {
      map.jumpTo({ center: [center.lon, center.lat], zoom: 12 });
    }

    syncStoreMarkers(true);
  }, [ready, center, here, points, syncStoreMarkers]);

  return (
    <div className="eat-map-wrap">
      <div ref={containerRef} className="eat-map-canvas" role="region" aria-label="Nearby fast-food stores map" />
    </div>
  );
}
