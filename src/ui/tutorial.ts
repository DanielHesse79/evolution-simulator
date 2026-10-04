/** What the tutorial needs to know about the game to tell whether the player did what it asked. */
export interface TutorialContext {
  zoom(): number;
  selectedId(): number;
  cellViews(): number;
  modalOpen(): boolean;
}

interface Step {
  /** CSS selectors of the parts of the screen to highlight. */
  target?: string[];
  title: string;
  text: string;
  /** If present, the step waits for the player to do this instead of showing a Next button. */
  wait?: (c: TutorialContext, start: { cellViews: number }) => boolean;
  waitText?: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome, Creator',
    text: 'This short tour shows you how to read your world and shape the life in it. You can end it at any time.',
  },
  {
    target: ['#mapwrap'],
    title: 'Your world',
    text: 'A young planet, wrapping round from east to west. Right now its only life is a microbe at the hot vents in the deep sea. Hover anywhere to see the temperature, rain, acidity and who lives there.',
  },
  {
    target: ['#mapwrap'],
    title: 'Take a closer look',
    text: 'Scroll the mouse wheel over the map, or press ＋, to zoom in. Drag to move around. Up close you see the waves, drifting algae, kelp, forests, volcanoes and the creatures themselves.',
    wait: (c) => c.zoom() >= 3,
    waitText: 'Zoom in to about ×3',
  },
  {
    target: ['.clock', '#speed'],
    title: 'A million years',
    text: 'Time races in the age of microbes and slows down as life grows complex. Space pauses; 1, 2 and 3 set the speed.',
  },
  {
    target: ['#species-panel'],
    title: 'Every living species',
    text: 'Animals, plants and microbes, with a bar for how many there are. Click one to study it. You can also click a creature on the map.',
    wait: (c) => c.selectedId() >= 0,
    waitText: 'Select a species',
  },
  {
    target: ['#detail'],
    title: 'A species up close',
    text: 'Here are its body plan, numbers, range and traits. Press 🔬 Cell to see how we imagine its cells are built.',
    wait: (c, s) => c.cellViews() > s.cellViews,
    waitText: 'Open the cell view',
  },
  {
    target: ['#detail'],
    title: 'Guided evolution',
    text: 'The ＋ and − buttons breed a daughter species with a changed trait. It costs divine energy, and natural selection decides whether she survives. Horns help on the open savanna but are a curse in the forest.',
  },
  {
    target: ['#atmos'],
    title: 'Air, sun and sea',
    text: 'Oxygen is the great gatekeeper: complex cells, bodies, land life and big animals each need more of it, and only sun-eating life makes it. You can also heat the world, drown the coasts or lower the seas to open land bridges.',
  },
  {
    target: ['#powers'],
    title: 'Divine powers',
    text: 'Pick a power and click the map: fire, rain, minerals, plague, the Ark that carries a species to another continent, volcanoes and meteors. Esc or a right-click puts it down again.',
  },
  {
    target: ['#layers'],
    title: 'Ways of seeing',
    text: 'Switch the map to temperature, rainfall, acidity or minerals, or see where plants and animals live and where life is richest.',
  },
  {
    target: ['#chronicle'],
    title: 'The Chronicle',
    text: 'Every first, every extinction and every catastrophe is written down here. Click an entry to select that species.',
  },
  {
    target: ['#goal', '#energy'],
    title: 'Your purpose',
    text: 'Your goal and how close you are. Every act of God costs divine energy (⚡), which returns slowly, so spend it wisely. Good luck!',
  },
];

