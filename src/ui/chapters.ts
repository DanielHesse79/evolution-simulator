import { ChapterBook, chapterCandidates, type ChapterId, type ChapterRecord } from '../sim/chapters';
import { fmtYear, type Sim } from '../sim/simulation';
import { W, H } from '../sim/world';
import type { Sound } from './audio';
import { CHAPTERS, type Chapter } from './chapter-data';
import { MapRenderer } from './renderer';
import { portrait } from './portrait';
import { speciesNameText } from './species-label';
import './chapters.css';

interface Host { sim(): Sim; sound: Sound; blocked(): boolean }
const preference = (key: string, fallback: boolean) => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === 'true'; } catch { return fallback; }
};
const remember = (key: string, value: boolean) => { try { localStorage.setItem(key, String(value)); } catch { /* private browsing */ } };
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** An isolated presentation layer: never changes populations, the game camera, speed or pause preference. */
export class Chapters {
  readonly dialog = document.createElement('dialog');
  enabled = preference('evo-chapters', true);
  private subtitles = preference('evo-chapter-subtitles', true);
  private voice = preference('evo-chapter-voice', true);
  private book: ChapterBook | null = null;
  private pending: ChapterRecord[] = [];
  private audio: HTMLAudioElement | null = null;
  private current: Chapter | null = null;
  private record: ChapterRecord | null = null;
  private scene: MapRenderer | null = null;
  private toLibrary = false;
  private progress: HTMLProgressElement | null = null;
  private stamp: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private playButton: HTMLButtonElement | null = null;
  private focusBefore: HTMLElement | null = null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private host: Host) {
    this.dialog.className = 'chapter-dialog';
    this.dialog.setAttribute('aria-labelledby', 'chapter-title');
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.finish(); });
    this.dialog.addEventListener('keydown', e => e.stopPropagation());
    this.dialog.addEventListener('close', () => { if (!this.active) this.disposeMedia(); });
  }

  get active(): boolean { return this.dialog.open; }
  get hasPending(): boolean { return this.pending.length > 0 && this.enabled; }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    remember('evo-chapters', enabled);
    if (!enabled) this.pending = [];
  }

  reset(sim: Sim): void {
    this.close();
    const sp = sim.alive[0];
    this.book = new ChapterBook({ speciesId: sp.id, name: sp.name, genome: sp.genome,
      hue: sp.hue, cell: sim.densestCell(sp) });
    this.pending = [];
    if (this.enabled) this.play(this.book.records.get('spark')!, false);
  }

  observe(): void {
    const sim = this.host.sim();
    if (!this.book || sim.tick % 8 || this.book.records.size === CHAPTERS.length) return;
    const records = this.book.observe(chapterCandidates(sim), sim.tick, sim.year);
    for (const record of records) {
      const chapter = CHAPTERS.find(c => c.id === record.id)!;
      sim.log('🎬', `Chapter unlocked: ${chapter.title}. Replay it from Chapters.`, { speciesId: record.speciesId, cell: record.cell });
      if (this.enabled) this.pending.push(record);
    }
  }

  update(now: number): void {
    if (!this.active && !this.host.blocked() && this.hasPending) this.play(this.pending.shift()!, false);
    if (!this.active || !this.scene || !this.audio || !this.current || !this.record) return;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : this.current.duration;
    const seconds = this.audio.currentTime;
    const p = clamp(seconds / duration, 0, 1);
    if (this.progress) { this.progress.max = duration; this.progress.value = seconds; }
    if (this.stamp) this.stamp.textContent = `${time(seconds)} / ${time(duration)}`;
    const smooth = this.reducedMotion.matches ? 0.5 : p * p * (3 - 2 * p);
    const flight = this.current.id === 'flight';
    const startZoom = this.current.id === 'spark' ? 1.1 : flight ? 7 : 4;
    this.scene.zoom = flight ? startZoom - smooth * 3 : startZoom + smooth * 2.5;
    const halfW = W / this.scene.zoom / 2, halfH = H / this.scene.zoom / 2;
    this.scene.cx = clamp(this.record.cell % W + 0.5, halfW, W - halfW);
    this.scene.cy = clamp(Math.floor(this.record.cell / W) + 0.5 - (flight ? smooth * 4 : 0), halfH, H - halfH);
    this.scene.renderView(this.reducedMotion.matches ? 0 : now, {
      hover: -1, toolRadius: 0, toolColor: '', selected: null, showLabels: false,
    });
  }

  private open(): void {
    if (this.active) return;
    this.focusBefore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.dialog.showModal();
    this.host.sound.setDucked(true);
  }

  private disposeMedia(): void {
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.onended = audio.onerror = audio.onplay = audio.onpause = audio.onwaiting = audio.onplaying = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    this.scene = null;
    this.current = null;
    this.record = null;
  }

  close(): void {
    this.disposeMedia();
    this.dialog.close();
    this.host.sound.setDucked(false);
    if (this.focusBefore?.isConnected) this.focusBefore.focus();
    this.focusBefore = null;
  }

  private finish(): void {
    if (this.toLibrary && this.current) this.openLibrary();
    else this.close();
  }

  openLibrary(): void {
    if (!this.book) return;
    this.disposeMedia();
    this.toLibrary = false;
    this.dialog.className = 'chapter-dialog chapter-library';
    this.dialog.innerHTML = `<section class="chapter-archive">
      <div class="chapter-eyebrow">THE STORY OF YOUR WORLD</div>
      <h1 id="chapter-title">Chapters of life</h1>
      <p>Return to a turning point, or preview a recording. Previews do not unlock milestones.</p>
      <label class="chapter-setting"><input type="checkbox" data-auto ${this.enabled ? 'checked' : ''}> Play chapter breaks as life evolves</label>
      <div class="chapter-list"></div>
      <button class="primary" data-close>Back to the world</button>
    </section>`;
    const list = this.dialog.querySelector('.chapter-list')!;
    for (const chapter of CHAPTERS) {
      const saved = this.book.records.get(chapter.id);
      const row = document.createElement('article');
      const heading = document.createElement('h2'); heading.textContent = chapter.title;
      const meta = document.createElement('p');
      meta.textContent = saved ? `${fmtYear(saved.year)} · ${this.subjectName(saved)}` : chapter.condition;
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = `${saved ? 'Replay' : 'Preview'} · ${Math.round(chapter.duration)}s`;
      button.setAttribute('aria-label', `${saved ? 'Replay' : 'Preview'} ${chapter.title}`);
      button.addEventListener('click', () => this.play(saved ?? this.previewRecord(chapter.id), true, !saved));
      row.append(heading, meta, button);
      list.append(row);
    }
    this.dialog.querySelector<HTMLInputElement>('[data-auto]')!.addEventListener('change', e => this.setEnabled((e.target as HTMLInputElement).checked));
    this.dialog.querySelector('[data-close]')!.addEventListener('click', () => this.close());
    this.open();
    this.dialog.querySelector<HTMLButtonElement>('[data-close]')!.focus();
  }

  private subjectName(record: ChapterRecord): string {
    return speciesNameText({ name: record.name,
      playerMade: this.host.sim().species[record.speciesId]?.playerMade ?? false });
  }

  private previewRecord(id: ChapterId): ChapterRecord {
    const sim = this.host.sim();
    const source = this.book!.records.get('spark')!;
    const g = { ...source.genome, tier: 4, diet: 'omni' as const, habitat: 'terrestrial' as const,
      size: 4.5, flight: 0, fur: 0, grasp: 0, social: 0.4, intel: 0.2 };
    if (id === 'flight') g.flight = 0.8;
    if (id === 'warmth' || id === 'mind') g.fur = 0.75;
    if (id === 'mind') { g.grasp = 0.8; g.social = 0.8; g.intel = 0.8; }
    let cell = sim.world.isWater.findIndex(v => !v);
    if (cell < 0) cell = source.cell;
    return { ...source, id, name: 'Illustrative animal', genome: g, hue: 32, speciesId: -1, cell, tick: sim.tick, year: sim.year };
  }

  private play(record: ChapterRecord, fromLibrary: boolean, preview = false): void {
    this.disposeMedia();
    this.toLibrary = fromLibrary;
    this.current = CHAPTERS.find(c => c.id === record.id)!;
    this.record = record;
    const chapter = this.current;
    this.dialog.className = `chapter-dialog chapter-film chapter-${record.id}`;
    this.dialog.innerHTML = `<div class="chapter-stage" aria-hidden="true"><canvas data-landscape></canvas><canvas data-life></canvas></div>
      <div class="chapter-shade" aria-hidden="true"></div>
      <header class="chapter-heading"><div class="chapter-eyebrow">A NATURAL HISTORY · ${preview ? 'NARRATION PREVIEW' : fmtYear(record.year).toUpperCase()}</div>
      <h1 id="chapter-title"></h1><p data-subject></p></header>
      <figure class="chapter-specimen"><div data-portrait></div><figcaption data-caption></figcaption></figure>
      <footer class="chapter-footer">
        <p class="chapter-transcript" data-transcript ${this.subtitles ? '' : 'hidden'}></p>
        <p class="chapter-status" role="status" data-status>Loading narration…</p>
        <div class="chapter-transport"><progress aria-label="Chapter progress" value="0" max="${chapter.duration}"></progress><span data-time>0:00 / ${time(chapter.duration)}</span></div>
        <div class="chapter-controls"><button class="secondary" data-play>Pause narration</button><button class="secondary" data-voice></button><button class="secondary" data-subtitles></button><button class="primary" data-skip>${fromLibrary ? 'Back to chapters' : 'Skip · return to the world'}</button></div>
      </footer>`;
    this.dialog.querySelector('#chapter-title')!.textContent = chapter.title;
    this.dialog.querySelector('[data-subject]')!.textContent = preview ? 'An illustrative scene. Your world has not reached this chapter.' : `${this.subjectName(record)} · ${fromLibrary ? 'recorded lineage, present-day landscape' : 'a turning point in your world'}`;
    this.dialog.querySelector('[data-portrait]')!.innerHTML = portrait(record.genome, record.hue, Math.max(1, record.speciesId));
    this.dialog.querySelector('[data-caption]')!.textContent = record.id === 'warmth' ? 'Mammal-like reconstruction · lactation is not simulated' : record.id === 'mind' ? 'Ape-like reconstruction · an open-ended future' : record.id === 'spark' ? 'One small beginning. Countless possible futures.' : preview ? 'Illustrative body plan' : 'Drawn from this lineage’s inherited traits';
    this.dialog.querySelector('[data-transcript]')!.textContent = chapter.transcript;
    this.progress = this.dialog.querySelector('progress');
    this.stamp = this.dialog.querySelector('[data-time]');
    this.status = this.dialog.querySelector('[data-status]');
    this.playButton = this.dialog.querySelector('[data-play]');
    const voiceButton = this.dialog.querySelector<HTMLButtonElement>('[data-voice]')!;
    const subtitlesButton = this.dialog.querySelector<HTMLButtonElement>('[data-subtitles]')!;
    const audio = new Audio(chapter.audio);
    this.audio = audio;
    audio.preload = 'auto';
    audio.volume = 0.85;
    audio.muted = !this.voice || this.host.sound.mode === 'off';
    const labels = () => {
      voiceButton.textContent = audio.muted ? 'Narration: off' : 'Narration: on';
      voiceButton.setAttribute('aria-pressed', String(!audio.muted));
      subtitlesButton.textContent = this.subtitles ? 'Subtitles: on' : 'Subtitles: off';
      subtitlesButton.setAttribute('aria-pressed', String(this.subtitles));
    };
    const play = () => {
      if (this.audio !== audio) return;
      void audio.play().catch(() => {
        if (this.audio !== audio) return;
        this.status!.textContent = 'Press Play narration to begin, or skip back to the world.';
        this.playButton!.textContent = 'Play narration';
      });
    };
    audio.onended = () => { if (this.audio === audio) this.finish(); };
    audio.onerror = () => {
      if (this.audio !== audio) return;
      this.status!.textContent = 'The recording could not load. The transcript is available below; you can return at any time.';
      this.dialog.querySelector<HTMLElement>('[data-transcript]')!.hidden = false;
      this.playButton!.disabled = true;
    };
    audio.onplay = () => { if (this.audio === audio) this.playButton!.textContent = 'Pause narration'; };
    audio.onpause = () => { if (this.audio === audio) this.playButton!.textContent = 'Play narration'; };
    audio.onwaiting = () => { if (this.audio === audio) this.status!.textContent = 'Buffering narration…'; };
    audio.onplaying = () => { if (this.audio === audio) this.status!.textContent = audio.muted ? 'Narration muted · the world is paused' : 'The world is paused'; };
    this.playButton!.addEventListener('click', () => { if (audio.paused) play(); else audio.pause(); });
    voiceButton.addEventListener('click', () => {
      audio.muted = !audio.muted; this.voice = !audio.muted; remember('evo-chapter-voice', this.voice);
      labels(); this.status!.textContent = audio.muted ? 'Narration muted · the world is paused' : 'The world is paused';
    });
    subtitlesButton.addEventListener('click', () => {
      this.subtitles = !this.subtitles; remember('evo-chapter-subtitles', this.subtitles);
      this.dialog.querySelector<HTMLElement>('[data-transcript]')!.hidden = !this.subtitles; labels();
    });
    this.dialog.querySelector('[data-skip]')!.addEventListener('click', () => this.finish());
    labels();
    this.open();
    this.scene = new MapRenderer(this.dialog.querySelector('[data-landscape]')!, this.dialog.querySelector('[data-life]')!, this.host.sim());
    this.scene.renderBase();
    this.dialog.querySelector<HTMLButtonElement>('[data-skip]')!.focus();
    play();
  }
}
