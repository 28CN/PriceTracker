'use client';

import { ExternalLink, LocateFixed, Map as MapIcon, MapPin, Navigation, TriangleAlert, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { EatMapPoint } from '@/components/EatMap';
import type { EatChain } from '@/lib/eat/chains';
import type { EatDealView, EatGroups } from '@/lib/eat/eatDeals';
import {
  NEAR_KM,
  PERTH_CBD,
  directionsUrl,
  formatKm,
  nearestByChain,
  type LatLon,
  type NearestStore,
  type StoresFile
} from '@/lib/eat/geo';
import { WEEKLY_DEALS, type WeekDay, type WeeklyDeal } from '@/lib/eat/weekly';

const EatMap = dynamic(() => import('@/components/EatMap'), {
  ssr: false,
  loading: () => (
    <div className="eat-map-placeholder" aria-busy="true">
      Loading map…
    </div>
  )
});

type Place = {
  kind: 'gps' | 'suburb';
  label: string;
  lat: number;
  lon: number;
};

type EatBoardProps = {
  groups: EatGroups;
  updated: { label: string; exact: string } | null;
  loadFailed: boolean;
  week: WeekDay[];
  weeklyChecked: string;
  chains: EatChain[];
};

const checkedFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC'
});

function formatCheckedDate(iso: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return checkedFormatter.format(date);
}

function storePlaceLabel(store: NearestStore): string {
  return store.suburb || store.name || store.address;
}

function storePopupName(store: NearestStore, chainName: string): string {
  if (!store.name) return chainName;
  if (store.name.toLowerCase().includes(chainName.toLowerCase())) return store.name;
  return `${chainName} — ${store.name}`;
}

function EatThumb({ src, href }: { src: string; href: string }) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return null;

  return (
    <a className="eat-thumb" href={href} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- OzBargain-hosted thumbnail, fixed size, lazy */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={72}
        height={72}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </a>
  );
}

