import './style.css';
import './ui/atlas.css';
import { POWERS, usePower, type PowerId } from './sim/powers';
import { MAXS, Sim, type DifficultyId, type GoalId } from './sim/simulation';
import { H, W } from './sim/world';
import { MapRenderer, type Layer } from './ui/renderer';
import { Sound, type SoundMode } from './ui/audio';
import { Tutorial } from './ui/tutorial';
import { UI, type Game } from './ui/ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Simulation steps per second at each speed setting. */
const TPS = [0, 4, 12, 40];
const DESTRUCTIVE: PowerId[] = ['fire', 'drought', 'acid', 'plague', 'volcano', 'meteor'];
/** Powers that are put down again after a single use, so a slip of the hand cannot repeat them. */
const ONE_SHOT: PowerId[] = ['plague', 'transplant', 'volcano', 'meteor', 'mutagen'];

class App implements Game {
  sim!: Sim;
  renderer!: MapRenderer;
  ui: UI;
  selectedId = -1;
  tool: PowerId = 'inspect';
  speed = 1;
  paused = false;

  private acc = 0;
  private last = 0;
  private dirty = true;
  private lastBase = 0;
  private hover = -1;
  private endShown = false;
  private lastTooltip = 0;
  private pointer = { x: 0, y: 0, inside: false };
  /** A press on the map: it becomes a drag (pan) once the pointer moves far enough, otherwise a click. */
  private drag: { x: number; y: number; lastX: number; lastY: number; moved: boolean; button: number } | null = null;
  tutorial: Tutorial;
  sound = new Sound();
  private heardEvents = 0;
  private mixFrame = 0;
  place: { cell: number; radius: number } | null = null;
  followId = -1;
  showRegions = true;
  private followFrame = 0;

