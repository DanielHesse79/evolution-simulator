import { yearAt, type Sim } from '../sim/simulation';
import type { Species } from '../sim/species';
import { speciesNameText } from './species-label';

const ROW = 12;
const TOP = 26;
const LEFT = 12;
const RIGHT = 210;

export interface TreeLayout {
  rows: Species[];
  height: number;
}

/**
 * Draw the family tree of life: time runs left to right, every line is a species,
 * and each branch point is the moment a daughter species split off.
 */
export function drawTree(canvas: HTMLCanvasElement, sim: Sim, selectedId: number, width: number): TreeLayout {
  // keep the tree readable: leave out short-lived twigs that led nowhere
  const keep = (sp: Species) => sp.alive || (sp.established && (sp.children > 0 || sp.diedTick - sp.bornTick >= 80));
  const included = new Set<number>();
  for (const sp of sim.species) if (keep(sp)) included.add(sp.id);
  // a kept species needs its ancestors drawn too
  for (const sp of sim.species) {
    if (!included.has(sp.id)) continue;
    let p = sp.parentId;
    while (p >= 0 && !included.has(p)) {
      included.add(p);
      p = sim.species[p].parentId;
    }
  }
  const kids = new Map<number, Species[]>();
  const roots: Species[] = [];
  for (const sp of sim.species) {
    if (!included.has(sp.id)) continue;
    if (sp.parentId < 0) roots.push(sp);
    else {
      const list = kids.get(sp.parentId) ?? [];
      list.push(sp);
      kids.set(sp.parentId, list);
    }
  }
  const rows: Species[] = [];
  const rowOf = new Map<number, number>();
  const visit = (sp: Species) => {
    rowOf.set(sp.id, rows.length);
    rows.push(sp);
    const list = kids.get(sp.id);
    if (list) for (const k of list.sort((a, b) => b.bornTick - a.bornTick)) visit(k);
  };
  for (const r of roots) visit(r);

  const height = TOP + rows.length * ROW + 12;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const maxTick = Math.max(1, sim.tick);
  const x = (tick: number) => LEFT + (tick / maxTick) * (width - LEFT - RIGHT);
  const y = (row: number) => TOP + row * ROW + ROW / 2;

  // time axis
  ctx.font = '10.5px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const stepTicks = maxTick > 3000 ? 500 : maxTick > 1200 ? 250 : 100;
  for (let t = 0; t <= maxTick; t += stepTicks) {
    const gx = Math.round(x(t)) + 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(gx, TOP - 6);
    ctx.lineTo(gx, height);
    ctx.stroke();
    ctx.fillStyle = 'rgba(135,148,179,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(yearAt(t) / 1000)}k yr`, gx, 10);
  }

  ctx.textAlign = 'left';
  for (let i = 0; i < rows.length; i++) {
    const sp = rows[i];
    const col = `${sp.color[0]},${sp.color[1]},${sp.color[2]}`;
    const x0 = x(sp.bornTick);
    const x1 = x(sp.alive ? maxTick : sp.diedTick);
    const yy = y(i);
    const alpha = sp.alive ? 1 : 0.42;
    if (sp.parentId >= 0 && rowOf.has(sp.parentId)) {
      ctx.strokeStyle = `rgba(${col},${alpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y(rowOf.get(sp.parentId)!));
      ctx.lineTo(x0 + 0.5, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${col},${alpha})`;
    ctx.lineWidth = sp.id === selectedId ? 4 : sp.alive ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.lineTo(Math.max(x0 + 1, x1), yy);
    ctx.stroke();
    if (sp.alive) {
      ctx.fillStyle = `rgb(${col})`;
      ctx.beginPath();
      ctx.arc(x1, yy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sp.id === selectedId ? '#f2c14e' : 'rgba(219,228,245,0.92)';
      ctx.font = 'italic 11px "Palatino Linotype", Georgia, serif';
      ctx.fillText(`${sp.icon} ${speciesNameText(sp)}`, x1 + 8, yy);
    } else if (sp.id === selectedId || sp.diedTick - sp.bornTick > 600) {
      ctx.fillStyle = sp.id === selectedId ? '#f2c14e' : 'rgba(135,148,179,0.75)';
      ctx.font = 'italic 10.5px "Palatino Linotype", Georgia, serif';
      ctx.fillText(`† ${speciesNameText(sp)}`, x1 + 5, yy);
    }
  }
  return { rows, height };
}

export function treeHit(layout: TreeLayout, offsetY: number): Species | null {
  const row = Math.floor((offsetY - TOP) / ROW);
  return layout.rows[row] ?? null;
}
