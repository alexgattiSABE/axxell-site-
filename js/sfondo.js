import { riduci, inVista } from './utili.js';

export function avviaSfondo(bg) {
  const g2 = bg.getContext('2d');
  const TONES = {
    hero:[[229,255,31],[255,31,143],[29,60,255]],
    sabe:[[229,255,31],[229,255,31],[29,60,255]],
    anima:[[255,31,143],[255,31,143],[229,255,31]],
    atlas:[[29,60,255],[29,60,255],[255,31,143]],
    servizi:[[56,214,232],[56,214,232],[29,60,255]],
    visione:[[229,255,31],[255,31,143],[29,60,255]],
    close:[[229,255,31],[255,31,143],[29,60,255]]
  };
  let tone = TONES.hero.map(c => c.slice()), toneT = TONES.hero;
  document.querySelectorAll('[data-tone]').forEach(sec => inVista(sec, v => { if (v) toneT = TONES[sec.dataset.tone]; }, .3));
  let bw, bh, bdpr;
  function bgSize() { bdpr = Math.min(devicePixelRatio, 1.5); bw = innerWidth; bh = innerHeight; bg.width = bw * bdpr; bg.height = bh * bdpr; }
  bgSize(); addEventListener('resize', bgSize);
  let bt = 0, last = 0;
  function bgFrame(now) {
    if (now - last < 33 && !riduci) { requestAnimationFrame(bgFrame); return; }
    last = now; bt += riduci ? 0 : .006;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tone[i][j] += (toneT[i][j] - tone[i][j]) * .04;
    const W = bw * bdpr, H = bh * bdpr, sy = scrollY;
    g2.clearRect(0, 0, W, H);
    const orbs = [
      [.18 + .06 * Math.sin(bt * 1.1), .28 + .08 * Math.cos(bt * .9), .42, .16],
      [.82 + .05 * Math.cos(bt * .8), .22 + .07 * Math.sin(bt * 1.3), .36, .10],
      [.62 + .08 * Math.sin(bt * .7 + 2), .82 + .05 * Math.cos(bt), .40, .08]
    ];
    orbs.forEach(([x, y, r, a], i) => {
      const c = tone[i], R = r * Math.max(W, H), cx = x * W, cy = y * H;
      const gr = g2.createRadialGradient(cx, cy, 0, cx, cy, R);
      const aa = c[2] < 80 ? a * 1.7 : a;
      gr.addColorStop(0, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${aa})`); gr.addColorStop(1, `rgba(${c[0]|0},${c[1]|0},${c[2]|0},0)`);
      g2.fillStyle = gr; g2.fillRect(0, 0, W, H);
    });
    const horizon = H * .52, rows = 22, cols = 34, off = ((bt * 40) + sy * .01) % 1;
    for (let r = 0; r < rows; r++) {
      const z = (r + off) / rows, p = z * z;
      const y = horizon + p * (H - horizon) * 1.05;
      const spread = .35 + p * 1.9;
      g2.fillStyle = `rgba(11,16,51,${(.03 + p * .11).toFixed(3)})`;
      const s = (.6 + p * 2.2) * bdpr;
      for (let c = 0; c <= cols; c++) {
        const x = W / 2 + (c / cols - .5) * W * spread;
        if (x < -10 || x > W + 10) continue;
        g2.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    if (!riduci && !document.hidden) requestAnimationFrame(bgFrame);
  }
  requestAnimationFrame(bgFrame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !riduci) requestAnimationFrame(bgFrame); });
}
