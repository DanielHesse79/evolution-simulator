import { DIET_NAMES, HABITAT_NAMES, TIER_NAMES, TRAIT_INFO, TRAIT_KEYS, formatHeadcount, formatMass, traitCap, type Kind } from '../sim/genome';
import { GUIDE_COST, POWERS, canGuide, guideEvolution, usePower, type GuideKey, type PowerId } from '../sim/powers';
import { GOALS, MAXS, MAX_ENERGY, Sim, TOTAL_TICKS, yearAt, type AtmKey, type GoalId } from '../sim/simulation';
import type { Genome } from '../sim/genome';
import type { Species } from '../sim/species';
import { CELL_EXAMPLES, buildCell } from './cell';
import { portrait } from './portrait';
import { tutorialSeen } from './tutorial';
import { N } from '../sim/world';
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
  start(seed: number, goal: GoalId, tutorial: boolean): void;
  startTutorial(): void;
  focus(cell: number, zoom?: number): void;
  /** The place being inspected on the map, and how far around it to look. */
  place: { cell: number; radius: number } | null;
  setPlace(cell: number | null, radius?: number): void;
  goTo(zoom: number): void;
  markDirty(): void;
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
    $('layers').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-layer]');
      if (b) g.setLayer(b.dataset.layer as Layer);
    });

    const tabs: [Tab, string][] = [
      ['all', 'All'],
      ['animal', 'Animals'],
      ['plant', 'Plants'],
      ['microbe', 'Microbes'],
    ];
    $('tabs').innerHTML = tabs.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join('');
    $('tabs').addEventListener('click', (e) => {
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
    $('goal').innerHTML = `<div class="lbl"><span>${goal.icon} ${goal.name}</span><span>${prog.label}</span></div><div class="meter"><div style="width:${prog.value * 100}%"></div></div>`;
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

    // layers
    $('layers')
      .querySelectorAll<HTMLElement>('[data-layer]')
      .forEach((b) => b.classList.toggle('on', b.dataset.layer === g.renderer.layer));
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
    $('powerhint').innerHTML = `<b>${p.icon} ${p.name}</b>${p.cost ? ` · ${p.cost}⚡` : ''}<br>${p.hint}`;
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
      const list = sim.alive.filter((s) => s.kind === kind).sort((a, b) => b.totalPop - a.totalPop);
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
    } else facts.push(['Vanished', `year ${num(sp.diedYear)}`]);
    facts.push(['Body', `about ${formatMass(gn.size)}`]);
    let comfort = `${Math.round(gn.tempOpt - gn.tempTol)} to ${Math.round(gn.tempOpt + gn.tempTol)} °C · pH ${(gn.phOpt - gn.phTol).toFixed(1)}–${(gn.phOpt + gn.phTol).toFixed(1)}`;
    if (gn.habitat !== 'aquatic') comfort += ` · rain ${Math.round(Math.max(0, gn.moistOpt - gn.moistTol) * 100)}–${Math.round(Math.min(1, gn.moistOpt + gn.moistTol) * 100)} %`;
    facts.push(['Comfort', comfort]);

    const rows: string[] = [];
    const traitRow = (key: GuideKey, icon: string, label: string, hint: string, frac: number) => {
      const open = (dir: 1 | -1) => sp.alive && (canGuide(sp, key, dir) || (key === 'intel' && dir > 0 && gn.tier === 4 && gn.intel < 0.98));
      const btn = (dir: 1 | -1) => `<button data-guide="${key}" data-dir="${dir}" ${open(dir) ? '' : 'disabled'} title="Guide evolution: ${dir > 0 ? 'more' : 'less'} (${GUIDE_COST}⚡)">${dir > 0 ? '+' : '−'}</button>`;
      rows.push(`<div class="trait" title="${hint}"><span>${icon}</span><span>${label}</span><span class="tb"><span style="width:${Math.round(frac * 100)}%"></span></span>${btn(-1)}${btn(1)}</div>`);
    };
    traitRow('size', '⚖️', 'Body size', 'Bigger bodies escape small predators and overtop rivals, but breed slowly and need more oxygen and water.', gn.size / 10);
    for (const k of TRAIT_KEYS) {
      if (traitCap(gn, k) <= 0 && gn[k] <= 0.01) continue;
      traitRow(k, TRAIT_INFO[k].icon, TRAIT_INFO[k].label, TRAIT_INFO[k].hint, gn[k]);
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
      ${sp.alive ? `<div class="guide-note">＋/− guides evolution: a daughter species with the change is born (${GUIDE_COST}⚡). Selection decides whether she lasts.</div>` : ''}
      <div class="d-actions">
        ${sp.alive ? '<button data-act="locate" title="Fly to where it is most numerous and zoom in">📍 Locate</button>' : ''}
        <button data-act="cell" title="See how its cells are built">🔬 Cell</button>
        ${sp.alive ? '<button data-act="plague" title="Unleash a virus where it is most numerous (25⚡)">🦠 Plague</button><button data-act="ark" title="Carry a founding population elsewhere (20⚡)">🕊️ Ark</button>' : ''}
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
    else if (act === 'cell' && sp) {
      this.showCell(sp.genome, sp.name, sp.desc, sp.id);
      return;
    } else if (!sp?.alive) return;
    else if (act === 'locate') g.focus(sim.densestCell(sp)); else if (act === 'plague') {
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
        this.game.start(n, goal, tour);
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
    const cells: number[] = [];
    sim.forRadius(pl.cell, pl.radius ? pl.radius + 0.5 : 0, (c) => cells.push(c));
    const tot = new Map<Species, number>();
    const biomes = new Map<string, number>();
    let t = 0;
    let ph = 0;
    let min = 0;
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
      min += w.minerals[c];
      if (!w.isWater[c]) {
        land++;
        rain += w.moist[c];
        forest += w.canopy[c];
        grass += w.cover[c];
      }
    }
    const n = cells.length;
    const biome = [...biomes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const y = Math.floor(pl.cell / 160);
    const lat = (0.5 - (y + 0.5) / 90) * 180;
    const where = w.isWater[pl.cell] ? 'Open sea' : w.continentName(pl.cell);
    const km = pl.radius ? (pl.radius * 2 + 1) * 250 : 250;

    const groups: [string, Species[]][] = [
      ['Animals', [...tot.keys()].filter((sp) => sp.kind === 'animal')],
      ['Plants', [...tot.keys()].filter((sp) => sp.kind === 'plant')],
      ['Microbes', [...tot.keys()].filter((sp) => sp.kind === 'microbe')],
    ];
    let list = '';
    for (const [title, sps] of groups) {
      if (!sps.length) continue;
      sps.sort((a, b) => tot.get(b)! - tot.get(a)!);
      const max = Math.log10(1 + tot.get(sps[0])!);
      list += `<div class="site-head">${title} · ${sps.length}</div>`;
      for (const sp of sps) {
        const p = tot.get(sp)!;
        list += `<div class="site-sp${sp.id === g.selectedId ? ' on' : ''}" data-sp="${sp.id}">
          <img src="${this.picture(sp)}" alt="" />
          <span class="nm"><i>${sp.name}</i><small>${sp.desc} · ${formatHeadcount(p, sp.genome.size)}</small></span>
          <span class="bar"><span style="width:${Math.max(6, (Math.log10(1 + p) / max) * 100)}%;background:rgb(${sp.color.join(',')})"></span></span>
        </div>`;
      }
    }
    if (!list) list = '<div class="site-empty">Nothing lives here. Yet.</div>';

    const facts: [string, string][] = [
      ['🌡️', `${(t / n).toFixed(1)} °C`],
      ['🧪', `pH ${(ph / n).toFixed(1)}`],
      ['💎', `${Math.round((min / n) * 100)} % minerals`],
    ];
    if (land) {
      facts.push(['💧', `${Math.round((rain / land) * 100)} % rain`]);
      facts.push(['🌳', `${Math.round((forest / land) * 100)} % forest`]);
      facts.push(['🌾', `${Math.round((grass / land) * 100)} % grass & herbs`]);
    }
    if (land < n) facts.push(['🌊', `${Math.round(((n - land) / n) * 100)} % water`]);

    const old = el.querySelector('.site-list');
    const scroll = old ? old.scrollTop : 0;
    el.style.display = 'flex';
    el.innerHTML = `
      <div class="site-top">
        <div><h4>${biome}</h4><div class="sub">${where} · ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} · about ${km.toLocaleString('en-US')} km across</div></div>
        <button class="x" data-site="close" title="Close (Esc)">×</button>
      </div>
      <div class="site-scope">${[
        [0, 'Spot'],
        [3, 'Area'],
        [8, 'Region'],
      ]
        .map(([r, name]) => `<button data-scope="${r}" class="${pl.radius === r ? 'on' : ''}">${name}</button>`)
        .join('')}</div>
      <div class="site-facts">${facts.map(([i, v]) => `<span>${i} ${v}</span>`).join('')}</div>
      <div class="site-go"><button data-go="6">🌳 Walk the landscape</button><button data-go="11">🔎 Up close</button></div>
      <div class="site-list">${list}</div>`;
    const nl = el.querySelector('.site-list');
    if (nl) nl.scrollTop = scroll;
  }

  private onSiteClick(e: PointerEvent): void {
    const g = this.game;
    const t = e.target as HTMLElement;
    const pl = g.place;
    if (!pl) return;
    if (t.closest('[data-site="close"]')) g.setPlace(null);
    else if (t.closest<HTMLElement>('[data-scope]')) g.setPlace(pl.cell, Number(t.closest<HTMLElement>('[data-scope]')!.dataset.scope));
    else if (t.closest<HTMLElement>('[data-go]')) g.focus(pl.cell, Number(t.closest<HTMLElement>('[data-go]')!.dataset.go));
    else if (t.closest<HTMLElement>('[data-sp]')) g.select(Number(t.closest<HTMLElement>('[data-sp]')!.dataset.sp));
    else return;
    this.refresh(performance.now(), true);
  }

  // -------------------------------------------------------------------------
  // The field guide
  // -------------------------------------------------------------------------

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

