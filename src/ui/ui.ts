import { DIET_NAMES, HABITAT_NAMES, TIER_NAMES, TRAIT_KEYS, describe, habFactors, sanitize, traitInfo, formatHeadcount, formatMass, traitCap, type Kind } from '../sim/genome';
import { GUIDE_COST, POWERS, canGuide, guideEvolution, usePower, type GuideKey, type PowerId } from '../sim/powers';
import { DIFFICULTIES, GOALS, HIST_EVERY, MAXS, MAX_ENERGY, Sim, TOTAL_TICKS, yearAt, type AtmKey, type DifficultyId, type Forecast, type GoalId } from '../sim/simulation';
import type { Genome } from '../sim/genome';
import type { Species } from '../sim/species';
import { CELL_EXAMPLES, buildCell } from './cell';
import { portrait } from './portrait';
import { tutorialSeen } from './tutorial';
import { H, N, W } from '../sim/world';
import { LAYERS, type Layer, type MapRenderer } from './renderer';
import { drawTree, treeHit, type TreeLayout } from './tree';

export type Tab = 'all' | Kind;

/** What the panels need from the game. */
export interface Game {
  sim: Sim;
  renderer: MapRenderer;
  selectedId: number;
  tool: PowerId;
  speed: number;
  paused: boolean;
  select(id: number): void;
  setTool(id: PowerId): void;
  setSpeed(i: number): void;
  setLayer(l: Layer): void;
  start(seed: number, goal: GoalId, tutorial: boolean, difficulty: DifficultyId): void;
  startTutorial(): void;
  focus(cell: number, zoom?: number): void;
  /** The place being inspected on the map, and how far around it to look. */
  place: { cell: number; radius: number } | null;
  setPlace(cell: number | null, radius?: number): void;
  /** The species the camera keeps in view, or -1. */
  followId: number;
  setFollow(id: number): void;
  showRegions: boolean;
  goTo(zoom: number): void;
  markDirty(): void;
  sound: { play(name: string): void };
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const num = (v: number) => Math.round(v).toLocaleString('en-US');

const ATM_UI: { key: AtmKey; label: string; fmt: (v: number) => string; hint: string }[] = [
  { key: 'sun', label: 'Sun', fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} °C`, hint: 'Brighten or dim the sun itself: the whole world warms or cools.' },
  { key: 'co2', label: 'Carbon dioxide', fmt: (v) => `${num(v)} ppm`, hint: 'Warms the world and feeds the plants. Too little and they starve; too much and the seas turn sour.' },
  { key: 'o2', label: 'Oxygen', fmt: (v) => `${v.toFixed(1)} %`, hint: 'Complex bodies need it, the land needs its ozone shield, and fire needs it to burn. Plants make it.' },
  { key: 'ch4', label: 'Methane', fmt: (v) => `${v.toFixed(1)} ppm`, hint: 'A potent greenhouse gas breathed out by ancient microbes. Oxygen destroys it.' },
  { key: 'so2', label: 'Sulfur haze', fmt: (v) => `${Math.round(v)}`, hint: 'Veils the sun and cools the world, and falls as acid rain. Fades quickly.' },
  { key: 'seaLevel', label: 'Sea level', fmt: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 1000)} m`, hint: 'Drown the coasts, or lower the seas to open land bridges between continents.' },
];

const SPEEDS = ['⏸', '▶', '▶▶', '▶▶▶'];
const SPEED_TITLES = ['Pause (space)', 'Normal speed (1)', 'Fast (2)', 'Very fast (3)'];

export class UI {
  tab: Tab = 'all';
  sortBy: 'numbers' | 'size' | 'newest' = 'numbers';
  private logCount = 0;
  private dragging: AtmKey | null = null;
  private hoverPower: PowerId | null = null;
  private tree: { layout: TreeLayout; canvas: HTMLCanvasElement } | null = null;
  private lastRefresh = 0;
  modalOpen = false;
  /** How many times a cell has been looked at (the tutorial waits for this). */
  cellViews = 0;
  private resumeAfterModal = false;

  constructor(private game: Game) {
    this.buildStatic();
  }

  // -------------------------------------------------------------------------
  // Static scaffolding
  // -------------------------------------------------------------------------

