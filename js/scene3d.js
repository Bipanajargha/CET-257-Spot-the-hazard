/* scene3d.js — a real, walkable 3D warehouse built from Three.js primitives
   (no photos, no panoramas). Two ways to move, like Street View:
     - W/A/S/D: continuous first-person walk (W/S forward-back, A/D turn)
     - Click the floor: smoothly walks you to that point
   Mouse-drag free-looks around. Clicking an actual 3D hazard object scores
   it; clicking any other prop (racking, boxes, walls...) is a wrong guess. */

class Warehouse3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0e10);
    this.scene.fog = new THREE.Fog(0x0d0e10, 18, 42);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.yaw = 0;
    this.pitch = 0;
    this.pos = new THREE.Vector3(0, 1.7, 4);

    this.keys = { forward: false, backward: false, turnLeft: false, turnRight: false };
    this.moveSpeed = 4.5;
    this.turnSpeed = 80; // deg/sec
    this.walkTarget = null; // Vector3 | null — active click-to-move destination
    this.hintTarget = null; // { yaw, pitch } | null — active hint look animation

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0, yaw: 0, pitch: 0, moved: false };

    this.raycastTargets = [];
    this.hazardMeshes = {}; // id -> { group, markerEl }
    this.foundBadges = {};
    this.safeRoomActive = false;
    this.locked = false; // true while a Fix-It choice is awaiting input — blocks all scene clicks
    this.onFootstep = null;
    this._lastFootstep = 0;

    this.clock = new THREE.Clock();
    this._raf = null;
    this.onHazardClick = null;
    this.onWrongClick = null;

    this._bindEvents();
    this._onResize();
  }

  build(level, bounds) {
    this.bounds = bounds;
    // Fog/backdrop distance scales with the room so a bigger, more
    // spacious warehouse doesn't fade out too early or too late.
    this.scene.fog = new THREE.Fog(0x0d0e10, bounds.roomWidth * 0.9, bounds.roomLength * 0.8);
    this._addLighting();
    this._addRoom();
    this._addRacking();
    this._addForklift(bounds.forkliftX, bounds.forkliftZ);
    this._addFireExit(bounds.fireExitZ);
    this._addWorkers();
    this._addHazards(level.hazards);

    this.pos.set(bounds.spawn.x, bounds.spawn.y, bounds.spawn.z);
    this.yaw = bounds.spawn.yaw;
    this.pitch = 0;
  }

  // ---------- construction ----------

  _mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  }

  _addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xdfe6ee, 0x2a2a2c, 0.75));
    const sun = new THREE.DirectionalLight(0xfff4e0, 0.35);
    sun.position.set(5, 10, 5);
    this.scene.add(sun);
    const roomLength = this.bounds.roomLength;
    for (let z = 8; z <= roomLength - 4; z += 9) {
      const light = new THREE.PointLight(0xfff6df, 0.6, 16, 2);
      light.position.set(0, this.bounds.roomHeight - 0.4, z);
      this.scene.add(light);
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.12, 0.5),
        this._mat(0xfff6df, { emissive: 0xffe9a8, emissiveIntensity: 0.6 })
      );
      fixture.position.set(0, this.bounds.roomHeight - 0.15, z);
      fixture.userData.type = 'prop';
      this.scene.add(fixture);
      this.raycastTargets.push(fixture);
    }
  }

  _addRoom() {
    const { roomLength, roomWidth, roomHeight } = this.bounds;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomLength),
      this._mat(0x8b8b86)
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, roomLength / 2);
    floor.userData.type = 'floor';
    this.scene.add(floor);
    this.raycastTargets.push(floor);
    this.floorMesh = floor;

    // One lane stripe down the centre of EACH aisle (the gap between
    // every pair of neighbouring rack rows), rather than a single fixed
    // pair of stripes — so multi-aisle levels get a marked lane per
    // aisle, matching however many aisles that level actually has.
    const rows = (this.bounds.rackRows || []).map((r) => r.x).sort((a, b) => a - b);
    const aisleCenters = [];
    for (let i = 0; i < rows.length - 1; i++) aisleCenters.push((rows[i] + rows[i + 1]) / 2);
    if (aisleCenters.length === 0) aisleCenters.push(0);
    aisleCenters.forEach((cx) => {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.18, roomLength), this._mat(0xd9b32a));
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(cx, 0.01, roomLength / 2);
      this.scene.add(lane);
    });

    // Loading-dock zone (Level 3): a visually distinct, unracked area at
    // the far end of the room with its own hazard-striped floor marking.
    if (this.bounds.dockZone) {
      const { zStart, zEnd } = this.bounds.dockZone;
      const dockLen = zEnd - zStart;
      const dockFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(roomWidth - 0.6, dockLen - 0.4),
        this._mat(0x6b6d63)
      );
      dockFloor.rotation.x = -Math.PI / 2;
      dockFloor.position.set(0, 0.015, zStart + dockLen / 2);
      this.scene.add(dockFloor);
      // hazard-stripe border along the threshold between aisle and dock
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth - 0.6, 0.4), this._mat(0xd9b32a));
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.016, zStart + 0.2);
      this.scene.add(stripe);
    }

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth, roomLength),
      this._mat(0x35373d)
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, roomHeight, roomLength / 2);
    this.scene.add(ceiling);

    const wallMat = this._mat(0xb9b8b0);
    const wallL = new THREE.Mesh(new THREE.PlaneGeometry(roomLength, roomHeight), wallMat);
    wallL.position.set(-roomWidth / 2, roomHeight / 2, roomLength / 2);
    wallL.rotation.y = Math.PI / 2;
    this.scene.add(wallL);
    const wallR = wallL.clone();
    wallR.position.x = roomWidth / 2;
    wallR.rotation.y = -Math.PI / 2;
    this.scene.add(wallR);

    const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomHeight), wallMat);
    wallBack.position.set(0, roomHeight / 2, 0);
    this.scene.add(wallBack);

    // Far (south) end wall — with dock doors for a loading-dock level,
    // otherwise a plain wall, closing off the rectangle on all 4 sides.
    const wallFar = new THREE.Mesh(new THREE.PlaneGeometry(roomWidth, roomHeight), wallMat);
    wallFar.position.set(0, roomHeight / 2, roomLength);
    wallFar.rotation.y = Math.PI;
    this.scene.add(wallFar);

    if (this.bounds.dockZone) {
      const doorCount = this.bounds.dockZone.doors || 2;
      const doorW = (roomWidth - 2) / doorCount - 0.6;
      const doorMat = this._mat(0x8a8f96, { emissive: 0x2a2e33, emissiveIntensity: 0.2 });
      for (let i = 0; i < doorCount; i++) {
        const dx = -roomWidth / 2 + 1 + i * ((roomWidth - 2) / doorCount) + doorW / 2;
        const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, roomHeight * 0.72), doorMat);
        door.position.set(dx, roomHeight * 0.38, roomLength - 0.03);
        door.rotation.y = Math.PI;
        this.scene.add(door);
      }
    }
  }

  _addRacking() {
    const { rackRows, roomHeight } = this.bounds;
    const frameMat = this._mat(0x2c6fb0);
    const beamMat = this._mat(0xd8722a);
    const boxColors = [0xdec8a0, 0xc4a878, 0xe0cca4, 0x9a7c4e].map((c) => this._mat(c));
    let seedState = 7;
    const rand = () => { seedState = (seedState * 9301 + 49297) % 233280; return seedState / 233280; };
    const rackSpacing = 4;

    rackRows.forEach((row) => {
      const gaps = row.gaps || [];
      for (let z = row.zStart; z <= row.zEnd; z += rackSpacing) {
        // Skip stretches of racking that are flagged as cross-aisle gaps
        // for this row, so aisles can connect to each other partway
        // down the room instead of running as one unbroken corridor.
        if (gaps.some(([a, b]) => z >= a && z <= b)) continue;
        const frameGroup = new THREE.Group();
        const postGeo = new THREE.BoxGeometry(0.08, roomHeight - 1.2, 0.08);
        [-0.9, 0.9].forEach((dx) => {
          const post = new THREE.Mesh(postGeo, frameMat);
          post.position.set(dx, (roomHeight - 1.2) / 2, 0);
          frameGroup.add(post);
        });
        for (let lvl = 0; lvl < 4; lvl++) {
          const y = 0.5 + lvl * 1.25;
          const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.08), beamMat);
          beam.position.set(0, y, 0);
          frameGroup.add(beam);
          for (let b = 0; b < 2; b++) {
            const bw = 0.5 + rand() * 0.15;
            const bh = 0.42;
            const box = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.5), boxColors[Math.floor(rand() * boxColors.length)]);
            box.position.set(-0.45 + b * 0.9 + (rand() - 0.5) * 0.15, y + bh / 2 + 0.02, 0);
            box.userData.type = 'prop';
            frameGroup.add(box);
            this.raycastTargets.push(box);
          }
        }
        frameGroup.position.set(row.x, 0, z);
        this.scene.add(frameGroup);
      }
    });
  }

  _addForklift(x, z, group3 = null) {
    const g = group3 || new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 1.9), this._mat(0xe89a1c));
    body.position.set(0, 0.6, 0);
    g.add(body);
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.15), this._mat(0x37383d));
    cage.position.set(0, 1.35, -0.7);
    g.add(cage);
    const mastGeo = new THREE.BoxGeometry(0.08, 1.9, 0.08);
    [-0.4, 0.4].forEach((dx) => {
      const mast = new THREE.Mesh(mastGeo, this._mat(0x5a5b60));
      mast.position.set(dx, 1.1, 1.05);
      g.add(mast);
    });
    const forks = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), this._mat(0x3d3d42));
    forks.position.set(0, 0.28, 1.5);
    g.add(forks);
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 14);
    [[-0.5, -0.6], [0.5, -0.6], [-0.5, 0.65], [0.5, 0.65]].forEach(([dx, dz]) => {
      const w = new THREE.Mesh(wheelGeo, this._mat(0x151515));
      w.rotation.z = Math.PI / 2;
      w.position.set(dx, 0.32, dz);
      g.add(w);
    });
    g.traverse((c) => { if (c.isMesh) { c.userData.type = 'prop'; this.raycastTargets.push(c); } });
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 2;
    this.scene.add(g);
    return g;
  }

  _addFireExit(z) {
    const doorMat = this._mat(0x97999e);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 0.12), doorMat);
    door.position.set(0, 1.7, z);
    door.userData.type = 'prop';
    this.scene.add(door);
    this.raycastTargets.push(door);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.05), this._mat(0x1a9c4a, { emissive: 0x1a9c4a, emissiveIntensity: 0.5 }));
    sign.position.set(0, 3.6, z - 0.02);
    this.scene.add(sign);

    const extBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.6, 12), this._mat(0xc42020));
    extBody.position.set(1.7, 0.9, z - 0.15);
    extBody.userData.type = 'prop';
    this.scene.add(extBody);
    this.raycastTargets.push(extBody);
  }

  _makeWorker(hiVis) {
    const g = new THREE.Group();
    const skin = this._mat(0xd8ad8e);
    const torsoMat = hiVis ? this._mat(0xe0d21a) : this._mat(0x5a5d63);
    const legMat = this._mat(0x33353b);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
    head.position.y = 1.55;
    g.add(head);

    const torsoGeo = THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.22, 0.55, 4, 10) : new THREE.CylinderGeometry(0.22, 0.22, 0.75, 10);
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.12;
    g.add(torso);

    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.75, 8);
    [-0.11, 0.11].forEach((dx) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(dx, 0.4, 0);
      g.add(leg);
    });

    g.traverse((c) => { if (c.isMesh) { c.userData.type = 'prop'; this.raycastTargets.push(c); } });
    return g;
  }

  _addWorkers() {
    const positions = this.bounds.workerPositions || [{ x: 0, z: 10, rot: 0 }];
    this.decorativeWorkers = positions.map((p) => {
      const w = this._makeWorker(true);
      w.position.set(p.x, 0, p.z);
      w.rotation.y = p.rot || 0;
      this.scene.add(w);
      return w;
    });
  }

  _addHazards(hazards) {
    hazards.forEach((hz) => {
      let mesh;
      switch (hz.id) {
        case 1: mesh = this._hazardSpill(); break;
        case 2: mesh = this._hazardOverloadedShelf(); break;
        case 3: mesh = this._hazardCable(); break;
        case 4: mesh = this._hazardPallet(); break;
        case 5: mesh = this._addForklift(0, 0, new THREE.Group()); break; // repositioned below
        case 6: mesh = this._makeWorker(false); break;
        case 7: mesh = this._hazardBentRack(); break;
        case 8: mesh = this._hazardBoxStack(); break;
        default: mesh = new THREE.Group();
      }
      // Most hazard meshes are authored relative to a floor origin (y=0).
      // The shelf-mounted ones (overloaded shelf, bent rack) are authored
      // relative to their own local origin and need hz.y as a real lift.
      const yBase = (hz.id === 2 || hz.id === 7) ? hz.y : 0;
      mesh.position.set(hz.x, yBase, hz.z);
      if (hz.id === 6) mesh.rotation.y = -Math.PI * 0.6;
      mesh.traverse((c) => { if (c.isMesh) { c.userData.type = 'hazard'; c.userData.hazardId = hz.id; } });
      mesh.userData.type = 'hazard';
      mesh.userData.hazardId = hz.id;
      this.scene.add(mesh);
      this.raycastTargets.push(mesh);
      const entry = { group: mesh, origMaterials: [], found: false, escalated: false };
      mesh.traverse((c) => {
        if (c.isMesh) {
          entry.origMaterials.push({ mesh: c, color: c.material.color.clone() });
        }
      });
      this.hazardMeshes[hz.id] = entry;
    });
  }

  _hazardSpill() {
    // Wrapped in a group (like the other floor-standing hazards) so its
    // small lift above the floor survives _addHazards' position.set —
    // sitting exactly at y=0 made it compete with the floor plane for
    // clicks, so it was effectively unclickable.
    const g = new THREE.Group();
    const spill = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), this._mat(0x2f4656, { emissive: 0x1c2c38, emissiveIntensity: 0.4 }));
    spill.rotation.x = -Math.PI / 2;
    spill.position.y = 0.03;
    g.add(spill);
    return g;
  }

  _hazardOverloadedShelf() {
    const g = new THREE.Group();
    const colors = [0xe0cca4, 0xdec8a0, 0xc4a878];
    for (let i = 0; i < 3; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.45), this._mat(colors[i % 3]));
      box.position.set(-0.4 + i * 0.4, i % 2 === 0 ? 0.05 : 0.5, 0);
      box.rotation.z = (i - 1) * 0.15;
      g.add(box);
    }
    return g;
  }

  _hazardCable() {
    const pts = [[-2, 0], [-1.2, 0.3], [-0.4, -0.2], [0.4, 0.3], [1.2, -0.15], [2, 0.1]]
      .map(([x, z]) => new THREE.Vector3(x, 0.03, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.05, 6, false), this._mat(0x1c1c1c));
    return tube;
  }

  _hazardPallet() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.15, 1.1), this._mat(0x8a6438));
    base.position.y = 0.08;
    g.add(base);
    const boxes = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.6), this._mat(0xdec8a0));
    boxes.position.set(0.1, 0.5, 0);
    boxes.rotation.z = 0.35;
    g.add(boxes);
    return g;
  }

  _hazardBentRack() {
    const bent = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1), this._mat(0xb5503f));
    bent.rotation.z = 0.3;
    bent.position.y = 1;
    return bent;
  }

  _hazardBoxStack() {
    const g = new THREE.Group();
    const colors = [0xdec8a0, 0xc4a878, 0xe0cca4];
    for (let i = 0; i < 4; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.5), this._mat(colors[i % 3]));
      box.position.set((i % 2) * 0.6 - 0.3, Math.floor(i / 2) * 0.42 + 0.2, 0);
      g.add(box);
    }
    return g;
  }

  // ---------- interaction ----------

  markFound(hazardId) {
    const entry = this.hazardMeshes[hazardId];
    if (!entry || entry.found) return;
    entry.found = true;
    // Client feedback (17 Sep): the hazard is cleared from the scene once handled.
    // Flash green, then shrink away; it can no longer be clicked.
    entry.group.traverse((c) => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.color.set(0x4ac48a);
        c.material.emissive = new THREE.Color(0x1a3c2c);
        c.material.emissiveIntensity = 0.6;
      }
    });
    const idx = this.raycastTargets.indexOf(entry.group);
    if (idx >= 0) this.raycastTargets.splice(idx, 1);
    entry.resolveT = 0;
    entry.baseScale = entry.group.scale.clone();
    this._addResolvedTag(entry);
  }

  _addResolvedTag(entry) {
    const box = new THREE.Box3().setFromObject(entry.group);
    const pos = box.getCenter(new THREE.Vector3());
    pos.y = box.max.y + 0.3;
    const el = document.createElement('div');
    el.className = 'resolved-tag';
    el.textContent = '✔ RESOLVED';
    this.container.appendChild(el);
    this.resolvedTags = this.resolvedTags || [];
    this.resolvedTags.push({ el, pos, life: 2.2 });
  }

  _updateResolveAnims(dt) {
    Object.values(this.hazardMeshes).forEach((entry) => {
      if (entry.resolveT == null || entry.removed) return;
      entry.resolveT += dt;
      const t = entry.resolveT;
      if (t > 0.5) {
        const k = Math.max(0, 1 - (t - 0.5) / 0.5);
        entry.group.scale.set(entry.baseScale.x * k, entry.baseScale.y * k, entry.baseScale.z * k);
        if (k <= 0) { entry.group.visible = false; entry.removed = true; }
      }
    });
    if (!this.resolvedTags) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.resolvedTags = this.resolvedTags.filter((tag) => {
      tag.life -= dt;
      if (tag.life <= 0) { tag.el.remove(); return false; }
      const p = tag.pos.clone().project(this.camera);
      const visible = p.z < 1;
      tag.el.style.display = visible ? 'block' : 'none';
      tag.el.style.left = ((p.x * 0.5 + 0.5) * w) + 'px';
      tag.el.style.top = ((-p.y * 0.5 + 0.5) * h - (2.2 - tag.life) * 12) + 'px';
      tag.el.style.opacity = String(Math.min(1, tag.life));
      return true;
    });
  }

  /** Toggle a hazard-free reference view: hides every hazard object so
   *  the player can compare the "safe" scene against what they've seen.
   *  Clicking is disabled by game.js while this is active. */
  setSafeRoom(active) {
    this.safeRoomActive = active;
    Object.values(this.hazardMeshes).forEach((entry) => {
      entry.group.visible = !active && !entry.removed;
    });
  }

  hintLookAt(hazard) {
    const dir = new THREE.Vector3(hazard.x - this.pos.x, 0, hazard.z - this.pos.z);
    const targetYaw = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
    const dy = hazard.y - this.pos.y;
    const dist = Math.max(0.5, dir.length());
    const targetPitch = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.atan2(dy, dist)), -45, 45);
    this.hintTarget = { yaw: targetYaw, pitch: targetPitch, until: performance.now() + 1400 };
  }

  _bindEvents() {
    const dom = this.container;
    const start = (x, y) => {
      this.isDragging = true;
      this.dragStart = { x, y, yaw: this.yaw, pitch: this.pitch, moved: false };
    };
    const move = (x, y) => {
      if (!this.isDragging) return;
      const dx = x - this.dragStart.x;
      const dy = y - this.dragStart.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.dragStart.moved = true;
      this.yaw = this.dragStart.yaw - dx * 0.16;
      this.pitch = THREE.MathUtils.clamp(this.dragStart.pitch - dy * 0.12, -70, 70);
      this.hintTarget = null;
    };
    const end = (x, y) => {
      if (this.isDragging && !this.dragStart.moved) this._handleClick(x, y);
      this.isDragging = false;
    };

    this._onMouseDown = (e) => start(e.clientX, e.clientY);
    this._onMouseMove = (e) => move(e.clientX, e.clientY);
    this._onMouseUp = (e) => end(e.clientX, e.clientY);
    this._onTouchStart = (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); };
    this._onTouchMove = (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); };
    this._onTouchEnd = (e) => { const t = e.changedTouches[0]; end(t.clientX, t.clientY); };
    this._onWindowResize = () => this._onResize();

    dom.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    dom.addEventListener('touchstart', this._onTouchStart, { passive: true });
    dom.addEventListener('touchmove', this._onTouchMove, { passive: true });
    dom.addEventListener('touchend', this._onTouchEnd);
    window.addEventListener('resize', this._onWindowResize);
  }

  _handleClick(clientX, clientY) {
    if (this.locked) return;
    const rect = this.container.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hits = raycaster.intersectObjects(this.raycastTargets, true);
    if (hits.length === 0) return;
    const hit = hits[0].object;
    const type = hit.userData.type;

    if (type === 'hazard') {
      if (this.safeRoomActive) return;
      if (this.onHazardClick) this.onHazardClick(hit.userData.hazardId);
    } else if (type === 'floor') {
      const p = hits[0].point;
      this.walkTarget = new THREE.Vector3(
        THREE.MathUtils.clamp(p.x, -this.bounds.corridorHalfWidth, this.bounds.corridorHalfWidth),
        this.pos.y,
        THREE.MathUtils.clamp(p.z, this.bounds.walkableZMin, this.bounds.walkableZMax)
      );
    } else if (type === 'prop') {
      if (this.safeRoomActive) return;
      if (this.onWrongClick) this.onWrongClick();
    }
  }

  /** Stops the player walking straight through a rack row: if they'd end
   *  up within the row's physical thickness (and that row isn't skipped
   *  by a cross-aisle gap at this z), push them back out to whichever
   *  side they were already on, so aisles feel like real aisles. */
  _resolveRackCollision() {
    const rows = this.bounds.rackRows || [];
    const halfThickness = 0.75;
    const prevX = this._prevX != null ? this._prevX : this.pos.x;
    rows.forEach((row) => {
      const gaps = row.gaps || [];
      if (this.pos.z < row.zStart - 1 || this.pos.z > row.zEnd + 1) return;
      if (gaps.some(([a, b]) => this.pos.z >= a && this.pos.z <= b)) return;
      const dx = this.pos.x - row.x;
      if (Math.abs(dx) < halfThickness) {
        const side = (prevX - row.x) >= 0 ? 1 : -1;
        this.pos.x = row.x + side * halfThickness;
      }
    });
    this._prevX = this.pos.x;
  }

  _onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _updateMovement(dt) {
    const b = this.bounds;

    if (this.keys.turnLeft) this.yaw -= this.turnSpeed * dt;
    if (this.keys.turnRight) this.yaw += this.turnSpeed * dt;

    const yawRad = THREE.MathUtils.degToRad(this.yaw);
    const forward = new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));

    let moved = false;
    if (this.keys.forward) { this.pos.addScaledVector(forward, this.moveSpeed * dt); moved = true; }
    if (this.keys.backward) { this.pos.addScaledVector(forward, -this.moveSpeed * dt); moved = true; }
    if (moved) this.walkTarget = null;

    if (this.walkTarget) {
      const toTarget = new THREE.Vector3().subVectors(this.walkTarget, this.pos);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist < 0.08) {
        this.walkTarget = null;
      } else {
        toTarget.normalize();
        this.pos.addScaledVector(toTarget, Math.min(this.moveSpeed * dt, dist));
        moved = true;
      }
    }

    if (moved && this.onFootstep) {
      const now = performance.now();
      if (now - this._lastFootstep > 340) {
        this._lastFootstep = now;
        this.onFootstep();
      }
    }

    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -b.corridorHalfWidth, b.corridorHalfWidth);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.walkableZMin, b.walkableZMax);
    this._resolveRackCollision();

    if (this.hintTarget) {
      const t = performance.now();
      if (t > this.hintTarget.until) {
        this.hintTarget = null;
      } else {
        this.yaw += (this.hintTarget.yaw - this.yaw) * 0.08;
        this.pitch += (this.hintTarget.pitch - this.pitch) * 0.08;
      }
    }

    this.camera.position.copy(this.pos);
    const yawRad2 = THREE.MathUtils.degToRad(this.yaw);
    const pitchRad = THREE.MathUtils.degToRad(this.pitch);
    const lookDir = new THREE.Vector3(
      Math.sin(yawRad2) * Math.cos(pitchRad),
      Math.sin(pitchRad),
      Math.cos(yawRad2) * Math.cos(pitchRad)
    );
    this.camera.lookAt(this.pos.clone().add(lookDir));
  }

  start() {
    this.clock.start();
    const animate = () => {
      this._raf = requestAnimationFrame(animate);
      const dt = Math.min(0.1, this.clock.getDelta());
      this._updateMovement(dt);
      this._updateResolveAnims(dt);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  destroy() {
    this.stop();
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('resize', this._onWindowResize);
    this.container.innerHTML = '';
  }
}
