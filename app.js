(() => {
  'use strict';

  const cfg = window.CONFIG;
  const stage = document.getElementById('stage');
  const grid = document.getElementById('grid');
  const hud = document.getElementById('hud');
  const toolbar = document.getElementById('toolbar');
  const undoBtn = document.getElementById('undo');
  const fullscreenBtn = document.getElementById('fullscreen');

  const IMAGE_EXT = /\.(gif|png|jpe?g|webp|avif|apng|svg)$/i;
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
  const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

  const zoneEls = []; // parallel to cfg.zones
  let scaleX = 1, scaleY = 1;
  let editing = false, selected = null, dirty = false, flash = '';
  let mouseActive = false, mouseTimer;
  let showHelp = true;
  try { showHelp = localStorage.getItem('wall.showHelp') !== 'no'; } catch {}
  const undoStack = []; // zone geometry snapshots, taken before each edit

  // ---------- helpers ----------

  // Spaces in filenames are fine in config; they get encoded here.
  const resolveSrc = src =>
    (/^([a-z]+:|\/)/i.test(src) ? src : (cfg.mediaFolder ?? 'media/') + src).replace(/ /g, '%20');

  function inferType(item) {
    if (item.type) return item.type;
    if (item.items) return 'playlist';
    if (!item.src) return 'black';
    const path = item.src.split(/[?#]/)[0];
    if (IMAGE_EXT.test(path)) return 'image';
    if (VIDEO_EXT.test(path)) return 'video';
    return 'iframe';
  }

  function zoneName(zone, i) {
    return zone.id ?? `zone ${i}`;
  }

  // ---------- corner-pin (keystone) math ----------

  // Solve Ax = b with Gaussian elimination (8x8 for a homography).
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  // CSS matrix3d that maps the w×h box's corners onto the box corners + offsets.
  function cornerPin(w, h, offsets) {
    const src = [[0, 0], [w, 0], [w, h], [0, h]];
    const A = [], b = [];
    src.forEach(([x, y], i) => {
      const u = x + offsets[i][0], v = y + offsets[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    });
    const [a, b1, c, d, e, f, g, h1] = solve(A, b);
    return `matrix3d(${a},${d},0,${g},${b1},${e},0,${h1},0,0,1,0,${c},${f},0,1)`;
  }

  // ---------- stage ----------

  function fitStage() {
    const { width, height, fit = 'contain', background = '#000' } = cfg.stage;
    stage.style.width = width + 'px';
    stage.style.height = height + 'px';
    stage.style.background = background;
    scaleX = innerWidth / width;
    scaleY = innerHeight / height;
    if (fit === 'stretch') {
      stage.style.transform = `scale(${scaleX}, ${scaleY})`;
    } else {
      const s = scaleX = scaleY = Math.min(scaleX, scaleY);
      const ox = (innerWidth - width * s) / 2, oy = (innerHeight - height * s) / 2;
      stage.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
    }
  }

  // ---------- content ----------

  // Calls cb(ok) once when the content has loaded enough to show, or cb(false) if it
  // failed to load. A slow load is shown anyway after a few seconds.
  function whenReady(node, cb) {
    let done = false;
    const go = (ok = true) => { if (!done) { done = true; cb(ok); } };
    const fail = () => go(false);
    const media = node.matches('img, video, iframe') ? node : node.querySelector('img, video, iframe');
    setTimeout(go, 4000);
    if (!media) return go();
    if (media.tagName === 'IMG') {
      if (media.complete) return go(media.naturalWidth > 0);
      media.addEventListener('load', () => go()); media.addEventListener('error', fail);
    } else if (media.tagName === 'VIDEO') {
      media.addEventListener('loadeddata', () => go()); media.addEventListener('error', fail);
    } else {
      media.addEventListener('load', () => go());
    }
  }

  // crop = [top, right, bottom, left] in percent of the media, like CSS inset.
  function applyCrop(el, crop) {
    const [t, r, b, l] = crop.map(v => v / 100);
    const w = 1 - l - r, h = 1 - t - b;
    Object.assign(el.style, {
      width: 100 / w + '%',
      height: 100 / h + '%',
      left: -100 * l / w + '%',
      top: -100 * t / h + '%',
    });
    const box = document.createElement('div');
    box.className = 'content';
    box.appendChild(el);
    return box;
  }

  function buildContent(item, zone, { inPlaylist = false, onEnded } = {}) {
    const type = inferType(item);
    let el;
    switch (type) {
      case 'image':
        el = document.createElement('img');
        el.alt = '';
        el.src = resolveSrc(item.src);
        el.addEventListener('error', () => console.warn('Missing image:', el.src));
        break;
      case 'video':
        el = document.createElement('video');
        el.muted = true; // browsers only autoplay muted video
        el.autoplay = true;
        el.playsInline = true;
        el.setAttribute('muted', '');
        // In a playlist, a video with no duration plays once then advances.
        el.loop = !(inPlaylist && item.duration == null);
        if (!el.loop) {
          el.addEventListener('ended', onEnded);
          el.addEventListener('error', () => setTimeout(onEnded, 2000));
        }
        el.playbackRate = item.speed ?? 1;
        el.addEventListener('loadeddata', () => { el.playbackRate = item.speed ?? 1; el.play().catch(() => {}); });
        el.addEventListener('error', () => console.warn('Missing video:', el.src));
        el.src = resolveSrc(item.src);
        break;
      case 'iframe': {
        el = document.createElement('iframe');
        el.src = resolveSrc(item.src);
        el.allow = 'autoplay; fullscreen';
        el.setAttribute('scrolling', 'no');
        const zoom = item.zoom ?? 1; // <1 shows more of the page, shrunk down
        if (zoom !== 1) {
          el.style.width = 100 / zoom + '%';
          el.style.height = 100 / zoom + '%';
          el.style.transform = `scale(${zoom})`;
          el.style.transformOrigin = '0 0';
        }
        break;
      }
      case 'black':
      case 'color':
        el = document.createElement('div');
        el.style.background = type === 'black' ? '#000' : item.color;
        break;
      case 'placeholder':
        el = document.createElement('div');
        el.classList.add('placeholder');
        el.style.setProperty('--c', item.color ?? '#357');
        el.textContent = item.label ?? item.id ?? 'placeholder';
        break;
      default:
        console.warn('Unknown content type:', type, item);
        el = document.createElement('div');
    }

    el.classList.add('content');
    if (type === 'image' || type === 'video') {
      el.style.objectFit = item.fit ?? zone.fit ?? 'cover';
      el.style.objectPosition = item.position ?? zone.position ?? '50% 50%';
    }
    const crop = item.crop ?? zone.crop;
    return crop ? applyCrop(el, crop) : el;
  }

  function startPlaylist(zone, el) {
    let items = zone.items.slice();
    let i = -1, current = null, timer;

    function next() {
      clearTimeout(timer);
      i = (i + 1) % items.length;
      if (zone.shuffle && i === 0) items = items.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
      const item = items[i];
      const fade = item.fade ?? zone.fade ?? 1;
      let advanced = false;
      const node = buildContent(item, zone, {
        inPlaylist: true,
        onEnded: () => { if (!advanced) { advanced = true; next(); } },
      });
      node.style.opacity = 0;
      node.style.transition = `opacity ${fade}s`;
      el.appendChild(node);

      whenReady(node, ok => {
        // Skip files that fail to load (missing / misspelled) instead of showing a blank.
        if (!ok && items.length > 1) {
          node.remove();
          timer = setTimeout(next, 1000);
          return;
        }
        node.getBoundingClientRect(); // force layout so the fade transition runs
        node.style.opacity = 1;
        const old = current;
        current = node;
        if (old) setTimeout(() => old.remove(), fade * 1000 + 100);
        if (items.length < 2) return;
        const isVideoUntilEnd = inferType(item) === 'video' && item.duration == null;
        if (!isVideoUntilEnd) timer = setTimeout(next, (item.duration ?? zone.duration ?? 10) * 1000);
      });
    }
    next();
  }

  // ---------- zones ----------

  function buildZone(zone, i) {
    const el = document.createElement('div');
    el.className = 'zone';
    el.style.zIndex = zone.z ?? i + 1;
    if (zone.opacity != null) el.style.opacity = zone.opacity;

    if (inferType(zone) === 'playlist') startPlaylist(zone, el);
    else el.appendChild(buildContent(zone, zone));

    const ui = document.createElement('div');
    ui.className = 'edit-ui';
    ui.innerHTML = '<span class="label"></span><i class="resize"></i>' +
      CORNERS.map((_, c) => `<i class="warp" data-corner="${c}"></i>`).join('');
    el.appendChild(ui);

    stage.appendChild(el);
    zoneEls[i] = el;
    layoutZone(i);
  }

  function layoutZone(i) {
    const zone = cfg.zones[i], el = zoneEls[i];
    Object.assign(el.style, {
      left: zone.x + 'px',
      top: zone.y + 'px',
      width: zone.w + 'px',
      height: zone.h + 'px',
    });
    el.style.transform = zone.warp ? cornerPin(zone.w, zone.h, zone.warp) : (zone.transform ?? '');
    el.style.transformOrigin = zone.warp ? '0 0' : 'center';
    el.querySelector('.label').textContent =
      `${zoneName(zone, i)} · ${inferType(zone)} · ${zone.x},${zone.y} ${zone.w}×${zone.h}${zone.warp ? ' · warped' : ''}`;
  }

  // ---------- edit mode ----------

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    updateToolbar();
    if (!on) select(null);
    renderHud();
  }

  function select(i) {
    if (selected != null) zoneEls[selected]?.classList.remove('selected');
    selected = i;
    if (i != null) zoneEls[i].classList.add('selected');
    renderHud();
  }

  function changed(i) {
    dirty = true;
    const zone = cfg.zones[i];
    if (zone.warp && zone.warp.every(([x, y]) => !x && !y)) delete zone.warp;
    layoutZone(i);
    renderHud();
  }

  // Call before changing any zone so the change can be undone.
  function snapshot() {
    undoStack.push(cfg.zones.map(({ x, y, w, h, warp }) => ({ x, y, w, h, warp })));
    if (undoStack.length > 200) undoStack.shift();
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return showFlash('Nothing to undo.');
    prev.forEach((geo, i) => {
      Object.assign(cfg.zones[i], geo);
      if (!geo.warp) delete cfg.zones[i].warp;
      layoutZone(i);
    });
    dirty = undoStack.length > 0;
    renderHud();
  }
  undoBtn.addEventListener('click', undo);

  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  function renderHud() {
    undoBtn.disabled = !undoStack.length;
    // With help hidden (H), the panel only appears to show a flash message.
    hud.hidden = !editing || (!showHelp && !flash);
    if (hud.hidden) return;
    if (!showHelp) { hud.innerHTML = `<b>${esc(flash)}</b>`; return; }
    const z = selected != null ? cfg.zones[selected] : null;
    hud.innerHTML = [
      `<b>EDIT MODE</b>  stage ${cfg.stage.width}×${cfg.stage.height}` +
        (dirty ? '  <span class="warn">● unsaved changes — press C to copy config</span>' : ''),
      z ? `selected: <b>${esc(zoneName(z, selected))}</b>  x ${z.x}  y ${z.y}  w ${z.w}  h ${z.h}` +
          (z.warp ? `\nwarp: ${esc(JSON.stringify(z.warp))}` : '')
        : 'click a zone to select it',
      '',
      'drag = move   cyan square = resize   pink dots = corner-pin (keystone)',
      'arrows = nudge (shift ×10)   alt+arrows = resize   tab = next zone',
      'Ctrl+Z = undo   R = reset warp   G = grid   F = fullscreen',
      'C = copy config   D = download config.js   H = hide this help   E = exit',
      flash ? `\n<b>${esc(flash)}</b>` : '',
    ].join('\n');
  }

  function showFlash(msg) {
    flash = msg;
    renderHud();
    clearTimeout(showFlash.t);
    showFlash.t = setTimeout(() => { flash = ''; renderHud(); }, 3000);
  }

  function serialize() {
    const json = JSON.stringify(cfg, null, 2)
      // keep numeric arrays like [10, -4] on one line
      .replace(/\[\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)*)\s*\]/g, (_, inner) => `[${inner.split(/\s*,\s*/).join(', ')}]`);
    return `// Projector wall layout. See README.md for every option.\nwindow.CONFIG = ${json};\n`;
  }

  function downloadConfig() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([serialize()], { type: 'text/javascript' }));
    a.download = 'config.js';
    a.click();
    URL.revokeObjectURL(a.href);
    showFlash('Downloaded config.js — replace the one in the repo and push.');
  }

  async function copyConfig() {
    try {
      await navigator.clipboard.writeText(serialize());
      showFlash('Copied config to clipboard — paste over config.js and push.');
    } catch {
      downloadConfig();
    }
  }

  stage.addEventListener('pointerdown', e => {
    if (!editing) return;
    const zoneEl = e.target.closest('.zone');
    if (!zoneEl) return select(null);
    const i = zoneEls.indexOf(zoneEl);
    const zone = cfg.zones[i];
    select(i);
    e.preventDefault();

    const mode = e.target.classList.contains('warp') ? 'warp'
      : e.target.classList.contains('resize') ? 'resize' : 'move';
    const corner = +e.target.dataset.corner;
    const start = {
      px: e.clientX, py: e.clientY,
      x: zone.x, y: zone.y, w: zone.w, h: zone.h,
      warp: (zone.warp ?? CORNERS.map(() => [0, 0])).map(p => p.slice()),
    };

    let moved = false;
    const onMove = ev => {
      if (!moved) { moved = true; snapshot(); } // one undo step per drag
      const dx = Math.round((ev.clientX - start.px) / scaleX);
      const dy = Math.round((ev.clientY - start.py) / scaleY);
      if (mode === 'move') {
        zone.x = start.x + dx;
        zone.y = start.y + dy;
      } else if (mode === 'resize') {
        zone.w = Math.max(10, start.w + dx);
        zone.h = Math.max(10, start.h + dy);
      } else {
        const warp = start.warp.map(p => p.slice());
        warp[corner] = [warp[corner][0] + dx, warp[corner][1] + dy];
        zone.warp = warp;
      }
      changed(i);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', onMove), { once: true });
  });

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'f') return toggleFullscreen();
    if (k === 'g') { grid.hidden = !grid.hidden; return; }
    if (k === 'e') return setEditing(!editing);
    if (!editing) return;

    if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); return undo(); }
    if (k === 'c') return copyConfig();
    if (k === 'd') return downloadConfig();
    if (k === 'h') {
      showHelp = !showHelp;
      try { localStorage.setItem('wall.showHelp', showHelp ? 'yes' : 'no'); } catch {}
      return renderHud();
    }
    if (k === 'escape') return select(null);
    if (k === 'tab') {
      e.preventDefault();
      const n = cfg.zones.length;
      return select(selected == null ? 0 : (selected + (e.shiftKey ? n - 1 : 1)) % n);
    }
    if (selected == null) return;
    const zone = cfg.zones[selected];
    if (k === 'r') {
      if (!zone.warp) return;
      snapshot();
      delete zone.warp;
      return changed(selected);
    }

    const arrows = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      snapshot();
      const step = e.shiftKey ? 10 : 1;
      const [dx, dy] = arrows[k].map(v => v * step);
      if (e.altKey) { zone.w = Math.max(10, zone.w + dx); zone.h = Math.max(10, zone.h + dy); }
      else { zone.x += dx; zone.y += dy; }
      changed(selected);
    }
  });

  addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

  // ---------- display niceties ----------

  // Toolbar shows in edit mode, or briefly whenever the mouse moves.
  function updateToolbar() {
    toolbar.hidden = !(editing || mouseActive);
    undoBtn.hidden = !editing;
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit fullscreen (F)' : '⛶ Fullscreen (F)';
  }
  addEventListener('mousemove', () => {
    mouseActive = true;
    document.body.classList.add('mouse-active');
    updateToolbar();
    clearTimeout(mouseTimer);
    mouseTimer = setTimeout(() => {
      mouseActive = false;
      document.body.classList.remove('mouse-active');
      updateToolbar();
    }, 3000);
  });
  document.addEventListener('fullscreenchange', updateToolbar);
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  addEventListener('dblclick', () => { if (!editing) toggleFullscreen(); });

  // Keep the display computer's screen from sleeping (works on https / localhost).
  async function keepAwake() {
    try { await navigator.wakeLock?.request('screen'); } catch {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

  if (cfg.reloadMinutes > 0) {
    setInterval(() => { if (!dirty) location.reload(); }, cfg.reloadMinutes * 60_000);
  }

  // ---------- go ----------

  fitStage();
  addEventListener('resize', fitStage);
  cfg.zones.forEach(buildZone);
  keepAwake();
  if (new URLSearchParams(location.search).has('edit')) setEditing(true);
  if (new URLSearchParams(location.search).has('grid')) grid.hidden = false;
})();