  private buildStatic(): void {
    const g = this.game;

    $('speed').innerHTML = SPEEDS.map((s, i) => `<button data-speed="${i}" title="${SPEED_TITLES[i]}">${s}</button>`).join('');
    $('speed').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-speed]');
      if (b) g.setSpeed(Number(b.dataset.speed));
    });

    $('powers').innerHTML = POWERS.map((p) => `<button class="power" data-power="${p.id}"><span class="pi">${p.icon}</span><span class="pn">${p.name}</span><span class="pc">${p.cost ? `${p.cost}⚡` : '&nbsp;'}</span></button>`).join('');
    $('powers').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-power]');
      if (b) g.setTool(b.dataset.power as PowerId);
    });
    $('powers').addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-power]');
      this.hoverPower = b ? (b.dataset.power as PowerId) : null;
      this.renderPowerHint();
    });
    $('powers').addEventListener('pointerleave', () => {
      this.hoverPower = null;
      this.renderPowerHint();
    });

    $('atmos').innerHTML = ATM_UI.map(
      (a) => `<div class="atm" title="${a.hint}">
        <div class="row"><label>${a.label}</label><span class="val" id="atm-val-${a.key}"></span></div>
        <input type="range" min="0" max="1000" step="1" id="atm-${a.key}" data-key="${a.key}" />
      </div>`,
    ).join('');
    for (const a of ATM_UI) {
      const input = $<HTMLInputElement>(`atm-${a.key}`);
      input.addEventListener('pointerdown', () => (this.dragging = a.key));
      input.addEventListener('input', () => {
        this.dragging = a.key;
        const v = Sim.atmFromNorm(a.key, Number(input.value) / 1000);
        const cost = g.sim.atmCost(a.key, v);
        $(`atm-val-${a.key}`).innerHTML = `${a.fmt(v)}${g.sim.sandbox ? '' : `<span class="cost">${Math.ceil(cost)}⚡</span>`}`;
      });
      input.addEventListener('change', () => {
        const v = Sim.atmFromNorm(a.key, Number(input.value) / 1000);
        const res = g.sim.setAtmosphere(a.key, v);
        if (!res.ok) this.toast('Not enough divine energy.', true);
        else if (Math.abs(res.value - v) > Math.abs(v) * 0.02 + 0.02) this.toast('Your energy ran out before the change was complete.', true);
        this.dragging = null;
        g.markDirty();
        this.refresh(performance.now(), true);
      });
    }

    $('layers').innerHTML = LAYERS.map((l) => `<button data-layer="${l.id}">${l.icon} ${l.name}</button>`).join('');
    $('layers').insertAdjacentHTML('beforeend', '<button data-regions title="Show the borders and names of the regions">🗺️ Regions</button>');
    $('layers').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-regions]')) {
        g.showRegions = !g.showRegions;
        this.refresh(performance.now(), true);
        return;
      }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-layer]');
      if (b) g.setLayer(b.dataset.layer as Layer);
    });

    const tabs: [Tab, string][] = [
      ['all', 'All'],
      ['animal', 'Animals'],
      ['plant', 'Plants'],
      ['microbe', 'Microbes'],
    ];
    $('tabs').innerHTML = tabs.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('') + '<button data-sort title="Sort by numbers, body size or age">↕</button>';
    $('tabs').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-sort]')) {
        const order: ('numbers' | 'size' | 'newest')[] = ['numbers', 'size', 'newest'];
        this.sortBy = order[(order.indexOf(this.sortBy) + 1) % order.length];
        this.toast(`Sorted by ${this.sortBy === 'numbers' ? 'numbers' : this.sortBy === 'size' ? 'body size, biggest first' : 'age, newest first'}`);
        this.refresh(performance.now(), true);
        return;
      }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab as Tab;
      this.refresh(performance.now(), true);
    });

    $('splist').addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (row) g.select(Number(row.dataset.id));
    });

    $('log').addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-sp]');
      if (row) g.select(Number(row.dataset.sp));
    });

    $('detail').addEventListener('pointerdown', (e) => this.onDetailClick(e));

    $('btn-tree').addEventListener('click', () => this.showTree());
    $('btn-guide').addEventListener('click', () => this.showGuide());
    $('site').addEventListener('pointerdown', (e) => this.onSiteClick(e));
    $('zoomlevels').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-level]');
      if (b && g.sim) g.goTo(Number(b.dataset.level));
    });
    $('btn-help').addEventListener('click', () => this.showHelp());
    $('btn-new').addEventListener('click', () => this.showStart());
    $('modal').addEventListener('pointerdown', (e) => {
      if (e.target === $('modal') && $('modal').dataset.dismiss === '1') this.closeModal();
    });
  }

  /** Reset per-world UI state when a new world begins. */
  reset(): void {
    this.logCount = 0;
    $('log').innerHTML = '';
    this.dragging = null;
    this.tree = null;
  }

  // -------------------------------------------------------------------------
  // Periodic refresh
  // -------------------------------------------------------------------------

  refresh(now: number, force = false): void {
    if (!force && now - this.lastRefresh < 250) return;
    this.lastRefresh = now;
    const g = this.game;
    const sim = g.sim;
    if (!sim) return;

    // top bar
    $('year').textContent = `Year ${num(sim.year)}`;
    $('age').textContent = sim.age;
    $('timefill').style.width = `${Math.min(100, (sim.tick / TOTAL_TICKS) * 100)}%`;
    $('speed')
      .querySelectorAll<HTMLElement>('[data-speed]')
      .forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === (g.paused ? 0 : g.speed)));
    $('energy').innerHTML = sim.sandbox
      ? `<div class="lbl"><span>⚡ Divine energy</span><b>∞</b></div><div class="meter"><div style="width:100%"></div></div>`
      : `<div class="lbl"><span>⚡ Divine energy</span><b>${Math.floor(sim.energy)}</b></div><div class="meter"><div style="width:${(sim.energy / MAX_ENERGY) * 100}%"></div></div>`;
    const goal = GOALS.find((x) => x.id === sim.goal)!;
    const prog = sim.goalProgress();
    $('goal').innerHTML = `<div class="lbl"><span>${goal.icon} ${goal.name}${sim.sandbox ? '' : ` · ${sim.diff.name}`}</span><span>${prog.label}</span></div><div class="meter"><div style="width:${prog.value * 100}%"></div></div>`;
    $('goal').title = goal.blurb;

    // powers
    $('powers')
      .querySelectorAll<HTMLElement>('[data-power]')
      .forEach((b) => {
        const p = POWERS.find((x) => x.id === b.dataset.power)!;
        b.classList.toggle('on', g.tool === p.id);
        b.classList.toggle('poor', !sim.canAfford(p.cost));
      });
    this.renderPowerHint();
    $('powers')
      .querySelectorAll<HTMLElement>('[data-power]')
      .forEach((b) => {
        const p = POWERS.find((x) => x.id === b.dataset.power)!;
        const pc = b.querySelector('.pc')!;
        const text = p.cost ? `${sim.sandbox ? 0 : sim.price(p.cost)}⚡` : '\u00a0';
        if (pc.textContent !== text) pc.textContent = text;
      });

    // layers
    $('layers')
      .querySelectorAll<HTMLElement>('[data-layer]')
      .forEach((b) => b.classList.toggle('on', b.dataset.layer === g.renderer.layer));
    $('layers').querySelector('[data-regions]')?.classList.toggle('on', g.showRegions);
    const sortBtn = $('tabs').querySelector<HTMLElement>('[data-sort]');
    if (sortBtn) sortBtn.textContent = this.sortBy === 'numbers' ? '↕ №' : this.sortBy === 'size' ? '↕ Size' : '↕ New';
    $('tabs')
      .querySelectorAll<HTMLElement>('[data-tab]')
      .forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));

    this.renderAtmosphere();
    this.renderWorld();
    this.renderList();
    this.renderDetail();
    this.renderSite();
    const z = g.renderer.zoom;
    const level = z < 2 ? 1 : z < 4.5 ? 3 : z < 8.5 ? 6 : 11;
    $('zoomlevels')
      .querySelectorAll<HTMLElement>('[data-level]')
      .forEach((b) => b.classList.toggle('on', Number(b.dataset.level) === level));
    this.renderLog();
  }

  private renderPowerHint(): void {
    const id = this.hoverPower ?? this.game.tool;
    const p = POWERS.find((x) => x.id === id)!;
    const price = this.game.sim ? this.game.sim.price(p.cost) : p.cost;
    $('powerhint').innerHTML = `<b>${p.icon} ${p.name}</b>${p.cost ? ` · ${price}⚡` : ''}<br>${p.hint}`;
  }

  private renderAtmosphere(): void {
    const sim = this.game.sim;
    const a = sim.world.atm;
    for (const d of ATM_UI) {
      if (this.dragging === d.key) continue;
      const v = a[d.key];
      $<HTMLInputElement>(`atm-${d.key}`).value = String(Math.round(Sim.atmNorm(d.key, v) * 1000));
      let trend = '';
      if (d.key === 'co2' || d.key === 'o2' || d.key === 'ch4') {
        const eq = sim.eq[d.key];
        const diff = eq - v;
        if (Math.abs(diff) > Math.max(0.15, Math.abs(v) * 0.04)) {
          trend = `<span class="trend" style="color:${diff > 0 ? '#ef9a61' : '#61b8ef'}" title="Drifting towards ${d.fmt(eq)}">${diff > 0 ? '▲' : '▼'}</span>`;
        }
      }
      $(`atm-val-${d.key}`).innerHTML = d.fmt(v) + trend;
    }
  }

  private renderWorld(): void {
    const sim = this.game.sim;
    const w = sim.world;
    const kinds = { microbe: 0, plant: 0, animal: 0 };
    for (const sp of sim.alive) kinds[sp.kind]++;
    const perTick = yearAt(sim.tick + 1) - yearAt(sim.tick);
    const rows: [string, string][] = [
      ['Mean temperature', `${w.meanTemp.toFixed(1)} °C`],
      ['Ice cover', `${Math.round(w.iceFrac * 100)} %`],
      ['Dry land', `${Math.round(w.landFrac * 100)} %`],
      ['Living species', `${sim.nAlive}`],
      ['Ever lived', `${sim.species.length}`],
      ['Time flow', `${num(perTick)} yr / step`],
    ];
    $('worldstats').innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    $('spcount').textContent = `· ${kinds.animal} animals · ${kinds.plant} plants · ${kinds.microbe} microbes`;
  }

  private renderList(): void {
    const g = this.game;
    const sim = g.sim;
    const groups: [Kind, string][] = [
      ['animal', 'Animals'],
      ['plant', 'Plants'],
      ['microbe', 'Microbes'],
    ];
    let html = '';
    for (const [kind, title] of groups) {
      if (this.tab !== 'all' && this.tab !== kind) continue;
      const list = sim.alive
        .filter((s) => s.kind === kind)
        .sort((a, b) => (this.sortBy === 'size' ? b.genome.size - a.genome.size : this.sortBy === 'newest' ? b.bornTick - a.bornTick : b.totalPop - a.totalPop));
      if (!list.length) continue;
      const max = Math.log10(1 + list[0].totalPop) || 1;
      if (this.tab === 'all') html += `<div class="sp-head">${title} · ${list.length}</div>`;
      for (const sp of list) {
        const width = Math.max(4, (Math.log10(1 + sp.totalPop) / max) * 100);
        let badge = '';
        if (sp.sentient) badge += '<span class="badge">✨</span>';
        if (sim.plagues.some((p) => p.speciesId === sp.id)) badge += '<span class="badge">🦠</span>';
        if (sim.tick - sp.bornTick < 60 && sp.id > 0) badge += '<span class="badge" style="color:var(--teal)">new</span>';
        html += `<div class="sp${sp.id === g.selectedId ? ' on' : ''}" data-id="${sp.id}">
          <img class="thumb" src="${this.picture(sp)}" alt="" />
          <span class="nm"><i>${sp.name}${badge}</i><small>${sp.desc}</small></span>
          <span class="bar"><span style="width:${width}%;background:rgb(${sp.color.join(',')})"></span></span>
        </div>`;
      }
    }
    if (!html) html = '<div class="empty" style="color:var(--muted);padding:8px 2px">Nothing of this kind lives yet.</div>';
    $('splist').innerHTML = html;
  }

  private sparkline(sp: Species): string {
    const h = sp.history;
    if (h.length < 3) return '';
    const step = Math.max(1, Math.floor(h.length / 120));
    const pts: number[] = [];
    for (let i = 0; i < h.length; i += step) pts.push(h[i]);
    pts.push(h[h.length - 1]);
    const max = Math.max(...pts, 1e-6);
    const path = pts.map((v, i) => `${((i / (pts.length - 1)) * 100).toFixed(1)},${(29 - (v / max) * 27).toFixed(1)}`).join(' ');
    const col = `rgb(${sp.color.join(',')})`;
    return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="0,30 ${path} 100,30" fill="${col}" fill-opacity="0.18" stroke="none"/><polyline points="${path}" fill="none" stroke="${col}" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  private rangeText(sp: Species): string {
    const sim = this.game.sim;
    const w = sim.world;
    if (!sp.alive) return '';
    const counts = new Map<number, number>();
    let sea = 0;
    for (let c = 0; c < N; c++) {
      if (sim.pop[c * MAXS + sp.slot] <= 0) continue;
      if (w.isWater[c]) sea++;
      else counts.set(w.continent[c], (counts.get(w.continent[c]) ?? 0) + 1);
    }
    const lands = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => w.continents[id]?.name)
      .filter(Boolean);
    const parts: string[] = [];
    if (lands.length) parts.push(lands.slice(0, 3).join(', ') + (lands.length > 3 ? ` +${lands.length - 3}` : ''));
    if (sea > 0) parts.push(lands.length ? 'coastal waters' : 'the seas');
    return parts.join(' · ') || 'scattered islands';
  }

  private renderDetail(): void {
    const g = this.game;
    const sim = g.sim;
    const el = $('detail');
    const sp = sim.species[g.selectedId];
    if (!sp) {
      el.innerHTML = `<h2>Selected species</h2><div class="empty">Pick a species from the list, or click the map, to study it, guide its evolution, strike it with plague or carry it across the sea.</div>`;
      return;
    }
    const gn = sp.genome;
    const parent = sim.species[sp.parentId];
    const facts: [string, string][] = [];
    facts.push(['Appeared', `year ${num(sp.bornYear)}${parent ? ` from <a data-parent="${parent.id}">${parent.name}</a>` : ''}`]);
    if (sp.alive) {
      facts.push(['Numbers', `${formatHeadcount(sp.totalPop, gn.size)}`]);
      facts.push(['Range', this.rangeText(sp)]);
      if (sp.declineReason && sp.totalPop < 0.55 * sp.peakPop) facts.push(['Declining', `<span class="warn">⚠ ${sp.declineReason}</span>`]);
    } else {
      facts.push(['Vanished', `year ${num(sp.diedYear)}`]);
      if (sp.deathCause) facts.push(['Why', `<span class="warn">${sp.deathCause}</span>`]);
    }
    facts.push(['Body', `about ${formatMass(gn.size)}`]);
    let comfort = `${Math.round(gn.tempOpt - gn.tempTol)} to ${Math.round(gn.tempOpt + gn.tempTol)} °C · pH ${(gn.phOpt - gn.phTol).toFixed(1)}–${(gn.phOpt + gn.phTol).toFixed(1)}`;
    if (gn.habitat !== 'aquatic') comfort += ` · rain ${Math.round(Math.max(0, gn.moistOpt - gn.moistTol) * 100)}–${Math.round(Math.min(1, gn.moistOpt + gn.moistTol) * 100)} %`;
    facts.push(['Comfort', comfort]);

    const rows: string[] = [];
    const traitRow = (key: GuideKey, icon: string, label: string, hint: string, frac: number) => {
      const open = (dir: 1 | -1) => sp.alive && (canGuide(sp, key, dir) || (key === 'intel' && dir > 0 && gn.tier === 4 && gn.intel < 0.98));
      const btn = (dir: 1 | -1) => `<button data-guide="${key}" data-dir="${dir}" ${open(dir) ? '' : 'disabled'} title="Guide evolution: ${dir > 0 ? 'more' : 'less'} (${g.sim.price(GUIDE_COST)}⚡)">${dir > 0 ? '+' : '−'}</button>`;
      rows.push(`<div class="trait" title="${hint}"><span>${icon}</span><span>${label}</span><span class="tb"><span style="width:${Math.round(frac * 100)}%"></span></span>${btn(-1)}${btn(1)}</div>`);
    };
    const si = traitInfo(gn, 'size');
    traitRow('size', si.icon, si.label, si.hint, gn.size / 10);
    for (const k of TRAIT_KEYS) {
      if (traitCap(gn, k) <= 0 && gn[k] <= 0.01) continue;
      const ti = traitInfo(gn, k);
      traitRow(k, ti.icon, ti.label, ti.hint, gn[k]);
    }

    el.innerHTML = `
      <div class="d-head">
        <img class="d-portrait" src="${this.picture(sp)}" alt="Picture of ${sp.name}" data-act="guide" title="Open the field guide" />
        <div><h3>${sp.name}</h3><div class="d-desc">${sp.desc}</div></div>
        <button class="x" data-act="close" title="Deselect">×</button>
      </div>
      <div class="d-tags">
        ${sp.alive ? '' : '<span class="dead">Extinct</span>'}
        ${sp.sentient ? '<span style="color:var(--gold);border-color:var(--gold)">Self-aware</span>' : ''}
        <span>${TIER_NAMES[gn.tier]}</span><span>${DIET_NAMES[gn.diet]}</span><span>${HABITAT_NAMES[gn.habitat]}</span>
      </div>
      <div class="d-facts">${facts.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>
      ${this.sparkline(sp)}
      <div class="traits">${rows.join('')}</div>
      ${sp.alive ? `<div class="guide-note">＋/− breeds a quick mutant at home (${sim.price(GUIDE_COST)}⚡, sheltered for 40 steps). The 🧪 Mutation lab designs one with several changes and lets you choose where it starts.</div>` : ''}
      <div class="d-actions">
        ${sp.alive ? `<button data-act="follow" class="${g.followId === sp.id ? 'on' : ''}" title="Keep the camera on it as it moves (drag the map to stop)">🎥 ${g.followId === sp.id ? 'Following' : 'Follow'}</button>` : ''}
        <button data-act="stats" title="How it spread, what killed it, what ate it and what it ate">📊 Stats</button>
        <button data-act="cell" title="See how its cells are built">🔬 Cell</button>
        ${sp.alive ? `<button data-act="where" title="Rank every region by how well it would do there">🧭 Where to?</button><button data-act="lab" title="Design a mutant, see how it would fare, choose where it starts">🧪 Lab</button><button data-act="plague" title="Unleash a virus where it is most numerous (${sim.price(25)}⚡)">🦠 Plague</button><button data-act="ark" title="Carry a founding population elsewhere (${sim.price(20)}⚡)">🕊️ Ark</button>` : ''}
      </div>`;
  }

  private onDetailClick(e: PointerEvent): void {
    const g = this.game;
    const sim = g.sim;
    const t = e.target as HTMLElement;
    const sp = sim.species[g.selectedId];
    const parent = t.closest<HTMLElement>('[data-parent]');
    if (parent) {
      g.select(Number(parent.dataset.parent));
      return;
    }
    const guide = t.closest<HTMLButtonElement>('[data-guide]');
    if (guide && sp && !guide.disabled) {
      const res = guideEvolution(sim, sp, guide.dataset.guide as GuideKey, Number(guide.dataset.dir) as 1 | -1);
      this.toast(res.msg, !res.ok);
      if (res.ok) g.select(sim.species.length - 1);
      this.refresh(performance.now(), true);
      return;
    }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') g.select(-1);
    else if (act === 'guide') this.showGuide();
    else if (act === 'stats' && sp) {
      this.showStats(sp);
      return;
    } else if (act === 'cell' && sp) {
      this.showCell(sp.genome, sp.name, sp.desc, sp.id);
      return;
    } else if (!sp?.alive) return;
    else if (act === 'follow') g.setFollow(g.followId === sp.id ? -1 : sp.id);
    else if (act === 'where') {
      this.showWhere(sp);
      return;
    } else if (act === 'lab') {
      this.showLab(sp);
      return;
    } else if (act === 'plague') {
      const res = usePower(sim, 'plague', sim.densestCell(sp), sp);
      this.toast(res.ok ? `A plague is loose among ${sp.name}.` : res.msg, !res.ok);
    } else if (act === 'ark') {
      g.setTool('transplant');
      this.toast(`Click the map where ${sp.name} should be set down.`);
    }
    this.refresh(performance.now(), true);
  }

  private renderLog(): void {
    const sim = this.game.sim;
    const log = $('log');
    if (this.logCount > sim.events.length) {
      this.logCount = 0;
      log.innerHTML = '';
    }
    if (this.logCount === sim.events.length) return;
    const frag = document.createDocumentFragment();
    for (let i = sim.events.length - 1; i >= this.logCount; i--) {
      const ev = sim.events[i];
      const div = document.createElement('div');
      div.className = `ev${ev.major ? ' major' : ''}${ev.speciesId !== undefined ? ' link' : ''}`;
      if (ev.speciesId !== undefined) div.dataset.sp = String(ev.speciesId);
      div.innerHTML = `<span class="yr">${num(ev.year)}</span><span class="ic">${ev.icon}</span><span class="tx">${ev.text}</span>`;
      frag.appendChild(div);
    }
    log.prepend(frag);
    this.logCount = sim.events.length;
    while (log.childElementCount > 300) log.lastElementChild!.remove();
  }

  setLegend(layer: Layer): void {
    const l = LAYERS.find((x) => x.id === layer)!;
    const el = $('legend');
    if (!l.legend) {
      if (layer === 'flora' || layer === 'fauna') {
        el.style.display = 'block';
        el.innerHTML = `Each colour is the most abundant ${layer === 'flora' ? 'plant or microbe that makes its own food' : 'creature that eats others'} in that place.`;
      } else el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.innerHTML = `<div class="bar" style="background:${l.legend.css}"></div><div class="ends"><span>${l.legend.lo}</span><span>${l.legend.hi}</span></div>`;
  }

  // -------------------------------------------------------------------------
  // Toasts and modals
  // -------------------------------------------------------------------------

  toast(msg: string, bad = false): void {
    if (bad) this.game.sound.play('error');
    if (!msg) return;
    const el = document.createElement('div');
    el.className = `toast${bad ? ' bad' : ''}`;
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  private openModal(html: string, dismissable: boolean): HTMLElement {
    const m = $('modal');
    m.innerHTML = html;
    m.classList.add('open');
    m.dataset.dismiss = dismissable ? '1' : '0';
    if (!this.modalOpen) {
      this.resumeAfterModal = !this.game.paused;
      this.game.paused = true;
    }
    this.modalOpen = true;
    return m;
  }

  closeModal(): void {
    if (!this.modalOpen) return;
    const m = $('modal');
    if (m.dataset.dismiss !== '1') return;
    this.forceClose();
  }

  private forceClose(): void {
    const m = $('modal');
    m.classList.remove('open');
    m.innerHTML = '';
    this.modalOpen = false;
    this.tree = null;
    if (this.resumeAfterModal) this.game.paused = false;
  }

  showStart(): void {
    const hasWorld = !!this.game.sim;
    let diff: DifficultyId = 'normal';
    let goal: GoalId = 'awakening';
    const m = this.openModal(
      `<div class="card">
        <div class="hero">🌍</div>
        <h1>Evolution</h1>
        <p class="tag">A young world, a warm sea, and one kind of microbe clinging to the vents.<br>
        You are God. You have a million years. Shape the air, the rain and the rock, send fire and plague,
        carry creatures across oceans, and see what life makes of it.</p>
        <h3>Choose your purpose</h3>
        <div class="goals">${GOALS.map((x) => `<button class="goalcard${x.id === goal ? ' on' : ''}" data-goal="${x.id}"><span class="gi">${x.icon}</span><div><b>${x.name}</b><span>${x.blurb}</span></div></button>`).join('')}</div>
        <label class="tutrow"><input type="checkbox" id="tut" ${tutorialSeen() ? '' : 'checked'} /> Show me around first (a short guided tour)</label>
        <h3>Difficulty</h3>
        <div class="diffs">${DIFFICULTIES.map((d) => `<button class="diffcard${d.id === diff ? ' on' : ''}" data-diff="${d.id}"><b>${d.icon} ${d.name}</b><span>${d.blurb}</span></button>`).join('')}</div>
        <div class="seedrow"><label for="seed">World seed</label><input id="seed" value="${1 + Math.floor(Math.random() * 999999)}" inputmode="numeric" /><button id="reroll" title="Another random world">🎲</button></div>
        <div class="btnrow">
          ${hasWorld ? '<button class="secondary" id="cancel">Back to my world</button>' : ''}
          <button class="primary" id="begin">Let there be life</button>
        </div>
      </div>`,
      hasWorld,
    );
    m.querySelectorAll<HTMLElement>('[data-goal]').forEach((b) =>
      b.addEventListener('click', () => {
        goal = b.dataset.goal as GoalId;
        m.querySelectorAll('[data-goal]').forEach((o) => o.classList.toggle('on', o === b));
      }),
    );
    m.querySelectorAll<HTMLElement>('[data-diff]').forEach((btn) =>
      btn.addEventListener('click', () => {
        diff = btn.dataset.diff as DifficultyId;
        m.querySelectorAll('[data-diff]').forEach((o) => o.classList.toggle('on', o === btn));
      }),
    );
    const seed = m.querySelector<HTMLInputElement>('#seed')!;
    m.querySelector('#reroll')!.addEventListener('click', () => (seed.value = String(1 + Math.floor(Math.random() * 999999))));
    m.querySelector('#cancel')?.addEventListener('click', () => this.forceClose());
    m.querySelector('#begin')!.addEventListener('click', () => {
      const btn = m.querySelector<HTMLButtonElement>('#begin')!;
      btn.textContent = 'Shaping the world…';
      btn.disabled = true;
      const n = Math.abs(Math.floor(Number(seed.value))) || 1;
      const tour = m.querySelector<HTMLInputElement>('#tut')?.checked ?? false;
      // let the button repaint before the heavy world generation
      setTimeout(() => {
        this.resumeAfterModal = false;
        this.forceClose();
        this.game.start(n, goal, tour, diff);
      }, 30);
    });
  }

  showEnd(): void {
    const sim = this.game.sim;
    const won = sim.status === 'won';
    const m = this.openModal(
      `<div class="card">
        <div class="hero">${won ? '🏆' : sim.nAlive === 0 ? '🪦' : '⌛'}</div>
        <h1>${sim.endTitle}</h1>
        <p class="tag">${sim.endText}</p>
        <p class="tag" style="color:var(--muted);font-size:13px">${sim.species.length} species arose in your world; ${sim.nAlive} are alive today.</p>
        <div class="btnrow">
          ${sim.nAlive > 0 ? '<button class="secondary" id="keep">Keep watching</button>' : ''}
          <button class="secondary" id="tree">🌳 Tree of Life</button>
          <button class="primary" id="again">New world</button>
        </div>
      </div>`,
      false,
    );
    m.querySelector('#keep')?.addEventListener('click', () => {
      sim.freePlay = true;
      this.resumeAfterModal = true;
      this.forceClose();
    });
    m.querySelector('#tree')!.addEventListener('click', () => {
      sim.freePlay = true;
      this.showTree();
    });
    m.querySelector('#again')!.addEventListener('click', () => this.showStart());
  }

  showHelp(): void {
    const m = this.openModal(
      `<div class="card help">
        <h1 style="font-size:24px">How to play God</h1>
        <p>Life begins as a single microbe in the deep sea. Left alone it will mutate, split into new species and spread wherever it can make a living. Your job is to shape the world it adapts to.</p>
        <h3>How evolution works here</h3>
        <ul>
          <li><b>Every species has a home.</b> Temperature, rainfall, acidity and minerals decide where it thrives. Use the map layers to see them.</li>
          <li><b>Oxygen is the great gatekeeper.</b> Sunlight-eaters fill the air with it. Complex cells, bodies, land life and big animals each need more. Land plants make the most.</li>
          <li><b>Landscape shapes bodies.</b> Horns and speed pay off on open savanna but are a curse in dense forest; climbers rule the canopy. Rain makes forest, drought and fire make grassland.</li>
          <li><b>Eat and be eaten.</b> Grazers need plants, hunters need prey. Remove one and the others follow. Creatures that never met a predator have no defences.</li>
          <li><b>Minds are expensive.</b> Intelligence only pays for social animals with grasping hands. That is the road to self-awareness.</li>
        </ul>
        <h3>Your powers</h3>
        <ul>
          <li><b>Air, Sun &amp; Sea:</b> drag a slider to set it. The living world keeps pulling the air back towards its own balance (the small arrows show which way).</li>
          <li><b>Divine powers:</b> pick one, then click the map. Fire, rain and drought, minerals, acid, volcanoes, meteors, plagues and mutagens.</li>
          <li><b>The Ark:</b> select a species, choose Ark, click another continent. Newcomers can be devastating to creatures that evolved without them.</li>
          <li><b>Guided evolution:</b> select a species and press ＋ or − on a trait. A daughter species with that change is born. Whether she survives is up to the world you made.</li>
        </ul>
        <h3>Looking closer</h3>
        <ul>
          <li><b>Zoom:</b> scroll over the map (or ＋ / −, or the buttons in its corner) and drag to move. Up close you see waves, drifting algae, kelp, forests, mountains, volcanoes and the animals themselves. <b>0</b> shows the whole world again; <b>📍 Locate</b> flies to a species.</li>
          <li><b>Cells:</b> press <b>🔬 Cell</b> on any species to see how its cells are built and which kinds of cells make up its body.</li>
          <li><b>Places:</b> click the map to see everything living in a spot, an area or a whole region, and the climate there.</li>
          <li><b>Stats:</b> press <b>📊 Stats</b> on a species to see how it spread, what killed it, what ate it and what it ate. When a species dies out, the Chronicle tells you why.</li>
          <li><b>Field guide (📖)</b> has a picture of every species, living and extinct. <b>🔊</b> switches between sound with music, effects only, and silence.</li>
        </ul>
        <p>Everything costs <b>divine energy</b>, which returns slowly. Time runs fastest in the age of microbes and slows as life grows complex. <b>Space</b> pauses, <b>1–3</b> set the speed, <b>Esc</b> puts your powers down.</p>
        <div class="btnrow"><button class="secondary" id="cells">🔬 Cells compared</button><button class="secondary" id="tour">🧭 Guided tour</button><button class="primary" id="ok">Back to the world</button></div>
      </div>`,
      true,
    );
    m.querySelector('#ok')!.addEventListener('click', () => this.forceClose());
    m.querySelector('#tour')!.addEventListener('click', () => {
      this.forceClose();
      this.game.startTutorial();
    });
    m.querySelector('#cells')!.addEventListener('click', () => {
      const ex = CELL_EXAMPLES[0];
      this.showCell(ex.genome, ex.name, ex.desc, 1);
    });
  }

  // -------------------------------------------------------------------------
  // Pictures
  // -------------------------------------------------------------------------

  private pictures = new Map<number, { key: string; url: string }>();

  /** The species' portrait as an image URL, redrawn only when its body actually changes. */
  picture(sp: Species): string {
    const g = sp.genome;
    const r = (v: number, k = 10) => Math.round(v * k);
    const key = [sp.desc, g.tier, g.diet, g.habitat, r(g.size, 2), r(g.tempOpt, 0.2), r(g.moistOpt), r(g.horns), r(g.armor), r(g.speed), r(g.grasp), r(g.fur), r(g.flight), r(g.social), r(g.intel), r(g.toxin)].join('|');
    const hit = this.pictures.get(sp.id);
    if (hit && hit.key === key) return hit.url;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portrait(g, sp.hue, sp.id + 1))}`;
    this.pictures.set(sp.id, { key, url });
    return url;
  }

  // -------------------------------------------------------------------------
  // The place inspector
  // -------------------------------------------------------------------------

  private siteForecast: { key: string; f: Forecast | null } = { key: '', f: null };

  /** The cells the inspector looks at: a named region, or a circle around the clicked spot. */
  private placeCells(pl: { cell: number; radius: number }): number[] {
    const sim = this.game.sim;
    if (pl.radius < 0) return sim.regions[sim.regionOf[pl.cell]].cells;
    const cells: number[] = [];
    sim.forRadius(pl.cell, pl.radius ? pl.radius + 0.5 : 0, (c) => cells.push(c));
    return cells;
  }

  private renderSite(): void {
    const g = this.game;
    const el = $('site');
    const pl = g.place;
    if (!pl || !g.sim) {
      el.style.display = 'none';
      return;
    }
    const sim = g.sim;
    const w = sim.world;
    const region = sim.regions[sim.regionOf[pl.cell]];
    const cells = this.placeCells(pl);
    const tot = new Map<Species, number>();
    const biomes = new Map<string, number>();
    let t = 0;
    let ph = 0;
    let rain = 0;
    let land = 0;
    let forest = 0;
    let grass = 0;
    for (const c of cells) {
      for (const sp of sim.alive) {
        const p = sim.pop[c * MAXS + sp.slot];
        if (p > 0.05) tot.set(sp, (tot.get(sp) ?? 0) + p);
      }
      const b = w.biomeName(c);
      biomes.set(b, (biomes.get(b) ?? 0) + 1);
      t += w.temp[c];
      ph += w.ph[c];
      if (!w.isWater[c]) {
        land++;
        rain += w.moist[c];
        forest += Math.min(1, w.canopy[c]);
        grass += Math.min(1, w.cover[c]) * (1 - Math.min(1, w.canopy[c]));
      }
    }
    const n = cells.length;
    const topBiomes = [...biomes.entries()].sort((a, b) => b[1] - a[1]);
    const y = Math.floor(pl.cell / W);
    const lat = (0.5 - (y + 0.5) / H) * 180;
    const title = pl.radius < 0 ? region.name : topBiomes[0][0];
    const sub =
      pl.radius < 0
        ? `${topBiomes
            .slice(0, 2)
            .map(([b, k]) => `${b} ${Math.round((k / n) * 100)}%`)
            .join(', ')} · ${(n * 62500).toLocaleString('en-US')} km²`
        : `${region.name} · ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} · about ${(pl.radius * 2 + 1) * 250} km across`;

    // the living things, grouped the way a naturalist would
    const animals = [...tot.keys()].filter((sp) => sp.kind === 'animal');
    const plants = [...tot.keys()].filter((sp) => sp.kind === 'plant');
    const groups: [string, Species[]][] = [
      ['Hunters', animals.filter((sp) => sp.genome.diet === 'carn')],
      ['Plant-eaters & foragers', animals.filter((sp) => sp.genome.diet !== 'carn')],
      [w.isWater[pl.cell] && pl.radius >= 0 ? 'Kelp & tall seaweed' : 'Trees & tall plants', plants.filter((sp) => sp.derived.tall > 0.3)],
      ['Grass, herbs, moss & algae', plants.filter((sp) => sp.derived.tall <= 0.3)],
      ['Microbes', [...tot.keys()].filter((sp) => sp.kind === 'microbe')],
    ];
    let list = '';
    for (const [name, sps] of groups) {
      if (!sps.length) continue;
      sps.sort((a, b) => tot.get(b)! - tot.get(a)!);
      const max = Math.log10(1 + tot.get(sps[0])!);
      list += `<div class="site-head">${name} · ${sps.length}</div>`;
      for (const sp of sps) {
        const p = tot.get(sp)!;
        list += `<div class="site-sp${sp.id === g.selectedId ? ' on' : ''}" data-sp="${sp.id}">
          <img src="${this.picture(sp)}" alt="" />
          <span class="nm"><i>${sp.name}</i><small>${sp.desc} · ${formatMass(sp.genome.size)} · ${formatHeadcount(p, sp.genome.size)}</small></span>
          <span class="bar"><span style="width:${Math.max(6, (Math.log10(1 + p) / max) * 100)}%;background:rgb(${sp.color.join(',')})"></span></span>
        </div>`;
      }
    }
    if (!list) list = '<div class="site-empty">Nothing lives here. Yet.</div>';

    // the land itself
    let veg = '';
    if (land) {
      const f = (forest / land) * 100;
      const gr = (grass / land) * 100;
      const bare = Math.max(0, 100 - f - gr);
      veg = `<div class="site-veg" title="Forest ${Math.round(f)}% · grass and herbs ${Math.round(gr)}% · bare ${Math.round(bare)}%">
        <span style="width:${f}%;background:#2f6b3a"></span><span style="width:${gr}%;background:#a8b84f"></span><span style="width:${bare}%;background:#8a7a62"></span>
      </div><div class="site-veg-key"><span>🌳 ${Math.round(f)}% forest</span><span>🌾 ${Math.round(gr)}% grass & herbs</span><span>🪨 ${Math.round(bare)}% bare</span></div>`;
    }
    const facts: [string, string][] = [
      ['🌡️', `${(t / n).toFixed(1)} °C`],
      ['🧪', `pH ${(ph / n).toFixed(1)}`],
    ];
    if (land) facts.push(['💧', `${Math.round((rain / land) * 100)} % rain`]);
    if (land < n) facts.push(['🌊', `${Math.round(((n - land) / n) * 100)} % water`]);

    // how would the selected species fare here?
    const sel = sim.species[g.selectedId];
    let fit = '';
    if (sel?.alive) {
      const key = `${sel.id}|${pl.cell}|${pl.radius}|${Math.floor(sim.tick / 10)}|${sel.genome.size}`;
      if (this.siteForecast.key !== key) this.siteForecast = { key, f: sim.forecast(sel.genome, cells, sel, 8) };
      const fc = this.siteForecast.f!;
      const here = tot.get(sel) ?? 0;
      const share = sel.totalPop > 0 ? here / sel.totalPop : 0;
      fit = `<div class="site-fit">
        <div><span class="stars">${'★'.repeat(fc.stars)}${'☆'.repeat(5 - fc.stars)}</span> for <i>${sel.name}</i>${share > 0.005 ? ` <small>(${Math.round(share * 100)}% of them live here)</small>` : ''}</div>
        <small>${fc.notes.join(' · ') || 'nothing in particular stands in its way'}</small>
        ${fc.stars >= 1 && fc.bestCell >= 0 && share < 0.5 ? `<button data-site="bring">🕊️ Bring a band of them here (${sim.price(20)}⚡)</button>` : ''}
      </div>`;
    }

    const old = el.querySelector('.site-list');
    const scroll = old ? old.scrollTop : 0;
    el.style.display = 'flex';
    el.innerHTML = `
      <div class="site-top">
        <div><h4>${title}</h4><div class="sub">${sub}</div></div>
        <button class="x" data-site="close" title="Close (Esc)">×</button>
      </div>
      <div class="site-scope">${[
        [-1, 'Region'],
        [3, 'Area'],
        [0, 'Spot'],
      ]
        .map(([r, name]) => `<button data-scope="${r}" class="${pl.radius === r ? 'on' : ''}">${name}</button>`)
        .join('')}</div>
      ${veg}
      <div class="site-facts">${facts.map(([i, v]) => `<span>${i} ${v}</span>`).join('')}</div>
      ${fit}
      <div class="site-go"><button data-go="${pl.radius < 0 ? 4 : 6}">🔭 ${pl.radius < 0 ? 'View the region' : 'Walk the landscape'}</button><button data-go="11">🔎 Up close</button></div>
      <div class="site-list">${list}</div>`;
    const nl = el.querySelector('.site-list');
    if (nl) nl.scrollTop = scroll;
  }

  private onSiteClick(e: PointerEvent): void {
    const g = this.game;
    const sim = g.sim;
    const t = e.target as HTMLElement;
    const pl = g.place;
    if (!pl) return;
    if (t.closest('[data-site="close"]')) g.setPlace(null);
    else if (t.closest('[data-site="bring"]')) {
      const sel = sim.species[g.selectedId];
      const fc = this.siteForecast.f;
      if (sel?.alive && fc && fc.bestCell >= 0) {
        const res = usePower(sim, 'transplant', fc.bestCell, sel);
        this.toast(res.ok ? `A band of ${sel.name} is set down in ${sim.regions[sim.regionOf[fc.bestCell]].name}.` : res.msg, !res.ok);
        this.siteForecast.key = '';
      }
    } else if (t.closest<HTMLElement>('[data-scope]')) g.setPlace(pl.cell, Number(t.closest<HTMLElement>('[data-scope]')!.dataset.scope));
    else if (t.closest<HTMLElement>('[data-go]')) g.focus(pl.radius < 0 ? this.regionCentre(pl.cell) : pl.cell, Number(t.closest<HTMLElement>('[data-go]')!.dataset.go));
    else if (t.closest<HTMLElement>('[data-sp]')) g.select(Number(t.closest<HTMLElement>('[data-sp]')!.dataset.sp));
    else return;
    this.refresh(performance.now(), true);
  }

  /** The cell at the middle of the region a cell belongs to. */
  private regionCentre(cell: number): number {
    const sim = this.game.sim;
    const r = sim.regions[sim.regionOf[cell]];
    const c = Math.floor(r.cy) * W + (Math.floor(r.cx) % W);
    return sim.regionOf[c] === r.id ? c : cell;
  }

  // -------------------------------------------------------------------------
  // Where to? and the mutation lab
  // -------------------------------------------------------------------------

  private stars(n: number): string {
    return `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
  }

  /** Every region of the world, ranked by how well this species would do there as a newcomer. */
  showWhere(sp: Species): void {
    const g = this.game;
    const sim = g.sim;
    const cache = new Map<number, ReturnType<Sim['community']>>();
    const home = new Map<number, number>();
    for (const r of sim.regions) {
      let p = 0;
      for (const c of r.cells) p += sim.pop[c * MAXS + sp.slot];
      if (p > 0) home.set(r.id, p);
    }
    const rows = sim.regions
      .map((r) => ({ r, f: sim.forecast(sp.genome, r.cells, sp, 6, cache), share: (home.get(r.id) ?? 0) / Math.max(1e-9, sp.totalPop) }))
      .filter((x) => x.f.habitable > 0)
      .sort((a, b) => b.f.growth - a.f.growth);
    const good = rows.filter((x) => x.share < 0.02).slice(0, 10);
    const now = rows.filter((x) => x.share >= 0.02).sort((a, b) => b.share - a.share).slice(0, 5);
    const row = (x: (typeof rows)[number]) => `<div class="where-row">
        ${this.stars(x.f.stars)}
        <div class="wr-name"><b>${x.r.name}</b><small>${x.f.notes.join(' · ') || 'nothing stands in its way'}${x.share >= 0.02 ? ` · ${Math.round(x.share * 100)}% of them live here` : ''}</small></div>
        <button class="secondary" data-fly="${x.r.id}">🔭 Look</button>
        ${x.share < 0.5 && x.f.stars >= 1 ? `<button class="secondary" data-bring="${x.r.id}" data-cell="${x.f.bestCell}">🕊️ Bring (${sim.price(20)}⚡)</button>` : '<span></span>'}
      </div>`;
    const m = this.openModal(
      `<div class="card wide">
        <div class="stat-head"><img src="${this.picture(sp)}" alt="" /><div><h2>🧭 Where could <i>${sp.name}</i> thrive?</h2><div class="sub">Every region scored for a band of newcomers: climate, food, rivals and hunters, as things stand now. ★★★ or more means they should take hold.</div></div><button class="secondary" id="close">Close</button></div>
        <h3>Best new homes</h3>${good.map(row).join('') || '<div class="site-empty">Nowhere new would welcome it right now.</div>'}
        <h3>Where it lives now</h3>${now.map(row).join('') || '<div class="site-empty">Too few to call any region home.</div>'}
      </div>`,
      true,
    );
    m.querySelector('#close')!.addEventListener('click', () => this.forceClose());
    m.querySelectorAll<HTMLElement>('[data-fly]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = sim.regions[Number(b.dataset.fly)];
        this.forceClose();
        const c = this.regionCentre(r.cells[0]);
        g.setPlace(c, -1);
        g.focus(c, 4);
      }),
    );
    m.querySelectorAll<HTMLElement>('[data-bring]').forEach((b) =>
      b.addEventListener('click', () => {
        const cell = Number(b.dataset.cell);
        const res = usePower(sim, 'transplant', cell, sp);
        this.toast(res.ok ? `A band of ${sp.name} is set down in ${sim.regions[Number(b.dataset.bring)].name}.` : res.msg, !res.ok);
        if (res.ok) {
          this.forceClose();
          g.setPlace(cell, -1);
          g.focus(cell, 5);
        }
      }),
    );
  }

  /** Design a mutant, see how it would fare against its parent across the world, and choose where it starts. */
  showLab(sp: Species): void {
    const g = this.game;
    const sim = g.sim;
    const orig = sp.genome;
    const draft: Genome = { ...orig };
    const cache = new Map<number, ReturnType<Sim['community']>>();
    const homeCell = sim.densestCell(sp);
    const homeRegion = sim.regions[sim.regionOf[Math.max(0, homeCell)]];
    let release = homeRegion.id;
    let shelter = true;
    const parentF = new Map<number, Forecast>();
    for (const r of sim.regions) parentF.set(r.id, sim.forecast(orig, r.cells, sp, 5, cache));
    type Key = GuideKey | 'tempOpt' | 'moistOpt';
    const STEP: Partial<Record<Key, number>> = { size: 0.5, tempOpt: 3, moistOpt: 0.08 };
    const keys: Key[] = ['size', ...TRAIT_KEYS.filter((k) => traitCap(orig, k) > 0 || orig[k] > 0.01), 'tempOpt'];
    if (orig.habitat !== 'aquatic') keys.push('moistOpt');
    const labelOf = (k: Key) => (k === 'tempOpt' ? { icon: '🌡️', label: 'Prefers warmth' } : k === 'moistOpt' ? { icon: '💧', label: 'Prefers rain' } : traitInfo(draft, k));
    const fmt = (k: Key, v: number) => (k === 'tempOpt' ? `${Math.round(v)} °C` : k === 'moistOpt' ? `${Math.round(v * 100)}%` : k === 'size' ? formatMass(v) : `${Math.round(v * 100)}`);
    const frac = (k: Key, v: number) => (k === 'tempOpt' ? (v + 25) / 95 : k === 'size' ? v / 10 : v);
    const steps = () => keys.reduce((s, k) => s + Math.round(Math.abs(draft[k] - orig[k]) / (STEP[k] ?? 0.1)), 0);
    const cost = () => sim.price(GUIDE_COST + 6 * Math.max(0, steps() - 1) + (shelter ? 15 : 0));

    const m = this.openModal(
      `<div class="card wide labcard">
        <div class="stat-head"><img id="lab-pic" src="${this.picture(sp)}" alt="" /><div><h2>🧪 Mutation lab: <i>${sp.name}</i></h2><div class="sub" id="lab-desc"></div></div><button class="secondary" id="close">Close</button></div>
        <div class="lab-grid">
          <div><h3>Change its genes</h3><div id="lab-traits"></div></div>
          <div><h3>How would it fare?</h3><div id="lab-fore"></div></div>
        </div>
        <div class="lab-foot">
          <label><input type="checkbox" id="lab-shelter" checked /> Shelter it for 60 steps: nothing may eat it and rivals press it less while it settles</label>
          <span id="lab-where"></span>
          <button class="primary" id="lab-go"></button>
        </div>
      </div>`,
      true,
    );
    const draw = () => {
      sanitize(draft);
      const d = describe(draft);
      m.querySelector('#lab-desc')!.innerHTML = steps() ? `The mutant would be: <b>${d.icon} ${d.desc}</b> · ${steps()} change${steps() > 1 ? 's' : ''}` : 'Use − and + to change its genes. Several changes can go into one mutant.';
      (m.querySelector('#lab-pic') as HTMLImageElement).src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(portrait(draft, sp.hue, sp.id + 1))}`;
      m.querySelector('#lab-traits')!.innerHTML = keys
        .map((k) => {
          const L = labelOf(k);
          const a = frac(k, orig[k]);
          const b = frac(k, draft[k]);
          const changed = Math.abs(draft[k] - orig[k]) > 1e-6;
          return `<div class="lab-row${changed ? ' changed' : ''}"><span>${L.icon}</span><span>${L.label}</span>
            <span class="lab-bar"><span class="was" style="width:${Math.max(0, Math.min(1, a)) * 100}%"></span><span class="now" style="width:${Math.max(0, Math.min(1, b)) * 100}%"></span></span>
            <span class="lab-val">${fmt(k, draft[k])}</span>
            <button data-k="${k}" data-d="-1">−</button><button data-k="${k}" data-d="1">+</button></div>`;
        })
        .join('');
      // forecasts for the mutant everywhere, compared with its parent (which is its closest rival)
      const rows = sim.regions
        .map((r) => ({ r, p: parentF.get(r.id)!, f: steps() ? sim.forecast(draft, r.cells, null, 5, cache) : parentF.get(r.id)! }))
        .filter((x) => x.f.habitable > 0 || x.r.id === homeRegion.id);
      const home = rows.find((x) => x.r.id === homeRegion.id)!;
      const best = rows.filter((x) => x.r.id !== homeRegion.id).sort((a, b) => b.f.growth - a.f.growth).slice(0, 6);
      const line = (x: (typeof rows)[number], tag: string) => `<div class="lab-fore-row${release === x.r.id ? ' on' : ''}" data-rel="${x.r.id}">
          <div class="wr-name"><b>${tag}${x.r.name}</b><small>${x.f.notes.join(' · ') || 'nothing stands in its way'}</small></div>
          <span title="The parent species">${this.stars(x.p.stars)}</span><span>→</span><span title="The mutant">${this.stars(x.f.stars)}</span>
        </div>`;
      m.querySelector('#lab-fore')!.innerHTML = `<div class="lab-legend"><span>parent</span><span>mutant</span></div>${line(home, '🏠 ')}<div class="site-head">Best places for the mutant · click to release it there</div>${best.map((x) => line(x, '')).join('')}`;
      m.querySelector('#lab-where')!.textContent = `Release in ${sim.regions[release].name}`;
      const btn = m.querySelector<HTMLButtonElement>('#lab-go')!;
      btn.textContent = `Create the mutant (${cost()}⚡)`;
      btn.disabled = steps() === 0 || !(sim.sandbox || sim.energy >= cost());
      m.querySelectorAll<HTMLElement>('[data-rel]').forEach((r) =>
        r.addEventListener('click', () => {
          release = Number(r.dataset.rel);
          draw();
        }),
      );
    };
    m.querySelector('#lab-traits')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (!b) return;
      const k = b.dataset.k as Key;
      draft[k] += Number(b.dataset.d) * (STEP[k] ?? 0.1);
      this.game.sound.play('click');
      draw();
    });
    m.querySelector('#lab-shelter')!.addEventListener('change', (e) => {
      shelter = (e.target as HTMLInputElement).checked;
      draw();
    });
    m.querySelector('#close')!.addEventListener('click', () => this.forceClose());
    m.querySelector('#lab-go')!.addEventListener('click', () => {
      const price = cost();
      if (!sim.sandbox && sim.energy < price) return this.toast('Not enough divine energy.', true);
      const r = sim.regions[release];
      const fc = sim.forecast(draft, r.cells, null, 10, cache);
      const cell = fc.bestCell >= 0 ? fc.bestCell : r.cells.find((c) => habFactors(draft)[sim.world.cls[c]] > 0.02) ?? -1;
      if (cell < 0) return this.toast('The mutant could not live anywhere in that region.', true);
      const child = sim.createMutant(sp, { ...draft }, cell, shelter ? 60 : 0);
      if (!child) return this.toast('The world has no room for another species right now.', true);
      if (!sim.sandbox) sim.energy -= price;
      const changes = keys.filter((k) => Math.abs(draft[k] - orig[k]) > 1e-6).map((k) => `${draft[k] > orig[k] ? 'more' : 'less'} ${labelOf(k).label.toLowerCase()}`);
      sim.log('🧬', `In your laboratory ${sp.name} gives rise to ${child.name} (${changes.join(', ')}), released in ${r.name}${shelter ? ' under your protection' : ''}.`, { speciesId: child.id, cell });
      this.forceClose();
      g.select(child.id);
      g.setFollow(child.id);
    });
    draw();
  }

  // -------------------------------------------------------------------------
  // The field guide
  // -------------------------------------------------------------------------

  /** The life story of a species in numbers: its spread, its killers, its predators and its diet. */
  showStats(sp: Species): void {
    const g = this.game;
    const sim = g.sim;
    const gn = sp.genome;

    // growth and spread over time
    const pop = sp.history;
    const range = sp.rangeHistory;
    let chart = '<div class="site-empty">Too young to have a history yet.</div>';
    if (pop.length >= 3) {
      const W = 640;
      const H = 170;
      const x0 = 46;
      const x1 = W - 46;
      const y0 = 12;
      const y1 = H - 26;
      const n = pop.length;
      const maxP = Math.max(...pop, 1e-6);
      const maxR = Math.max(...range, 1);
      const X = (i: number) => x0 + ((x1 - x0) * i) / (n - 1);
      const pts = pop.map((v, i) => `${X(i).toFixed(1)},${(y1 - (v / maxP) * (y1 - y0)).toFixed(1)}`);
      const rpts = range.map((v, i) => `${X(i).toFixed(1)},${(y1 - (v / maxR) * (y1 - y0)).toFixed(1)}`);
      const col = `rgb(${sp.color.join(',')})`;
      let axis = '';
      for (let k = 0; k <= 4; k++) {
        const i = Math.round(((n - 1) * k) / 4);
        const year = yearAt(sp.historyStart + i * HIST_EVERY);
        axis += `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${Math.round(year / 1000).toLocaleString('en-US')}k yr</text><line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${y0}" y2="${y1}" stroke="#ffffff" stroke-opacity="0.06"/>`;
      }
      chart = `<svg class="stat-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${axis}
        <polyline points="${x0},${y1} ${pts.join(' ')} ${x1},${y1}" fill="${col}" fill-opacity="0.22" stroke="none"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="2"/>
        <polyline points="${rpts.join(' ')}" fill="none" stroke="#4fd1c5" stroke-width="1.6" stroke-dasharray="5 3"/>
        <text x="${x0 - 6}" y="${y0 + 8}" text-anchor="end">${formatHeadcount(maxP, gn.size)}</text>
        <text x="${x1 + 6}" y="${y0 + 8}" fill="#4fd1c5">${maxR}</text>
      </svg>
      <div class="stat-legend"><span><i style="background:${col}"></i>Numbers (peak ${formatHeadcount(sp.peakPop, gn.size)})</span><span><i class="dash"></i>Range in map squares (each about 250 km across)</span></div>`;
    }
    const reached = sp.reached.length
      ? `<div class="stat-reach">${sp.reached.map((r, i) => `${i ? '→ ' : ''}<b>${r.name}</b> <small>year ${num(r.year)}</small>`).join(' ')}</div>`
      : gn.habitat === 'aquatic'
        ? '<div class="stat-reach">Lives in the sea.</div>'
        : '';

    // what killed them
    const L = sp.losses;
    const causes: [string, number, string][] = [
      ['Eaten by hunters', L.hunted, '#ef6461'],
      ['Eaten by grazers', L.grazed, '#e8a33a'],
      ['Hunger, crowding & harsh climate', L.hunger, '#8794b3'],
      ['Plague', L.plague, '#b55bd1'],
      ['Fire', L.fire, '#ff8a3a'],
      ['Volcanoes & impacts', L.disaster, '#c94a2a'],
    ];
    const totalLoss = causes.reduce((a, c) => a + c[1], 0);
    const killed = totalLoss > 0
      ? `<div class="stat-bar">${causes.filter((c) => c[1] / totalLoss > 0.004).map((c) => `<span style="width:${((c[1] / totalLoss) * 100).toFixed(1)}%;background:${c[2]}" title="${c[0]} ${Math.round((c[1] / totalLoss) * 100)}%"></span>`).join('')}</div>
        <div class="stat-causes">${causes.filter((c) => c[1] / totalLoss > 0.004).map((c) => `<span><i style="background:${c[2]}"></i>${c[0]} <b>${Math.round((c[1] / totalLoss) * 100)}%</b></span>`).join('')}</div>`
      : '<div class="site-empty">Nothing has killed any of them yet.</div>';
    const fate = !sp.alive
      ? `<p class="stat-fate">💀 Died out in year ${num(sp.diedYear)}: ${sp.deathCause || 'unknown'}.</p>`
      : sp.declineReason && sp.totalPop < 0.55 * sp.peakPop
        ? `<p class="stat-fate">⚠ Declining: ${sp.declineReason}.</p>`
        : '';

    // who ate it, and what it ate
    const table = (m: Map<number, number>, empty: string) => {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      if (total <= 0) return `<div class="site-empty">${empty}</div>`;
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([id, v]) => {
          const o = sim.species[id];
          const share = v / total;
          return `<div class="site-sp" data-stat-sp="${id}"><img src="${this.picture(o)}" alt="" /><span class="nm"><i>${o.name}${o.alive ? '' : ' †'}</i><small>${o.desc}</small></span><span class="pct">${share >= 0.01 ? Math.round(share * 100) : '<1'}%</span></div>`;
        })
        .join('');
    };
    const diet = sp.derived.auto
      ? `<div class="site-empty">Makes its own food ${gn.diet === 'photo' ? 'from sunlight, water and carbon dioxide' : 'from the minerals of the hot vents'}.</div>`
      : table(sp.ate, 'It has not eaten anything yet.');

    const m = this.openModal(
      `<div class="card wide statcard">
        <div class="stat-head">
          <img src="${this.picture(sp)}" alt="" />
          <div><h2><i>${sp.name}</i></h2><div>${sp.desc} · ${TIER_NAMES[gn.tier]} · ${DIET_NAMES[gn.diet]}</div>
          <div class="sub">${sp.alive ? `${formatHeadcount(sp.totalPop, gn.size)} alive in ${sp.cells} squares` : 'Extinct'} · appeared year ${num(sp.bornYear)}</div></div>
          <button class="secondary" id="close">Close</button>
        </div>
        <h3>Growth and spread</h3>
        ${chart}${reached}
        <h3>What killed them</h3>
        ${fate}${killed}
        <div class="stat-cols">
          <div><h3>Eaten by</h3>${table(sp.eatenBy, 'Nothing has eaten it.')}</div>
          <div><h3>What it ate</h3>${diet}</div>
        </div>
      </div>`,
      true,
    );
    m.querySelector('#close')!.addEventListener('click', () => this.forceClose());
    m.querySelectorAll<HTMLElement>('[data-stat-sp]').forEach((row) =>
      row.addEventListener('click', () => {
        const o = sim.species[Number(row.dataset.statSp)];
        g.select(o.id);
        this.showStats(o);
      }),
    );
  }

  showGuide(): void {
    const g = this.game;
    let tab: Kind | 'extinct' = 'animal';
    const m = this.openModal(
      `<div class="card wide">
        <div class="tree-head"><h2>📖 Field guide</h2><span>Every species is drawn from its genes: its body plan, its traits and its home.</span><button class="secondary" id="close">Close</button></div>
        <div class="guide-tabs"></div>
        <div class="guide-grid"></div>
      </div>`,
      true,
    );
    const draw = () => {
      const sim = g.sim;
      const pool = tab === 'extinct' ? sim.species.filter((sp) => !sp.alive && sp.established) : sim.alive.filter((sp) => sp.kind === tab);
      const counts = { animal: 0, plant: 0, microbe: 0 };
      for (const sp of sim.alive) counts[sp.kind]++;
      const extinct = sim.species.filter((sp) => !sp.alive && sp.established).length;
      m.querySelector('.guide-tabs')!.innerHTML = (
        [
          ['animal', `Animals · ${counts.animal}`],
          ['plant', `Plants · ${counts.plant}`],
          ['microbe', `Microbes · ${counts.microbe}`],
          ['extinct', `Extinct · ${extinct}`],
        ] as [string, string][]
      )
        .map(([id, name]) => `<button data-gtab="${id}" class="${tab === id ? 'on' : ''}">${name}</button>`)
        .join('');
      const sorted = pool.sort((a, b) => (tab === 'extinct' ? b.diedTick - a.diedTick : b.totalPop - a.totalPop)).slice(0, 120);
      m.querySelector('.guide-grid')!.innerHTML =
        sorted
          .map(
            (sp) => `<button class="gcard${sp.id === g.selectedId ? ' on' : ''}" data-gsp="${sp.id}">
              <img src="${this.picture(sp)}" alt="" />
              <i>${sp.name}</i><span>${sp.desc}</span>
              <small>${sp.alive ? `${formatHeadcount(sp.totalPop, sp.genome.size)} · ${formatMass(sp.genome.size)}` : `year ${num(sp.bornYear)} – ${num(sp.diedYear)}`}</small>
              ${!sp.alive && sp.deathCause ? `<small class="warn">💀 ${sp.deathCause}</small>` : sp.alive && sp.declineReason && sp.totalPop < 0.55 * sp.peakPop ? `<small class="warn">⚠ ${sp.declineReason}</small>` : ''}
            </button>`,
          )
          .join('') || '<div class="site-empty">None.</div>';
    };
    draw();
    m.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tb = t.closest<HTMLElement>('[data-gtab]');
      if (tb) {
        tab = tb.dataset.gtab as Kind | 'extinct';
        draw();
        return;
      }
      const card = t.closest<HTMLElement>('[data-gsp]');
      if (card) {
        g.select(Number(card.dataset.gsp));
        this.forceClose();
      }
    });
    m.querySelector('#close')!.addEventListener('click', () => this.forceClose());
  }

  /** A drawing of how we imagine this species' cells, with its parts and the cell types of its body. */
  showCell(genome: Genome, name: string, desc: string, seed: number): void {
    this.cellViews++;
    const cell = buildCell(genome, seed);
    const m = this.openModal(
      `<div class="card wide cellcard">
        <div class="tree-head"><h2>🔬 Inside <i>${name}</i></h2><span>${desc}</span><button class="secondary" id="close">Close</button></div>
        <div class="cellgrid">
          <div class="cellfig">${cell.svg}<div class="cellcap"><b>${cell.title}</b> · ${cell.subtitle}</div></div>
          <div class="cellinfo">
            <p class="cellintro">${cell.intro}</p>
            <h3>Parts of the cell</h3>
            <div class="parts">${cell.parts.map((pt) => `<div class="part"><span class="sw" style="background:${pt.color}"></span><div><b>${pt.name}</b><span>${pt.desc}</span></div></div>`).join('')}</div>
            ${cell.tissues.length ? `<h3>Cells that build the body</h3><div class="tissues">${cell.tissues.map((t) => `<div class="tissue"><span class="ti">${t.icon}</span><div><b>${t.name}</b><span>${t.desc}</span></div></div>`).join('')}</div>` : '<h3>One cell is the whole creature</h3><p class="cellintro">Everything this species does, it does inside the single cell you see.</p>'}
          </div>
        </div>
        <div class="cellfoot"><span>Compare with</span>${CELL_EXAMPLES.map((e) => `<button class="secondary" data-ex="${e.id}" title="${e.desc}">${e.icon} ${e.name}</button>`).join('')}</div>
      </div>`,
      true,
    );
    m.querySelector('#close')!.addEventListener('click', () => this.forceClose());
    m.querySelectorAll<HTMLElement>('[data-ex]').forEach((b) =>
      b.addEventListener('click', () => {
        const ex = CELL_EXAMPLES.find((e) => e.id === b.dataset.ex)!;
        this.showCell(ex.genome, ex.name, ex.desc, CELL_EXAMPLES.indexOf(ex) + 1);
      }),
    );
  }

  showTree(): void {
    const g = this.game;
    const m = this.openModal(
      `<div class="card wide">
        <div class="tree-head"><h2>Tree of Life</h2><span>Time runs left to right. Click a branch to select that species. Short-lived twigs are left out.</span><button class="secondary" id="close">Close</button></div>
        <div id="treewrap"><canvas id="treecanvas"></canvas></div>
      </div>`,
      true,
    );
    const canvas = m.querySelector<HTMLCanvasElement>('#treecanvas')!;
    const wrap = m.querySelector<HTMLElement>('#treewrap')!;
    const draw = () => {
      this.tree = { canvas, layout: drawTree(canvas, g.sim, g.selectedId, Math.max(700, wrap.clientWidth - 24)) };
    };
    draw();
    canvas.addEventListener('click', (e) => {
      if (!this.tree) return;
      const sp = treeHit(this.tree.layout, e.offsetY);
      if (sp) {
        g.select(sp.id);
        draw();
        this.refresh(performance.now(), true);
      }
    });
    m.querySelector('#close')!.addEventListener('click', () => {
      if (g.sim.status !== 'running' && !this.resumeAfterModal) this.resumeAfterModal = true;
      this.forceClose();
    });
  }
}

