/**
 * 60 FPS HD Constellation Particle Engine
 * Matches Python PyQt6 particle logic:
 * - Glowing radial halos & core dots
 * - Neural constellation distance lines
 * - Interactive mouse repulsion / magnetism
 * - Theme-aware color blending
 */

class ParticleEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.numParticles = 48;
    this.mouse = { x: null, y: null };
    this.theme = (typeof localStorage !== 'undefined' && localStorage.getItem('powerdeck_theme')) || 'dark';
    this.startTime = Date.now();

    this.resize();
    this.initParticles();
    this.bindEvents();
    this.animate();
  }

  setTheme(theme, color) {
    this.theme = theme;
    if (color) this.color = color;
  }

  setColor(color) {
    this.color = color;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 1.1,
        vy: (Math.random() - 0.5) * 1.1,
        baseRadius: 1.8 + Math.random() * 1.8,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 1.5 + Math.random() * 2.0
      });
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.resize();
      this.particles.forEach(p => {
        if (p.x > this.width) p.x = Math.random() * this.width;
        if (p.y > this.height) p.y = Math.random() * this.height;
      });
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    window.addEventListener('mouseleave', () => {
      this.mouse.x = null;
      this.mouse.y = null;
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const t = (Date.now() - this.startTime) / 1000;

    ctx.clearRect(0, 0, w, h);

    const isDark = this.theme === 'dark';
    const colorMap = {
      purple: isDark ? '124, 111, 255' : '99, 85, 238',
      blue: isDark ? '0, 210, 255' : '2, 132, 199',
      emerald: isDark ? '0, 245, 160' : '5, 150, 105',
      rose: isDark ? '255, 51, 102' : '225, 29, 72',
      amber: isDark ? '255, 184, 0' : '217, 119, 6',
      cyan: isDark ? '0, 229, 255' : '8, 145, 178',
      sunset: isDark ? '255, 107, 53' : '234, 88, 12'
    };
    const primaryRGB = colorMap[this.color] || (isDark ? '124, 111, 255' : '99, 85, 238');
    const infoRGB = isDark ? '87, 199, 255' : '14, 165, 233';

    // 1. Ambient Background Glow Blooms
    const pulse1 = Math.sin(t * 0.7) * 0.15 + 0.85;
    const pulse2 = Math.cos(t * 0.5 + 1.2) * 0.15 + 0.85;

    const grad1 = ctx.createRadialGradient(w * 0.25, h * 0.3, 0, w * 0.25, h * 0.3, 360 * pulse1);
    grad1.addColorStop(0, `rgba(${primaryRGB}, ${isDark ? 0.07 : 0.04})`);
    grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, w, h);

    const grad2 = ctx.createRadialGradient(w * 0.75, h * 0.7, 0, w * 0.75, h * 0.7, 380 * pulse2);
    grad2.addColorStop(0, `rgba(${infoRGB}, ${isDark ? 0.05 : 0.03})`);
    grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);

    // 2. Update Particles & Physics
    const mouseForceDist = 140;
    const mouseForceDistSq = mouseForceDist * mouseForceDist;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // Mouse repulsion
      if (this.mouse.x !== null && this.mouse.y !== null) {
        const dx = p.x - this.mouse.x;
        const dy = p.y - this.mouse.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 1 && distSq < mouseForceDistSq) {
          const dist = Math.sqrt(distSq);
          const force = (1.0 - dist / mouseForceDist) * 1.5;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }
      }

      p.x += p.vx;
      p.y += p.vy;

      // Bounce at boundaries
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
      else if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx); }

      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
      else if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy); }
    }

    // 3. Constellation Neural Connection Lines
    const connDist = 115;
    const connDistSq = connDist * connDist;
    const pLen = this.particles.length;

    for (let i = 0; i < pLen; i++) {
      const p1 = this.particles[i];
      for (let j = i + 1; j < pLen; j++) {
        const p2 = this.particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dSq = dx * dx + dy * dy;

        if (dSq < connDistSq) {
          const factor = 1.0 - dSq / connDistSq;
          const alpha = factor * (isDark ? 0.26 : 0.12);
          ctx.strokeStyle = `rgba(${primaryRGB}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }

    // 4. Render Particle Nodes & Glow Halos
    for (let i = 0; i < pLen; i++) {
      const p = this.particles[i];
      const pulse = (Math.sin(t * p.pulseSpeed + p.pulsePhase) + 1.0) * 0.5;
      const rad = p.baseRadius + pulse * 1.3;

      // Outer Halo
      const haloGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 3.8);
      haloGrad.addColorStop(0, `rgba(${primaryRGB}, ${isDark ? 0.48 : 0.25})`);
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 3.8, 0, Math.PI * 2);
      ctx.fill();

      // Core Particle
      ctx.fillStyle = `rgba(${primaryRGB}, ${isDark ? 0.95 : 0.75})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Instantiate engine when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.particleEngine = new ParticleEngine('particle-canvas');
});