function DealCard({ deal, mark, store }: { deal: EatDealView; mark: string; store: NearestStore | null }) {
  return (
    <li className="eat-card glass-surface">
      <div className="eat-card-badge" aria-hidden="true" title={deal.chainName}>
        {mark}
      </div>

      <div className="eat-card-body">
        <div className="eat-card-top">
          <span className="eat-card-chain">{deal.chainName}</span>
          {deal.price ? <span className="eat-price">{deal.price}</span> : null}
          {deal.isNew ? <span className="eat-pill is-new">New</span> : null}
        </div>

        <a className="eat-card-title" href={deal.url} target="_blank" rel="noopener noreferrer">
          {deal.title}
          <ExternalLink size={13} aria-hidden="true" />
          <span className="sr-only"> (opens OzBargain)</span>
        </a>

        <div className="eat-card-meta">
          <span>{deal.timeLeft ?? deal.posted}</span>
          <span className="eat-card-votes" aria-label={`${deal.votes} votes`}>
            ▲ {deal.votes}
          </span>
        </div>

        {store ? (
          <div className="eat-card-store">
            <span className="eat-card-distance">
              {formatKm(store.km)} · {storePlaceLabel(store)}
            </span>
            <a
              className="eat-directions"
              href={directionsUrl(store)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Directions to ${deal.chainName} ${storePlaceLabel(store)}`}
            >
              <Navigation size={12} aria-hidden="true" />
              Directions
            </a>
          </div>
        ) : null}
      </div>

      {deal.image ? <EatThumb src={deal.image} href={deal.url} /> : null}
    </li>
  );
}

export default function EatBoard({ groups, updated, loadFailed, week, weeklyChecked, chains }: EatBoardProps) {
  const suburbId = useId();
  const mapPanelId = useId();

  const [place, setPlace] = useState<Place | null>(null);
  const [suburbValue, setSuburbValue] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoOff, setGeoOff] = useState(false);
  const [withinNear, setWithinNear] = useState(false);

  const [storesFile, setStoresFile] = useState<StoresFile | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const storesPromiseRef = useRef<Promise<StoresFile | null> | null>(null);

  const [openWeeklyId, setOpenWeeklyId] = useState<string | null>(null);

  const [isDesktop, setIsDesktop] = useState(false);
  const [desktopMapInView, setDesktopMapInView] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  const suburbSelectRef = useRef<HTMLSelectElement>(null);
  const mapSlotRef = useRef<HTMLDivElement>(null);

  const chainByKey = useMemo(() => new Map(chains.map((chain) => [chain.key, chain])), [chains]);

  const markOf = useCallback((key: string) => chainByKey.get(key)?.mark ?? key.slice(0, 2).toUpperCase(), [chainByKey]);

  const ensureStores = useCallback(async (): Promise<StoresFile | null> => {
    if (storesFile) return storesFile;
    if (storesPromiseRef.current) return storesPromiseRef.current;

    setStoresLoading(true);
    const pending = fetch('/eat/stores-perth.json')
      .then((res) => (res.ok ? (res.json() as Promise<StoresFile>) : null))
      .then((data) => {
        if (data) setStoresFile(data);
        else storesPromiseRef.current = null;
        return data;
      })
      .catch(() => {
        storesPromiseRef.current = null;
        return null;
      })
      .finally(() => {
        setStoresLoading(false);
      });

    storesPromiseRef.current = pending;
    return pending;
  }, [storesFile]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 960px)');
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isDesktop || desktopMapInView) return;
    const node = mapSlotRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setDesktopMapInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDesktopMapInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '80px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isDesktop, desktopMapInView]);

  const showMap = isDesktop ? desktopMapInView : mobileMapOpen;

  useEffect(() => {
    if (showMap) void ensureStores();
  }, [showMap, ensureStores]);

  const handleNearMe = () => {
    void ensureStores();
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoOff(true);
      handleSuburbChange(PERTH_CBD.name);
      suburbSelectRef.current?.focus();
      return;
    }

    setLocating(true);
    setGeoOff(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setGeoOff(false);
        setSuburbValue('');
        setPlace({
          kind: 'gps',
          label: 'Near you',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });
      },
      () => {
        setLocating(false);
        setGeoOff(true);
        handleSuburbChange(PERTH_CBD.name);
        suburbSelectRef.current?.focus();
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  };

  const handleSuburbChange = (value: string) => {
    setSuburbValue(value);
    if (!value) {
      setPlace(null);
      setWithinNear(false);
      return;
    }
    setGeoOff(false);
    if (value === PERTH_CBD.name) {
      void ensureStores();
      setPlace({
        kind: 'suburb',
        label: PERTH_CBD.name,
        lat: PERTH_CBD.lat,
        lon: PERTH_CBD.lon
      });
      return;
    }
    const found = storesFile?.suburbs.find(([name]) => name === value);
    if (found) {
      const [name, lat, lon] = found;
      setPlace({ kind: 'suburb', label: name, lat, lon });
    }
  };

  const clearPlace = () => {
    setPlace(null);
    setSuburbValue('');
    setWithinNear(false);
  };

  const mapCenter = useMemo<LatLon>(
    () => (place ? { lat: place.lat, lon: place.lon } : { lat: PERTH_CBD.lat, lon: PERTH_CBD.lon }),
    [place]
  );

  const mapHere = useMemo<LatLon | null>(() => (place ? { lat: place.lat, lon: place.lon } : null), [place]);

  const nearestMap = useMemo(
    () => (storesFile ? nearestByChain(storesFile.stores, mapCenter) : null),
    [storesFile, mapCenter]
  );

  const prepareGroup = useCallback(
    (deals: EatDealView[]): { items: EatDealView[]; hidden: number } => {
      if (!place || !nearestMap) return { items: deals, hidden: 0 };
      const filtered = withinNear
        ? deals.filter((deal) => {
            const store = nearestMap.get(deal.chain);
            return store !== undefined && store.km <= NEAR_KM;
          })
        : deals;
      const hidden = deals.length - filtered.length;
      const sorted = [...filtered].sort((a, b) => {
        const ka = nearestMap.get(a.chain)?.km ?? Number.POSITIVE_INFINITY;
        const kb = nearestMap.get(b.chain)?.km ?? Number.POSITIVE_INFINITY;
        return ka - kb;
      });
      return { items: sorted, hidden };
    },
    [place, nearestMap, withinNear]
  );

  const everyoneGroup = useMemo(() => prepareGroup(groups.everyone), [prepareGroup, groups.everyone]);
  const waGroup = useMemo(() => prepareGroup(groups.wa), [prepareGroup, groups.wa]);
  const appGroup = useMemo(() => prepareGroup(groups.app), [prepareGroup, groups.app]);

  const dailyDeals = useMemo(() => WEEKLY_DEALS.filter((deal) => deal.day === 'daily'), []);

  const weeklyById = useMemo(() => {
    const map = new Map<string, WeeklyDeal>();
    for (const day of week) {
      for (const deal of day.deals) map.set(deal.id, deal);
    }
    for (const deal of dailyDeals) map.set(deal.id, deal);
    return map;
  }, [week, dailyDeals]);

  const openWeekly = openWeeklyId ? (weeklyById.get(openWeeklyId) ?? null) : null;

  const mapPoints = useMemo<EatMapPoint[]>(() => {
    if (!nearestMap) return [];
    const dealCounts = new Map<string, number>();
    for (const deal of [...everyoneGroup.items, ...waGroup.items, ...appGroup.items]) {
      dealCounts.set(deal.chain, (dealCounts.get(deal.chain) ?? 0) + 1);
    }

    const activeChains = new Set<string>(dealCounts.keys());
    for (const day of week) {
      if (day.isToday || day.isTomorrow) {
        for (const deal of day.deals) activeChains.add(deal.chain);
      }
    }
    for (const deal of dailyDeals) activeChains.add(deal.chain);

    const points: EatMapPoint[] = [];
    for (const chainKey of activeChains) {
      const store = nearestMap.get(chainKey);
      if (!store) continue;
      if (place && withinNear && store.km > NEAR_KM) continue;
      const chainInfo = chainByKey.get(chainKey);
      const chainName = chainInfo?.name ?? chainKey;
      points.push({
        chain: chainKey,
        mark: markOf(chainKey),
        name: storePopupName(store, chainName),
        suburb: store.suburb,
        lat: store.lat,
        lon: store.lon,
        km: store.km,
        deals: dealCounts.get(chainKey) ?? 0
      });
    }
    return points;
  }, [
    nearestMap,
    everyoneGroup.items,
    waGroup.items,
    appGroup.items,
    week,
    dailyDeals,
    place,
    withinNear,
    chainByKey,
    markOf
  ]);

  const suburbOptions = useMemo(
    () => (storesFile?.suburbs ?? []).filter(([name]) => name !== PERTH_CBD.name),
    [storesFile]
  );

  const toggleWeekly = (id: string) => {
    setOpenWeeklyId((current) => (current === id ? null : id));
  };

  const renderGroup = (
    id: string,
    title: string,
    rawCount: number,
    group: { items: EatDealView[]; hidden: number },
    alwaysShow: boolean,
    appChips?: EatGroups['appChains']
  ) => {
    if (!alwaysShow && rawCount === 0) return null;
    return (
      <section className="eat-group" aria-labelledby={id}>
        <div className="eat-group-head">
          <h2 id={id}>{title}</h2>
          <span className="eat-count">{group.items.length}</span>
        </div>

        {appChips && appChips.length > 0 ? (
          <div className="eat-app-chips" aria-label="Chain apps">
            {appChips.map((item) => (
              <a key={item.key} className="eat-app-chip" href={item.url} target="_blank" rel="noopener noreferrer">
                <span className="eat-chip-mark" aria-hidden="true">
                  {markOf(item.key)}
                </span>
                <span>{item.name} app</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            ))}
          </div>
        ) : null}

        {group.items.length > 0 ? (
          <ul className="eat-grid">
            {group.items.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                mark={markOf(deal.chain)}
                store={place && nearestMap ? (nearestMap.get(deal.chain) ?? null) : null}
              />
            ))}
          </ul>
        ) : null}

        {withinNear && group.hidden > 0 ? <p className="eat-hidden-note">{group.hidden} hidden</p> : null}
      </section>
    );
  };

  return (
    <div className="eat-layout">
      <aside className="eat-aside" aria-label="Location and map">
        <div className="eat-loc glass-surface">
          <div className="eat-loc-controls">
            <button
              type="button"
              className="eat-near-btn"
              onClick={handleNearMe}
              disabled={locating}
              aria-busy={locating}
            >
              <LocateFixed size={15} aria-hidden="true" />
              {locating ? 'Locating…' : 'Near me'}
            </button>

            <div className="eat-suburb-wrap">
              <label className="sr-only" htmlFor={suburbId}>
                Suburb
              </label>
              <select
                ref={suburbSelectRef}
                id={suburbId}
                className="eat-suburb-select"
                value={suburbValue}
                onFocus={() => void ensureStores()}
                onPointerDown={() => void ensureStores()}
                onChange={(event) => handleSuburbChange(event.target.value)}
              >
                <option value="">Suburb</option>
                <option value={PERTH_CBD.name}>{PERTH_CBD.name}</option>
                {suburbOptions.map(([name]) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="eat-loc-bar">
            <button
              type="button"
              className="eat-toggle"
              aria-pressed={withinNear}
              disabled={!place}
              onClick={() => setWithinNear((value) => !value)}
            >
              <span className="eat-switch" aria-hidden="true" />
              Within {NEAR_KM} km
            </button>

            <button
              type="button"
              className="eat-map-toggle"
              aria-expanded={mobileMapOpen}
              aria-controls={mapPanelId}
              onClick={() => {
                setMobileMapOpen((open) => {
                  const next = !open;
                  if (next) void ensureStores();
                  return next;
                });
              }}
            >
              <MapIcon size={15} aria-hidden="true" />
              Map
            </button>
          </div>

          {place || geoOff ? (
            <div className="eat-loc-status">
              {place ? (
                <span className="eat-place-line">
                  <MapPin size={13} aria-hidden="true" />
                  <span>{place.label}</span>
                  <button type="button" className="eat-place-clear" onClick={clearPlace} aria-label="Clear location">
                    <X size={13} aria-hidden="true" />
                  </button>
                </span>
              ) : null}
              {geoOff ? (
                <span className="eat-geo-note" role="status">
                  Location off
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          id={mapPanelId}
          ref={mapSlotRef}
          className={`eat-map-panel glass-surface${mobileMapOpen ? ' is-open' : ''}`}
        >
          {showMap ? (
            <EatMap center={mapCenter} here={mapHere} points={mapPoints} />
          ) : (
            <div className="eat-map-placeholder">{storesLoading ? 'Loading stores…' : 'Map'}</div>
          )}
        </div>
      </aside>

      <div className="eat-main">
        <section className="eat-week glass-surface" aria-labelledby="eat-week-heading">
          <div className="eat-week-head">
            <h2 id="eat-week-heading">This week</h2>
          </div>

          <div className="eat-days">
            {week.map((day) => (
              <div
                key={day.date}
                className={`eat-day${day.isToday ? ' is-today' : ''}${day.isTomorrow ? ' is-tomorrow' : ''}${
                  day.deals.length === 0 ? ' is-empty' : ''
                }`}
                aria-current={day.isToday ? 'date' : undefined}
              >
                <div className="eat-day-head">
                  <span className="eat-day-name">
                    {day.short}
                    {day.isToday ? <span className="sr-only"> (Today)</span> : null}
                  </span>
                  {day.isTomorrow ? <span className="eat-day-tag">Tomorrow</span> : null}
                </div>

                {day.deals.length === 0 ? (
                  <span className="eat-day-none" aria-label="No weekly deals">
                    —
                  </span>
                ) : (
                  <div className="eat-day-deals">
                    {day.deals.map((deal) => (
                      <button
                        key={deal.id}
                        type="button"
                        className={`eat-week-chip${openWeeklyId === deal.id ? ' is-active' : ''}`}
                        aria-expanded={openWeeklyId === deal.id}
                        onClick={() => toggleWeekly(deal.id)}
                      >
                        <span className="eat-chip-mark" aria-hidden="true">
                          {markOf(deal.chain)}
                        </span>
                        <span className="eat-week-chip-title">{deal.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {dailyDeals.length > 0 ? (
            <div className="eat-daily">
              <span className="eat-daily-label">Every day:</span>
              <div className="eat-daily-list">
                {dailyDeals.map((deal) => (
                  <button
                    key={deal.id}
                    type="button"
                    className={`eat-week-chip is-inline${openWeeklyId === deal.id ? ' is-active' : ''}`}
                    aria-expanded={openWeeklyId === deal.id}
                    onClick={() => toggleWeekly(deal.id)}
                  >
                    <span className="eat-chip-mark" aria-hidden="true">
                      {markOf(deal.chain)}
                    </span>
                    <span>{deal.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {openWeekly ? (
            <div className="eat-week-detail" role="region" aria-label={`${openWeekly.title} details`}>
              <div className="eat-week-detail-head">
                <div className="eat-week-detail-title">
                  <span className="eat-chip-mark" aria-hidden="true">
                    {markOf(openWeekly.chain)}
                  </span>
                  <strong>{openWeekly.title}</strong>
                  {openWeekly.app ? <span className="eat-pill is-app">App</span> : null}
                </div>
                <button
                  type="button"
                  className="eat-week-close"
                  onClick={() => setOpenWeeklyId(null)}
                  aria-label="Close deal detail"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>

              <p className="eat-week-detail-text">{openWeekly.detail}</p>

              <div className="eat-week-detail-meta">
                <div className="eat-week-sources">
                  {openWeekly.sources.map((src) => (
                    <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer">
                      {src.label}
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ))}
                </div>
                <span className="eat-week-checked">Checked {formatCheckedDate(openWeekly.checked)}</span>
              </div>
            </div>
          ) : null}
        </section>

        {loadFailed ? (
          <p className="eat-alert" role="alert">
            <TriangleAlert size={15} aria-hidden="true" />
            Could not load deals. Try again.
          </p>
        ) : null}

        {renderGroup('eat-group-everyone', 'For everyone', groups.everyone.length, everyoneGroup, false)}
        {renderGroup('eat-group-wa', 'WA only', groups.wa.length, waGroup, false)}
        {renderGroup('eat-group-app', 'In the app', groups.app.length, appGroup, true, groups.appChains)}
      </div>

      <footer className="eat-footer">
        <p>
          {updated ? (
            <>
              <span>
                Deals:{' '}
                <a href="https://www.ozbargain.com.au" target="_blank" rel="noopener noreferrer">
                  OzBargain
                </a>{' '}
                · <span title={updated.exact}>updated {updated.label}</span>
              </span>
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          <span>
            Stores:{' '}
            <a href="https://www.alltheplaces.xyz" target="_blank" rel="noopener noreferrer">
              All the Places
            </a>{' '}
            (CC-0), Jesters and NeNe Chicken store locators
          </span>
          <span aria-hidden="true"> · </span>
          <span>Weekly deals checked {weeklyChecked}</span>
        </p>
      </footer>
    </div>
  );
}
