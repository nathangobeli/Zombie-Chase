import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetLoader {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();
    this.fbxLoader = new FBXLoader();

    this.textures = {};
    this.characterGeometry = null;
    this.characterModel = null;
    this.characterAnimations = {};
    this.buildingModels = [];
  }

  async loadAll() {
    console.log('[AssetLoader] Loading Kenney visual assets...');

    // 1. Load Textures
    await this._loadTextures();

    // 2. Load Kenney Character
    await this._loadKenneyCharacter();

    // 3. Load Kenney Character Animations
    await this._loadKenneyAnimations();

    // 4. Load Kenney Commercial Buildings
    await this._loadKenneyBuildings();

    console.log('[AssetLoader] Asset loading complete.');
    return {
      textures: this.textures,
      characterGeometry: this.characterGeometry,
      characterModel: this.characterModel,
      characterAnimations: this.characterAnimations,
      buildingModels: this.buildingModels,
    };
  }

  async _loadTextures() {
    const texConfigs = [
      { key: 'zombie', url: '/assets/characters/skins/zombieA.png' },
      { key: 'zombieAlt', url: '/assets/characters/skins/zombieC.png' },
      { key: 'survivorMale', url: '/assets/characters/skins/survivorMaleB.png' },
      { key: 'survivorFemale', url: '/assets/characters/skins/survivorFemaleA.png' },
      { key: 'colormap', url: '/assets/buildings/Textures/colormap.png' },
    ];

    const promises = texConfigs.map((cfg) => {
      return new Promise((resolve) => {
        this.textureLoader.load(
          cfg.url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.NearestFilter;
            tex.magFilter = THREE.NearestFilter;
            tex.flipY = cfg.key !== 'colormap';
            this.textures[cfg.key] = tex;
            resolve();
          },
          undefined,
          (err) => {
            console.warn(`[AssetLoader] Texture load failed for ${cfg.url}`, err);
            resolve();
          }
        );
      });
    });

    await Promise.all(promises);
  }

  async _loadKenneyCharacter() {
    return new Promise((resolve) => {
      this.fbxLoader.load(
        '/assets/characters/characterMedium.fbx',
        (fbx) => {
          let foundGeom = null;
          let foundMesh = null;
          fbx.traverse((child) => {
            if ((child.isMesh || child.isSkinnedMesh) && !foundGeom) {
              foundMesh = child;
              foundGeom = child.geometry.clone();
            }
          });

          if (foundGeom) {
            // 1. Normalize root transform orientation so character stands upright along Y axis
            // FBX imported meshes have rotation.x = -Math.PI / 2 on the mesh node; apply it to geometry
            const rx = foundMesh?.rotation?.x ?? -Math.PI / 2;
            foundGeom.rotateX(rx);

            // 2. Scale geometry to standard ~1.8m height
            foundGeom.computeBoundingBox();
            let bb = foundGeom.boundingBox;
            const height = bb.max.y - bb.min.y;
            const targetHeight = 1.8;
            const scale = targetHeight / (height || 1.0);
            foundGeom.scale(scale, scale, scale);

            // 3. Shift pivot origin so soles of feet sit precisely at Y = 0 (and center X/Z)
            foundGeom.computeBoundingBox();
            bb = foundGeom.boundingBox;
            const centerX = (bb.min.x + bb.max.x) * 0.5;
            const centerZ = (bb.min.z + bb.max.z) * 0.5;
            const minY = bb.min.y;
            foundGeom.translate(-centerX, -minY, -centerZ);

            foundGeom.computeBoundingBox();
            foundGeom.computeVertexNormals();

            // 4. Tag vertices with limb attribute for GPU procedural kinetic animations
            this._tagLimbAttributes(foundGeom);

            this.characterGeometry = foundGeom;

            // Normalize base FBX model: scale to 1.8m height and ground pivot at feet
            const box = new THREE.Box3().setFromObject(fbx);
            const modelHeight = box.max.y - box.min.y;
            if (modelHeight > 0) {
              const modelScale = targetHeight / modelHeight;
              fbx.scale.multiplyScalar(modelScale);
            }
            this.characterModel = fbx;

            console.log('[AssetLoader] Kenney Character geometry & model normalized successfully');
          }
          resolve();
        },
        undefined,
        (err) => {
          console.warn('[AssetLoader] Kenney FBX Character load failed, using procedural fallback', err);
          resolve();
        }
      );
    });
  }

  async _loadKenneyAnimations() {
    const animConfigs = [
      { key: 'idle', url: '/assets/characters/animations/idle.fbx' },
      { key: 'run', url: '/assets/characters/animations/run.fbx' },
      { key: 'jump', url: '/assets/characters/animations/jump.fbx' },
    ];

    const promises = animConfigs.map((cfg) => {
      return new Promise((resolve) => {
        this.fbxLoader.load(
          cfg.url,
          (animFbx) => {
            if (animFbx.animations && animFbx.animations.length > 0) {
              // Pick the animation clip with duration > 0.1 or matching name
              const clip = animFbx.animations.find(
                (a) => a.name.toLowerCase().includes(cfg.key) || a.duration > 0.1
              ) || animFbx.animations[0];
              clip.name = cfg.key;
              this.characterAnimations[cfg.key] = clip;
            }
            resolve();
          },
          undefined,
          (err) => {
            console.warn(`[AssetLoader] Failed to load animation ${cfg.key}`, err);
            resolve();
          }
        );
      });
    });

    await Promise.all(promises);
    console.log(`[AssetLoader] Loaded ${Object.keys(this.characterAnimations).length} Kenney character animations`);
  }

  /**
   * Clones the character model using SkeletonUtils.clone to prevent shared bone matrix conflicts.
   */
  cloneCharacterModel() {
    if (!this.characterModel) return null;
    return SkeletonUtils.clone(this.characterModel);
  }

  /**
   * Creates a skinned character instance with its own independent AnimationMixer and actions.
   */
  createSkinnedCharacter(textureKey = 'zombie') {
    if (!this.characterModel) return null;

    // Use SkeletonUtils.clone rather than basic scene.clone()
    const clone = SkeletonUtils.clone(this.characterModel);

    // Apply texture if available
    if (this.textures[textureKey]) {
      clone.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.material = child.material.clone();
          child.material.map = this.textures[textureKey];
          child.material.needsUpdate = true;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    // Each instance gets its own independent AnimationMixer
    const mixer = new THREE.AnimationMixer(clone);
    const actions = {};
    for (const [name, clip] of Object.entries(this.characterAnimations)) {
      actions[name] = mixer.clipAction(clip);
    }

    return {
      model: clone,
      mixer,
      actions,
    };
  }

  _tagLimbAttributes(geom) {
    const pos = geom.attributes.position;
    const count = pos.count;
    const limbs = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);

      let limb = 0.0; // Torso
      if (y < 0.82) {
        // Legs
        limb = x < 0 ? 4.0 : 5.0; // 4=Left Leg, 5=Right Leg
      } else if (y >= 0.85 && y < 1.42 && Math.abs(x) > 0.22) {
        // Arms
        limb = x < 0 ? 2.0 : 3.0; // 2=Left Arm, 3=Right Arm
      } else if (y >= 1.44) {
        // Head
        limb = 1.0;
      }
      limbs[i] = limb;
    }

    geom.setAttribute('aLimb', new THREE.BufferAttribute(limbs, 1));
  }

  async _loadKenneyBuildings() {
    const buildingFiles = [
      'building-a.glb',
      'building-b.glb',
      'building-c.glb',
      'building-d.glb',
      'building-e.glb',
      'building-f.glb',
      'building-g.glb',
      'building-h.glb',
      'building-skyscraper-a.glb',
      'building-skyscraper-b.glb',
      'building-skyscraper-c.glb',
    ];

    const promises = buildingFiles.map((file) => {
      return new Promise((resolve) => {
        this.gltfLoader.load(
          `/assets/buildings/${file}`,
          (gltf) => {
            let mesh = null;
            gltf.scene.traverse((child) => {
              if (child.isMesh && !mesh) {
                mesh = child;
              }
            });

            if (mesh) {
              const geom = mesh.geometry.clone();
              geom.computeBoundingBox();

              this.buildingModels.push({
                name: file.replace('.glb', ''),
                geometry: geom,
                material: mesh.material,
              });
            }
            resolve();
          },
          undefined,
          (err) => {
            console.warn(`[AssetLoader] Failed to load building ${file}`, err);
            resolve();
          }
        );
      });
    });

    await Promise.all(promises);
    console.log(`[AssetLoader] Loaded ${this.buildingModels.length} Kenney building models`);
  }
}
