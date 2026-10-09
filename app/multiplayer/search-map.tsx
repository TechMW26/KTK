"use client";

import { useEffect, useRef } from 'react';
import { KINGDOMS, MAP_HEIGHT, MAP_WIDTH, routePath } from './search-map-data';
import { getMapCamera, sampleSearchTour } from './search-map-tour';
import type { SearchRiderRig } from './search-riders';
import './search-map.css';

/** One travelling camera and three scouts tour the fantasy kingdom registry. */
export default function SearchMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = mapRef.current, world = worldRef.current, host = hostRef.current;
    if (!map || !world || !host) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const markers = [...world.querySelectorAll<SVGGElement>('[data-kingdom]')];
    const steps = [...(stepsRef.current?.children ?? [])];
    let disposed = false, elapsed = 0, previous = 0, animation = 0;
    let width = map.clientWidth, height = map.clientHeight;
    let rig: SearchRiderRig | null = null;
    let loadingRiders = false;
    let statusKey = '';

    const draw = (delta = 0) => {
      if (disposed) return;
      const frame = sampleSearchTour(elapsed);
      const view = getMapCamera(width, height, frame);
      world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      const key = `${frame.phase}:${frame.destinationIndex}`;
      if (key !== statusKey) {
        statusKey = key;
        const kingdom = KINGDOMS[frame.destinationIndex];
        map.dataset.phase = frame.phase;
        map.dataset.kingdom = kingdom.id;
        if (phaseRef.current) phaseRef.current.textContent = frame.phase === 'travelling' ? 'RIDING TO' : 'SCOUTING';
        if (nameRef.current) nameRef.current.textContent = kingdom.name;
        if (countRef.current) countRef.current.textContent = `KINGDOM ${kingdom.numeral} OF VI`;
        markers.forEach((marker, i) => { marker.dataset.active = String(i === frame.destinationIndex); });
        steps.forEach((step, i) => { (step as HTMLElement).dataset.active = String(i === frame.destinationIndex); });
      }
      rig?.render(frame, view, delta);
    };
    const loadRiders = () => {
      if (loadingRiders || rig || disposed || reducedMotion.matches) return;
      loadingRiders = true;
      // The Three.js renderer is downloaded only for this screen and consumes
      // the same camera/tour frame as the lightweight map animation.
      void import('./search-riders').then(({ createSearchRiders }) => {
        if (disposed) return null;
        return createSearchRiders(host);
      }).then((next) => {
        loadingRiders = false;
        if (disposed || reducedMotion.matches) next?.dispose();
        else { rig = next ?? null; draw(); }
      }).catch(() => { loadingRiders = false; });
    };
    const tick = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .1) : 0;
      previous = now;
      elapsed += delta;
      draw(delta);
      animation = window.requestAnimationFrame(tick);
    };
    const resume = () => {
      window.cancelAnimationFrame(animation);
      previous = 0;
      if (reducedMotion.matches) { rig?.dispose(); rig = null; }
      else loadRiders();
      draw();
      if (!document.hidden && !reducedMotion.matches) animation = window.requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(() => {
      width = map.clientWidth; height = map.clientHeight;
      draw();
    });
    observer.observe(map);
    document.addEventListener('visibilitychange', resume);
    reducedMotion.addEventListener('change', resume);
    resume();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(animation);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      reducedMotion.removeEventListener('change', resume);
      rig?.dispose();
    };
  }, []);

  return (
    <div className="search-map" ref={mapRef} aria-hidden="true" data-phase="scouting" data-kingdom="crownkeep">
      <div className="search-map-world" ref={worldRef}>
        <svg className="search-map-art" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
          <image href="/maps/kingdom-search.webp" width={MAP_WIDTH} height={MAP_HEIGHT} />
          {KINGDOMS.map((kingdom, i) => (
            <g key={kingdom.id} data-kingdom={kingdom.id} data-active={i === 0 ? 'true' : 'false'}>
              <path d={routePath(kingdom.patrol)} className="search-map-route search-map-patrol" />
              <path d={routePath([kingdom.patrol[0], ...kingdom.onward, KINGDOMS[(i + 1) % KINGDOMS.length].patrol[0]], false)} className="search-map-route search-map-road" />
              <g transform={`translate(${kingdom.seat[0]} ${kingdom.seat[1]})`}>
                <circle className="search-map-ring" r="24" />
                <path className="search-kingdom-pole" d="M 0 14 V -48" />
                <path className="search-kingdom-standard" d="M 0 -48 H 35 V -13 L 18 -23 L 0 -13 Z" />
                <text className="search-kingdom-sigil" x="18" y="-27">{kingdom.sigil}</text>
                <circle className="search-map-pin" r="5" />
                <g transform="translate(0 24)">
                  <rect className="search-kingdom-label" x="-76" y="-8" width="152" height="37" rx="2" />
                  <text className="search-kingdom-name" y="7">{kingdom.name.toUpperCase()}</text>
                  <text className="search-kingdom-number" y="20">KINGDOM {kingdom.numeral}</text>
                </g>
              </g>
            </g>
          ))}
        </svg>
      </div>
      <div className="search-map-riders" ref={hostRef} />
      <div className="search-map-tint" />
      <div className="search-map-caption">
        <span className="search-map-caption-phase" ref={phaseRef}>SCOUTING</span>
        <strong ref={nameRef}>Crownkeep</strong>
        <span className="search-map-caption-count" ref={countRef}>KINGDOM I OF VI</span>
        <div className="search-map-steps" ref={stepsRef}>
          {KINGDOMS.map((kingdom, i) => <span key={kingdom.id} data-active={i === 0 ? 'true' : 'false'} />)}
        </div>
      </div>
    </div>
  );
}