const DONE_KEY = 'evo-tutorial-done';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Tutorial {
  active = false;
  private i = 0;
  private start = { cellViews: 0 };
  private doneAt = 0;
  private spot: HTMLElement;
  private box: HTMLElement;

  constructor(private ctx: TutorialContext) {
    this.spot = document.getElementById('tut-spot')!;
    this.box = document.getElementById('tut-box')!;
    this.box.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-tut]')?.dataset.tut;
      if (act === 'next' || act === 'skip') this.next();
      else if (act === 'back') this.go(this.i - 1);
      else if (act === 'end') this.stop();
    });
  }

  begin(): void {
    this.active = true;
    this.go(0);
  }

  stop(): void {
    this.active = false;
    this.spot.style.display = 'none';
    this.box.style.display = 'none';
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      // private mode: the tour will simply be offered again next time
    }
  }

  private next(): void {
    if (this.i + 1 >= STEPS.length) this.stop();
    else this.go(this.i + 1);
  }

  private go(i: number): void {
    this.i = Math.max(0, i);
    this.start = { cellViews: this.ctx.cellViews() };
    this.doneAt = 0;
    this.render(false);
  }

  private render(done: boolean): void {
    const s = STEPS[this.i];
    const last = this.i === STEPS.length - 1;
    let foot: string;
    if (s.wait && !done) foot = `<span class="tut-wait">👉 ${s.waitText}</span><button data-tut="skip" class="tut-link">Skip</button>`;
    else if (s.wait) foot = `<span class="tut-wait ok">✓ Well done</span>`;
    else foot = `<span></span><button data-tut="next" class="tut-next">${last ? 'Start playing' : this.i === 0 ? 'Show me' : 'Next →'}</button>`;
    this.box.innerHTML = `
      <div class="tut-top"><span>${this.i + 1} / ${STEPS.length}</span>${this.i > 0 ? '<button data-tut="back" class="tut-link">← Back</button>' : ''}<button data-tut="end" class="tut-link">End tour ×</button></div>
      <h4>${s.title}</h4>
      <p>${s.text}</p>
      <div class="tut-foot">${foot}</div>`;
  }

  /** Called every frame: follows the highlighted elements and checks whether the player is done. */
  update(now: number): void {
    if (!this.active) return;
    if (this.ctx.modalOpen()) {
      this.spot.style.display = 'none';
      this.box.style.display = 'none';
      return;
    }
    const s = STEPS[this.i];
    if (s.wait && !this.doneAt && s.wait(this.ctx, this.start)) {
      this.doneAt = now;
      this.render(true);
    }
    if (this.doneAt && now - this.doneAt > 900) {
      this.next();
      return;
    }
    this.place();
  }

  private place(): void {
    const s = STEPS[this.i];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.spot.style.display = 'block';
    this.box.style.display = 'block';
    let r = { left: vw / 2, top: vh / 2, right: vw / 2, bottom: vh / 2 };
    if (s.target) {
      let found = false;
      for (const sel of s.target) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (!found) r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        else r = { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) };
        found = true;
      }
    }
    const pad = s.target ? 6 : 0;
    this.spot.style.left = `${r.left - pad}px`;
    this.spot.style.top = `${r.top - pad}px`;
    this.spot.style.width = `${r.right - r.left + pad * 2}px`;
    this.spot.style.height = `${r.bottom - r.top + pad * 2}px`;
    this.spot.classList.toggle('none', !s.target);

    // put the speech bubble beside the highlight, wherever it fits
    const bw = this.box.offsetWidth;
    const bh = this.box.offsetHeight;
    const gap = 16;
    let x: number;
    let y: number;
    if (!s.target) {
      x = (vw - bw) / 2;
      y = (vh - bh) / 2;
    } else if (r.right + gap + bw < vw - 8) {
      x = r.right + gap;
      y = r.top;
    } else if (r.left - gap - bw > 8) {
      x = r.left - gap - bw;
      y = r.top;
    } else if (r.bottom + gap + bh < vh - 8) {
      x = r.left;
      y = r.bottom + gap;
    } else if (r.top - gap - bh > 8) {
      x = r.left;
      y = r.top - gap - bh;
    } else {
      // a big target: sit inside its lower right corner
      x = r.right - bw - gap;
      y = r.bottom - bh - gap;
    }
    this.box.style.left = `${Math.max(8, Math.min(vw - bw - 8, x))}px`;
    this.box.style.top = `${Math.max(8, Math.min(vh - bh - 8, y))}px`;
  }
}
