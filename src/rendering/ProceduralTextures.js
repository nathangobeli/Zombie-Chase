import * as THREE from 'three';

/**
 * Generates high-detail procedural PBR textures at runtime using HTML5 Canvas.
 * Replaces flat solid hex colors with textured wet asphalt, concrete tiles,
 * interior floors, soft particle alpha gradients, and organic blood/bio-slime splats.
 */
export class ProceduralTextures {
  static createAll() {
    return {
      asphaltAlbedo: this.createAsphaltAlbedo(),
      asphaltRoughness: this.createAsphaltRoughness(),
      sidewalkAlbedo: this.createSidewalkTiles(),
      interiorFloor: this.createInteriorFloor(),
      softParticle: this.createSoftRadialParticle(),
      splatDecal: this.createSplatDecal(),
      windowFacade: this.createWindowFacadeTexture(),
    };
  }

  static createAsphaltAlbedo() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Rich slate wet asphalt base
    ctx.fillStyle = '#2b3340';
    ctx.fillRect(0, 0, size, size);

    // Aggregate mineral grain noise
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < data.length; i += 4) {
      const n = (rand() - 0.5) * 28;
      const spec = rand() > 0.95 ? 24 : 0;
      data[i] = Math.min(255, Math.max(18, data[i] + n + spec));
      data[i + 1] = Math.min(255, Math.max(22, data[i + 1] + n + spec));
      data[i + 2] = Math.min(255, Math.max(28, data[i + 2] + n + spec * 1.1));
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle dark tar cracks & tire wear tracks
    ctx.strokeStyle = 'rgba(12, 16, 23, 0.5)';
    ctx.lineWidth = 2;
    for (let c = 0; c < 14; c++) {
      ctx.beginPath();
      let x = rand() * size;
      let y = rand() * size;
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (rand() - 0.5) * 65;
        y += (rand() - 0.5) * 65;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createAsphaltRoughness() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Default semi-rough asphalt (value ~185/255 => roughness ~0.72)
    ctx.fillStyle = 'rgb(185, 185, 185)';
    ctx.fillRect(0, 0, size, size);

    // Glossy wet rain puddles (low roughness ~25/255 => mirror-like wet sheen)
    let seed = 4201;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 12; i++) {
      const px = rand() * size;
      const py = rand() * size;
      const r = 18 + rand() * 44;
      const grad = ctx.createRadialGradient(px, py, r * 0.1, px, py, r);
      grad.addColorStop(0, 'rgba(22, 22, 22, 0.92)');
      grad.addColorStop(0.7, 'rgba(55, 55, 55, 0.65)');
      grad.addColorStop(1, 'rgba(185, 185, 185, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  static createSidewalkTiles() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, size, size);

    // Subtle concrete noise
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      d[i] = Math.min(255, Math.max(0, d[i] + n));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    // Concrete tile expansion joints (4x4 grid)
    const step = size / 4;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Highlight bevel edge
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.28)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const p = i * step + 2;
      ctx.strokeRect(p, p, step - 4, step - 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createInteriorFloor() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const tiles = 8;
    const step = size / tiles;
    for (let y = 0; y < tiles; y++) {
      for (let x = 0; x < tiles; x++) {
        const even = (x + y) % 2 === 0;
        ctx.fillStyle = even ? '#475569' : '#334155';
        ctx.fillRect(x * step, y * step, step, step);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * step + 0.5, y * step + 0.5, step - 1, step - 1);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createSoftRadialParticle() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.78)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  static createSplatDecal() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;

    // Central organic pool
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const lobes = 14;
    for (let i = 0; i <= lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const r = 46 + Math.sin(i * 3.7) * 16 + Math.cos(i * 2.3) * 12;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Radial satellite droplets
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.2;
      const dist = 54 + (i % 5) * 12;
      const dr = 4 + (i % 4) * 3.5;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, dr, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  static createWindowFacadeTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Architectural concrete facade base
    ctx.fillStyle = '#262b36';
    ctx.fillRect(0, 0, size, size);

    const cols = 4;
    const rows = 4;
    const padX = 12;
    const padY = 12;
    const cellW = size / cols;
    const cellH = size / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW + padX;
        const y = r * cellH + padY;
        const w = cellW - padX * 2;
        const h = cellH - padY * 2;

        // Window recess frame
        ctx.fillStyle = '#11151c';
        ctx.fillRect(x - 3, y - 3, w + 6, h + 6);

        // Lit or dark window pane
        const hash = (r * 7 + c * 13) % 10;
        if (hash < 4) {
          // Warm office light
          ctx.fillStyle = '#fef08a';
        } else if (hash < 6) {
          // Cool cyber cyan monitor glow
          ctx.fillStyle = '#7dd3fc';
        } else {
          // Dark reflective glass
          ctx.fillStyle = '#1e293b';
        }
        ctx.fillRect(x, y, w, h);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
