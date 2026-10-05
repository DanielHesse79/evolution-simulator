/** Small atlas illustrations, rasterised by the renderer's existing sprite cache. */
export function paintLandscapeSprite(ctx: CanvasRenderingContext2D, icon: string, canvasSize: number, size: number): boolean {
  if (!['🌲', '🌳', '🌴', '🌿', '🌱', '⛰️', '🏔️', '🐸', '🐟', '🐠', '🦈', '🐢', '🦎', '🐊', '🐌', '🪱', '🐛', '🐦', '🦅', '🦇'].includes(icon)) return false;
  ctx.save();
  ctx.translate((canvasSize - size) / 2, (canvasSize - size) / 2);
  ctx.scale(size / 100, size / 100);
  const shape = (path: string, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(path));
  };
  const oval = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (['🌲', '🌳', '🌴', '🌿', '🌱', '⛰️', '🏔️'].includes(icon)) oval(54, 90, 30, 6, '#082c2b35');
  if (icon === '🌲') {
    shape('M46 57H53L55 92H45Z', '#705947');
    shape('M50 3L29 34H36L19 56H30L12 80Q50 91 88 80L70 56H81L64 34H71Z', '#214c41');
    shape('M50 3L29 34H36L19 56H30L12 80Q30 83 47 82L52 63L46 66L52 42L44 44L52 24Z', '#527e60');
    shape('M49 12L36 31L47 27ZM43 43L30 54L43 50ZM36 66L24 77L40 72Z', '#88a278');
  } else if (icon === '🌳') {
    shape('M44 48H53L56 93H43L46 69L31 54L34 50L48 61L64 43L68 47L53 68Z', '#80654a');
    oval(53, 43, 35, 30, '#305c44');
    oval(28, 47, 18, 20, '#3c714f');
    oval(65, 33, 22, 22, '#477b53');
    oval(43, 27, 25, 24, '#608b59');
    oval(34, 23, 13, 12, '#91aa72');
    oval(70, 52, 15, 14, '#386449');
    oval(38, 54, 22, 14, '#527f50');
  } else if (icon === '🌴') {
    shape('M43 93Q54 56 48 29L54 28Q63 60 53 94Z', '#9d8057');
    shape('M52 29Q16 8 5 47Q26 29 52 33Q24 32 17 65Q38 43 52 34Q79 41 91 65Q89 33 55 29Q81 8 98 30Q81-2 52 25Q48 0 24 8Q44 14 52 29Z', '#3a7757');
    shape('M52 29Q16 8 5 47Q28 23 52 29M52 29Q80 8 98 30Q78 1 52 29Z', '#81a86c');
  } else if (icon === '🌿' || icon === '🌱') {
    ctx.strokeStyle = '#66916a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(47, 91);
    ctx.quadraticCurveTo(60, 56, 49, 13);
    ctx.stroke();
    const leaves = icon === '🌱' ? 2 : 4;
    for (let i = 0; i < leaves; i++) {
      const y = 25 + i * 16;
      shape(`M53 ${y + 15}Q15 ${y + 12} 18 ${y - 8}Q44 ${y - 11} 53 ${y + 15}`, i % 2 ? '#52816a' : '#86a772');
      shape(`M54 ${y + 19}Q88 ${y + 13} 87 ${y - 5}Q61 ${y - 8} 54 ${y + 19}`, '#3d745a');
    }
  } else if (icon === '⛰️' || icon === '🏔️') {
    shape('M3 88L37 27L48 42L62 8L98 89Z', '#657975');
    shape('M3 88L37 27L31 63L40 58L33 86ZM34 87L62 8L58 47L65 41L56 88Z', '#a4ad97');
    shape('M62 8L98 89L78 70L70 73L64 51L58 47Z', '#50676a');
    if (icon === '🏔️') {
      shape('M62 8L78 44L67 37L61 43L55 34L47 42Z', '#e7eddf');
      shape('M37 27L47 42L39 39L34 46L30 41Z', '#d9e3d8');
    }
  } else if (icon === '🐸') {
    // A side-on amphibian with folded hind legs, rather than a face icon.
    shape('M45 60L30 79L13 78L26 70L32 52ZM63 52L90 65L80 81L55 80L74 71L60 66Z', '#466347');
    oval(52, 51, 31, 18, '#7e9760');
    oval(25, 45, 18, 14, '#8ea971');
    oval(19, 36, 6, 7, '#bac48c');
    oval(17, 36, 2.5, 3.5, '#172d2b');
    oval(57, 45, 16, 8, '#a4b97a');
    shape('M14 52Q27 62 48 57L42 65Q23 66 14 52Z', '#c5c295');
  } else if (['🐟', '🐠', '🦈'].includes(icon)) {
    const fish = icon === '🐠' ? '#bb9b69' : '#82adb0';
    shape('M62 48L94 27L87 50L96 72L63 59Z', '#4f7e87');
    shape('M38 39L54 16L61 45M38 59L55 79L62 57Z', '#456e79');
    oval(42, 51, 34, icon === '🦈' ? 13 : 21, fish);
    shape('M11 54Q41 76 70 54Q48 63 11 54Z', '#c6d2bd');
    oval(23, 46, 3, 3, '#142d32');
    if (icon === '🐠') shape('M37 32Q30 51 38 70L44 71Q36 51 44 31Z', '#667c68');
  } else if (icon === '🐢') {
    shape('M35 48L21 70L30 77L44 61M65 50L81 69L72 78L60 60Z', '#678574');
    oval(16, 47, 12, 9, '#94a681');
    oval(52, 49, 32, 24, '#4b7063');
    oval(48, 42, 24, 15, '#8a9b72');
    shape('M44 30L34 42L44 54L60 51L65 37L55 28Z', '#6b825e');
    oval(11, 44, 2, 2, '#203a34');
  } else if (icon === '🦎' || icon === '🐊') {
    shape('M65 49Q88 63 96 38Q92 74 62 59ZM36 50L30 32L18 29L26 39L27 53ZM55 54L70 75L83 73L71 65L67 49ZM34 52L27 76L16 76L22 67L24 51Z', '#527a65');
    oval(49, 50, 27, 10, '#7c9b72');
    shape('M30 42L10 44L3 52L29 57Z', '#8ba883');
    shape('M32 46Q54 39 72 52L67 53Q49 46 32 49Z', '#b5bf85');
    oval(19, 47, 2, 2, '#19372e');
  } else if (icon === '🐌') {
    shape('M10 70Q25 51 72 65L94 74H12ZM18 66L13 37L18 37L26 66Z', '#aab69a');
    oval(55, 48, 26, 25, '#a58562');
    oval(53, 45, 17, 17, '#ccae7b');
    oval(55, 47, 9, 10, '#8d7458');
    oval(54, 45, 4, 5, '#c5a778');
  } else if (icon === '🪱' || icon === '🐛') {
    ctx.strokeStyle = icon === '🪱' ? '#b58e83' : '#9bb27a';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(13, 55);
    ctx.bezierCurveTo(36, 28, 61, 79, 86, 49);
    ctx.stroke();
    oval(13, 53, 7, 7, '#cad0a1');
    oval(10, 51, 2, 2, '#2d3c31');
  } else {
    // Birds and bats retain distinct wing outlines in the cached drawing.
    const bat = icon === '🦇';
    shape(bat ? 'M50 49L12 16L7 45L23 42L28 58L42 54L51 69L61 54L77 58L79 43L96 46L88 16Z' : 'M48 51Q27 18 5 21Q17 46 43 59L56 64Q84 48 98 25Q73 24 54 51Z', bat ? '#796d79' : '#8c9c9a');
    oval(49, 54, 9, 20, bat ? '#524855' : '#c5c9af');
    oval(48, 35, 8, 8, '#607975');
    shape('M43 31L30 38L43 39Z', '#d0b47e');
  }
  ctx.restore();
  return true;
}