  constructor() {
    this.ui = new UI(this);
    // browsers only allow sound once the player has clicked or pressed a key
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    const modes: SoundMode[] = ['all', 'effects', 'off'];
    const label = () => {
      const b = $('btn-sound');
      b.textContent = { all: '🔊', effects: '🔉', off: '🔇' }[this.sound.mode];
      b.title = { all: 'Sound: effects, ambience and music (click to change)', effects: 'Sound: effects and ambience, no music (click to change)', off: 'Sound off (click to change)' }[this.sound.mode];
    };
    label();
    $('btn-sound').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.setMode(modes[(modes.indexOf(this.sound.mode) + 1) % modes.length]);
      label();
      this.sound.play('click');
    });
    this.tutorial = new Tutorial({
      zoom: () => this.renderer?.zoom ?? 1,
      selectedId: () => this.selectedId,
      cellViews: () => this.ui.cellViews,
      modalOpen: () => this.ui.modalOpen,
    });
    this.bindMap();
    this.bindKeys();
    window.addEventListener('resize', () => this.fitMap());
    new ResizeObserver(() => this.fitMap()).observe($('center'));
    this.fitMap();
    this.ui.showStart();
    requestAnimationFrame((t) => this.frame(t));
  }

  start(seed: number, goal: GoalId, tutorial = false, difficulty: DifficultyId = 'normal'): void {
    this.sim = new Sim(seed, goal, difficulty);
    this.renderer = new MapRenderer($<HTMLCanvasElement>('map'), $<HTMLCanvasElement>('overlay'), this.sim);
    this.selectedId = -1;
    this.tool = 'inspect';
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
    this.endShown = false;
    this.dirty = true;
    this.place = null;
    this.followId = -1;
    this.heardEvents = this.sim.events.length;
    this.ui.reset();
    this.ui.setLegend(this.renderer.layer);
    this.fitMap();
    this.ui.refresh(performance.now(), true);
    if (tutorial) this.tutorial.begin();
    else if (this.tutorial.active) this.tutorial.stop();
  }

  startTutorial(): void {
    if (this.sim) this.tutorial.begin();
  }

  /** Fly the view to a place and zoom in close enough to see the creatures. */
  focus(cell: number, zoom?: number): void {
    if (cell < 0) return;
    this.renderer.flyTo(cell, zoom ?? Math.max(this.renderer.zoom, 6));
    this.sim.addEffect('spark', cell, 2);
  }

  /** Inspect a place on the map: what lives there, and in how wide a circle around it. */
  setPlace(cell: number | null, radius?: number): void {
    if (cell === null || cell < 0) this.place = null;
    else this.place = { cell, radius: radius ?? this.place?.radius ?? -1 };
    this.ui.refresh(performance.now(), true);
  }

  /** Keep the camera on a species as it moves about. */
  setFollow(id: number): void {
    this.followId = id;
    const sp = this.sim.species[id];
    if (sp?.alive) {
      const c = this.sim.densestCell(sp);
      if (c >= 0) this.renderer.flyTo(c, Math.max(this.renderer.zoom, 6));
    }
    this.ui.refresh(performance.now(), true);
  }

  private follow(): void {
    if (this.followId < 0 || this.followFrame++ % 45 !== 0) return;
    const sp = this.sim.species[this.followId];
    if (!sp?.alive) {
      this.followId = -1;
      return;
    }
    const c = this.sim.densestCell(sp);
    if (c < 0) return;
    const r = this.renderer;
    const dx = Math.abs((c % W) + 0.5 - r.cx);
    const dy = Math.abs(Math.floor(c / W) + 0.5 - r.cy);
    if (dx > (W / r.zoom) * 0.22 || dy > (H / r.zoom) * 0.22) r.flyTo(c, r.zoom);
  }

  /** Step to one of the fixed zoom levels, centred on the inspected place if there is one. */
  goTo(zoom: number): void {
    if (zoom <= 1) {
      this.renderer.resetView();
      return;
    }
    const r = this.renderer;
    const centre = Math.floor(r.cy) * W + Math.floor(r.cx);
    r.flyTo(this.place?.cell ?? centre, zoom);
  }

  select(id: number): void {
    if (id >= 0 && id !== this.selectedId) this.sound.play('select');
    this.selectedId = id;
    this.ui.refresh(performance.now(), true);
  }

  setTool(id: PowerId): void {
    const info = POWERS.find((p) => p.id === id)!;
    if (info.needsSpecies && !this.sim.species[this.selectedId]?.alive) {
      this.ui.toast('Select a living species first (click one in the list).', true);
      return;
    }
    this.tool = id;
    this.ui.refresh(performance.now(), true);
  }

  setSpeed(i: number): void {
    if (i === 0) this.paused = !this.paused;
    else {
      this.speed = i;
      this.paused = false;
    }
    this.ui.refresh(performance.now(), true);
  }

  setLayer(l: Layer): void {
    this.renderer.layer = l;
    this.ui.setLegend(l);
    this.markDirty();
    this.lastBase = 0;
    this.ui.refresh(performance.now(), true);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Keep the map at 16:9, as large as the centre column allows while leaving room for the chronicle. */
  private fitMap(): void {
    const center = $('center');
    const availW = center.clientWidth;
    const toolbarHeight = $('layers').offsetHeight + (center.querySelector('.atlas-heading')?.clientHeight ?? 0) + 24;
    const compact = window.matchMedia('(max-width: 900px)').matches;
    const availH = compact ? availW * 9 / 16 : Math.max(100, center.clientHeight - toolbarHeight - 100);
    let w = availW;
    let h = (w * 9) / 16;
    if (h > availH) {
      h = Math.max(100, availH);
      w = (h * 16) / 9;
    }
    const wrap = $('mapwrap');
    wrap.style.width = `${Math.floor(w)}px`;
    wrap.style.height = `${Math.floor(h)}px`;
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        if (this.ui.modalOpen) this.ui.closeModal();
        else if (this.sim && this.tool !== 'inspect') this.setTool('inspect');
        else if (this.sim) this.setPlace(null);
        return;
      }
      if (!this.sim || this.ui.modalOpen) return;
      const r = this.renderer;
      if (e.code === 'Space') {
        e.preventDefault();
        this.setSpeed(0);
      } else if (e.key >= '1' && e.key <= '3') this.setSpeed(Number(e.key));
      else if (e.key === '+' || e.key === '=') r.zoomBy(1.6);
      else if (e.key === '-' || e.key === '_') r.zoomBy(1 / 1.6);
      else if (e.key === '0') r.resetView();
      else if (e.key === 'ArrowLeft') r.nudge(-0.2, 0);
      else if (e.key === 'ArrowRight') r.nudge(0.2, 0);
      else if (e.key === 'ArrowUp') r.nudge(0, -0.2);
      else if (e.key === 'ArrowDown') r.nudge(0, 0.2);
      else return;
      e.preventDefault();
    });
  }

  private bindMap(): void {
    const over = $<HTMLCanvasElement>('overlay');
    over.addEventListener(
      'wheel',
      (e) => {
        if (!this.sim) return;
        e.preventDefault();
        const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        this.renderer.zoomAt(Math.exp(-dy * 0.0016), e.clientX, e.clientY);
        this.followId = -1;
      },
      { passive: false },
    );
    over.addEventListener('pointermove', (e) => {
      if (!this.sim) return;
      this.pointer = { x: e.clientX, y: e.clientY, inside: true };
      const d = this.drag;
      if (d) {
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) {
          d.moved = true;
          over.classList.add('panning');
          $('tooltip').style.display = 'none';
        }
        if (d.moved) {
          this.renderer.panBy(e.clientX - d.lastX, e.clientY - d.lastY);
          this.followId = -1;
        }
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        if (d.moved) return;
      }
      const c = this.renderer.cellAt(e.clientX, e.clientY);
      if (c !== this.hover) {
        this.hover = c;
        this.updateTooltip();
      }
    });
    over.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.hover = -1;
      $('tooltip').style.display = 'none';
    });
    over.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.sim) this.setTool('inspect');
    });
    over.addEventListener('pointerdown', (e) => {
      if (!this.sim || (e.button !== 0 && e.button !== 1)) return;
      if (e.button === 1) e.preventDefault();
      this.drag = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false, button: e.button };
      over.setPointerCapture(e.pointerId);
    });
    over.addEventListener('pointercancel', () => {
      this.drag = null;
      over.classList.remove('panning');
    });
    over.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      over.classList.remove('panning');
      if (!this.sim || !d || d.moved || d.button !== 0) return;
      this.clickMap(e.clientX, e.clientY);
    });
    $('zoomctl').addEventListener('click', (e) => {
      const z = (e.target as HTMLElement).closest<HTMLElement>('[data-zoom]')?.dataset.zoom;
      if (!this.sim || !z) return;
      if (z === 'in') this.renderer.zoomBy(1.6);
      else if (z === 'out') this.renderer.zoomBy(1 / 1.6);
      else this.renderer.resetView();
    });
  }

  private clickMap(clientX: number, clientY: number): void {
    const c = this.renderer.cellAt(clientX, clientY);
    if (c < 0) return;
    if (this.tool === 'inspect') {
      this.inspect(c);
      return;
    }
    const selected = this.sim.species[this.selectedId] ?? null;
    const res = usePower(this.sim, this.tool, c, selected);
    if (!res.ok) this.ui.toast(res.msg, true);
    else {
      if (res.msg) this.ui.toast(res.msg);
      if (ONE_SHOT.includes(this.tool)) this.tool = 'inspect';
      this.markDirty();
    }
    this.ui.refresh(performance.now(), true);
  }

  /** Sounds for what just happened, and an ambience that follows what the map is showing. */
  private listen(): void {
    const sim = this.sim;
    const evs = sim.events;
    // at high speed many things happen at once; only the most recent few are heard
    const from = Math.max(this.heardEvents, evs.length - 4);
    for (let i = from; i < evs.length; i++) this.sound.forEvent(evs[i].icon, !!evs[i].major);
    this.heardEvents = evs.length;

    if (this.mixFrame++ % 10 !== 0) return;
    const r = this.renderer;
    const w = sim.world;
    const vw = W / r.zoom;
    const vh = H / r.zoom;
    const x0 = r.cx - vw / 2;
    const y0 = r.cy - vh / 2;
    const step = Math.max(1, Math.floor(vw / 24));
    let n = 0;
    let water = 0;
    let life = 0;
    let birds = false;
    const close = r.zoom >= 3;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y0 + vh); y += step) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x0 + vw); x += step) {
        const c = y * W + x;
        n++;
        if (w.isWater[c]) {
          water++;
          continue;
        }
        if (!close) continue;
        for (const sp of sim.alive) {
          if (sp.kind !== 'animal' || sp.genome.habitat === 'aquatic') continue;
          if (sim.pop[c * MAXS + sp.slot] > 1) {
            life++;
            if (sp.genome.flight > 0.4) birds = true;
            break;
          }
        }
      }
    }
    let fires = 0;
    for (const c of sim.fires) {
      const fx = c % W;
      const fy = Math.floor(c / W);
      if (fx >= x0 && fx < x0 + vw && fy >= y0 && fy < y0 + vh) fires++;
    }
    const land = n - water;
    this.sound.update({
      water: n ? water / n : 0,
      land: n ? land / n : 0,
      fire: Math.min(1, fires / 12),
      life: land ? Math.min(1, (life / land) * Math.min(1, (r.zoom - 2) / 4)) : 0,
      birds,
      age: sim.milestones.has('advanced') || sim.milestones.has('landAnimal') ? 1 : 0,
      paused: this.paused,
    });
  }

  /** Clicking a place opens the place inspector: everything that lives there. */
  private inspect(cell: number): void {
    this.setPlace(cell);
  }

  private updateTooltip(): void {
    const tip = $('tooltip');
    const c = this.hover;
    if (c < 0 || !this.sim) {
      tip.style.display = 'none';
      return;
    }
    this.lastTooltip = performance.now();
    const w = this.sim.world;
    const y = Math.floor(c / W);
    const lat = (0.5 - (y + 0.5) / H) * 180;
    const place = w.isWater[c] ? 'Ocean' : w.continentName(c);
    const plateId = w.tectonics.owner[c];
    const plate = w.tectonics.plates[plateId];
    const here = this.sim.speciesAt(c);
    const who = here
      .slice(0, 7)
      .map((s) => `<div>${s.sp.icon} <i>${s.sp.name}</i></div>`)
      .join('');
    tip.innerHTML = `<h4>${w.biomeName(c)}</h4>
      <div class="sub">${place} · ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}</div>
      <div class="env">
        <span>🌡️ ${w.temp[c].toFixed(1)} °C</span><span>🧪 pH ${w.ph[c].toFixed(1)}</span>
        <span>💧 ${w.isWater[c] ? 'water' : `${Math.round(w.moist[c] * 100)} % rain`}</span><span>💎 ${Math.round(w.minerals[c] * 100)} % minerals</span>
        <span>☢️ ${w.radiation[c].toFixed(2)} relative exposure</span><span>☀️ ${w.uv[c].toFixed(2)} relative UV</span>
        <span>🌋 ${plate ? `Plate ${plateId + 1} · ${plate.speed.toFixed(1)} cm/yr` : 'New ocean crust'}</span>
      </div>
      <div class="who">${who || '<div style="color:var(--muted)">Lifeless</div>'}${here.length > 7 ? `<div style="color:var(--muted)">and ${here.length - 7} more</div>` : ''}</div>`;
    tip.style.display = 'block';
    const wrap = $('mapwrap').getBoundingClientRect();
    let x = this.pointer.x - wrap.left + 16;
    let ty = this.pointer.y - wrap.top + 16;
    if (x + tip.offsetWidth > wrap.width - 6) x = this.pointer.x - wrap.left - tip.offsetWidth - 14;
    if (ty + tip.offsetHeight > wrap.height - 6) ty = this.pointer.y - wrap.top - tip.offsetHeight - 14;
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${Math.max(4, ty)}px`;
  }

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------

  private frame(now: number): void {
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const sim = this.sim;
    if (sim) {
      const active = sim.status === 'running' || sim.freePlay;
      if (!this.paused && active) {
        this.acc += (dt * TPS[this.speed]) / 1000;
        const t0 = performance.now();
        let steps = 0;
        while (this.acc >= 1 && performance.now() - t0 < 14) {
          sim.step();
          this.acc -= 1;
          steps++;
          if (sim.status !== 'running' && !sim.freePlay) break;
        }
        if (this.acc > 2) this.acc = 2;
        if (steps) this.dirty = true;
      }
      if (this.dirty && now - this.lastBase > 150) {
        this.renderer.renderBase();
        this.lastBase = now;
        this.dirty = false;
      }
      const info = POWERS.find((p) => p.id === this.tool)!;
      // the view may glide under a still pointer
      if (this.pointer.inside && !this.drag?.moved) this.hover = this.renderer.cellAt(this.pointer.x, this.pointer.y);
      this.renderer.renderView(now, {
        hover: this.hover,
        toolRadius: info.radius,
        toolColor: DESTRUCTIVE.includes(this.tool) ? 'rgba(239, 100, 97, 0.95)' : 'rgba(242, 193, 78, 0.95)',
        selected: sim.species[this.selectedId] ?? null,
        place: this.place,
        regions: this.showRegions || (this.place?.radius ?? 0) < 0 ? { borders: this.showRegions, selected: this.place && this.place.radius < 0 ? sim.regionOf[this.place.cell] : -1 } : null,
        showLabels: true,
      });
      this.ui.refresh(now);
      if (this.hover >= 0 && now - this.lastTooltip > 400) this.updateTooltip();
      if (sim.status !== 'running' && !this.endShown) {
        this.endShown = true;
        this.ui.showEnd();
      }
      this.tutorial.update(now);
      this.follow();
      this.listen();
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

// handy for poking at the world from the browser console
(window as unknown as { game: App }).game = new App();
