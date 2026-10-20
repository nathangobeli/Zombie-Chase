import * as THREE from 'three';

/**
 * Bright, high-contrast procedural textures optimized for Mobile & Desktop readability.
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

    // Medium-light sunlit slate asphalt so green/red/orange zombies pop with high contrast!
    ctx.fillStyle = '#526074';
    ctx.fillRect(0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < data.length; i += 4) {
      const n = (rand() - 0.5) * 20;
      data[i] = Math.min(255, Math.max(45, data[i] + n));
      data[i + 1] = Math.min(255, Math.max(52, data[i + 1] + n));
      data[i + 2] = Math.min(255, Math.max(64, data[i + 2] + n));
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createAsphaltRoughness() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgb(200, 200, 200)';
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  static createSidewalkTiles() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Warm, bright sunlit concrete sidewalk
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, size, size);

    const step = size / 4;
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.38)';
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
        ctx.fillStyle = even ? '#e2e8f0' : '#94a3b8';
        ctx.fillRect(x * step, y * step, step, step);
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
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(canvas);
  }

  static createSplatDecal() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cx = size / 2;
    const cy = size / 2;

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

    return new THREE.CanvasTexture(canvas);
  }

  static createWindowFacadeTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Clean modern light architectural facade
    ctx.fillStyle = '#64748b';
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

        ctx.fillStyle = '#334155';
        ctx.fillRect(x - 3, y - 3, w + 6, h + 6);

        const hash = (r * 7 + c * 13) % 10;
        ctx.fillStyle = hash < 4 ? '#fef08a' : hash < 7 ? '#bae6fd' : '#475569';
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
