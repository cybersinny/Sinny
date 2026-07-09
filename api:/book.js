
bash

cat > /home/claude/bookshelf/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>The Shelf</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap');

  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    background: #e9e6df;
    font-family: 'Inter', sans-serif;
    overflow: hidden;
    transition: background 0.6s ease;
  }
  body.night { background: #14131a; }
  canvas { display: block; }

  #hud {
    position: fixed; top: 0; left: 0; width: 100%;
    padding: 22px 28px;
    display: flex; justify-content: space-between; align-items: flex-start;
    pointer-events: none;
    z-index: 10;
  }
  #title {
    font-family: 'Fraunces', serif;
    font-weight: 600;
    font-size: 22px;
    color: #2b2a28;
    letter-spacing: 0.3px;
    transition: color 0.6s ease;
  }
  body.night #title { color: #f0ede4; }
  #title span {
    display: block;
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 12px;
    color: #8a9c7e;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-top: 2px;
  }
  #count {
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    color: #7a766c;
    text-align: right;
    pointer-events: none;
  }
  #count b { color: #5c7a52; font-weight: 600; }
  body.night #count b { color: #c9a86a; }

  #topRight { display: flex; align-items: center; gap: 14px; pointer-events: auto; }

  #dimToggle {
    background: rgba(255,255,255,0.7);
    border: 1px solid rgba(0,0,0,0.08);
    border-radius: 999px;
    padding: 8px 14px;
    font-family: 'Inter', sans-serif;
    font-size: 12px;
    font-weight: 500;
    color: #4a4842;
    cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    transition: all 0.3s ease;
  }
  body.night #dimToggle {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.15);
    color: #e6e1d3;
  }

  #loadingBar {
    position: fixed; bottom: 0; left: 0; width: 100%;
    height: 3px; background: rgba(0,0,0,0.06);
    z-index: 40; overflow: hidden;
  }
  #loadingFill {
    height: 100%; width: 0%; background: #5c7a52;
    transition: width 0.25s ease;
  }
  #loadingLabel {
    position: fixed; bottom: 10px; left: 26px;
    font-size: 12px; color: #7a766c; z-index: 40;
    font-family: 'Inter', sans-serif;
  }
  body.night #loadingLabel { color: #a89f8c; }

  #errorBox {
    position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
    background: #fff; border: 1px solid rgba(0,0,0,0.1);
    border-radius: 10px; padding: 14px 20px; max-width: 420px;
    font-size: 13px; color: #7a3b3b; z-index: 50; display: none;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  }

  #hint {
    position: fixed; bottom: 26px; right: 26px;
    color: #9a9688; font-size: 12px; z-index: 10; pointer-events: none;
    transition: color 0.6s ease;
  }
  body.night #hint { color: #6a6658; }
</style>
</head>
<body>

<div id="hud">
  <div id="title">The Shelf<span>a walk-in catalog</span></div>
  <div id="topRight">
    <button id="dimToggle">🌙 <span id="dimLabel">Dim the lights</span></button>
    <div id="count"><b id="countNum">0</b> books</div>
  </div>
</div>

<div id="hint">Drag to look around · Scroll to zoom</div>
<div id="errorBox"></div>
<div id="loadingLabel"></div>
<div id="loadingBar"><div id="loadingFill"></div></div>

<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
<script>
// ---------- Palette ----------
const DAY = {
  bg: 0xe9e6df, fog: 0xe9e6df, fogDensity: 0.010,
  floor: 0xd9d5cb, wall: 0xf3f1ea,
  shelf: 0xf7f5ef, ambient: 0xffffff, ambientI: 1.15,
  key: 0xfff3de, keyI: 1.6,
  rim: 0xcfe0c8, rimI: 0.25
};
const NIGHT = {
  bg: 0x14131a, fog: 0x14131a, fogDensity: 0.020,
  floor: 0x1c1a22, wall: 0x201e26,
  shelf: 0x26232c, ambient: 0x2a2836, ambientI: 0.35,
  key: 0xffcf9e, keyI: 1.0,
  rim: 0x7a5cff, rimI: 0.5
};
let isNight = false;

// ---------- Three.js setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(DAY.bg);
scene.fog = new THREE.FogExp2(DAY.fog, DAY.fogDensity);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 300);
camera.position.set(0, 2.4, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.52;
controls.target.set(0, 2, 0);

// lighting
const ambientLight = new THREE.AmbientLight(DAY.ambient, DAY.ambientI);
scene.add(ambientLight);
const key = new THREE.SpotLight(DAY.key, DAY.keyI, 40, Math.PI/4, 0.6, 1.2);
key.position.set(3, 12, 6);
key.target.position.set(0, 3, 0);
scene.add(key, key.target);
const rim = new THREE.PointLight(DAY.rim, DAY.rimI, 25);
rim.position.set(-8, 4, -4);
scene.add(rim);

// back wall
const wallMat = new THREE.MeshStandardMaterial({ color: DAY.wall, roughness: 0.95 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), wallMat);
wall.position.set(0, 10, -2.2);
scene.add(wall);

// floor: light tile look via canvas texture
function makeTileTexture(dark) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = dark ? '#1c1a22' : '#e4e0d5';
  ctx.fillRect(0,0,512,512);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 3;
  const step = 512/6;
  for (let i=0; i<=6; i++){
    ctx.beginPath(); ctx.moveTo(i*step,0); ctx.lineTo(i*step,512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,i*step); ctx.lineTo(512,i*step); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14,14);
  return tex;
}
const floorTexDay = makeTileTexture(false);
const floorTexNight = makeTileTexture(true);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTexDay, roughness: 0.9 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
floor.rotation.x = -Math.PI/2;
scene.add(floor);

function makePlant(x, z, scale=1) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16*scale, 0.13*scale, 0.22*scale, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
  );
  pot.position.y = 0.11*scale;
  group.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x6f9a5c, roughness: 0.8 });
  for (let i=0;i<6;i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05*scale, 0.32*scale, 5), leafMat);
    const ang = (i/6) * Math.PI * 2;
    leaf.position.set(Math.cos(ang)*0.06*scale, 0.32*scale, Math.sin(ang)*0.06*scale);
    leaf.rotation.z = Math.cos(ang) * 0.4;
    leaf.rotation.x = -Math.sin(ang) * 0.4;
    group.add(leaf);
  }
  group.position.set(x, 0, z);
  scene.add(group);
  return group;
}

// shelf group
const shelfGroup = new THREE.Group();
scene.add(shelfGroup);

const SHELF_WIDTH = 8;
const SHELF_GAP_Y = 1.55;
const PER_ROW = 19;
const shelfMat = new THREE.MeshStandardMaterial({ color: DAY.shelf, roughness: 0.55 });

function buildShelfBoards(rows) {
  for (let r = 0; r <= rows; r++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(SHELF_WIDTH + 0.3, 0.08, 0.9), shelfMat);
    board.position.set(0, 0.6 + r * SHELF_GAP_Y, 0);
    shelfGroup.add(board);
  }
  [-1, 1].forEach(sign => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, rows * SHELF_GAP_Y + 0.6, 0.9), shelfMat);
    post.position.set(sign * (SHELF_WIDTH/2 + 0.15), 0.6 + (rows * SHELF_GAP_Y)/2, 0);
    shelfGroup.add(post);
  });
}

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';

const FALLBACK_TONES = [0xd8555c, 0x4a7a8c, 0xe0b84c, 0x6f9a5c, 0x8a6fa8, 0xd98f4c, 0x3f5c76, 0xc76b7a];

function avgColorFromImage(img) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 8;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 8, 8);
  const data = ctx.getImageData(0,0,8,8).data;
  let r=0,g=0,b=0,n=0;
  for (let i=0;i<data.length;i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; n++; }
  return new THREE.Color(r/n/255, g/n/255, b/n/255);
}

function makeBookMesh(book, index, row, col) {
  const w = 0.3 + (index % 3) * 0.03;
  const h = 1.25 + (index % 2) * 0.1;
  const d = 0.85;

  const fallback = new THREE.Color(FALLBACK_TONES[index % FALLBACK_TONES.length]);
  const spineMat = new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.6 });
  const mats = [spineMat.clone(), spineMat.clone(), spineMat.clone(), spineMat.clone(), spineMat.clone(), spineMat.clone()];

  const geo = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, mats);

  const x = -SHELF_WIDTH/2 + 0.35 + col * 0.37;
  const y = 0.6 + row * SHELF_GAP_Y + h/2 + 0.06;
  mesh.position.set(x, y, 0);
  mesh.rotation.y = (Math.random() - 0.5) * 0.03;
  mesh.userData.book = book;
  shelfGroup.add(mesh);

  if (book.cover) {
    textureLoader.load(book.cover, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const coverMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
      mesh.material[0] = coverMat;
      mesh.material.needsUpdate = true;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const col2 = avgColorFromImage(img);
        for (let i=1;i<6;i++){
          mesh.material[i] = new THREE.MeshStandardMaterial({ color: col2, roughness: 0.6 });
        }
        mesh.material.needsUpdate = true;
      };
      img.src = book.cover;
    });
  }
  return mesh;
}

function buildShelfFromBooks(books) {
  while (shelfGroup.children.length) shelfGroup.remove(shelfGroup.children[0]);
  const rows = Math.max(1, Math.ceil(books.length / PER_ROW));
  buildShelfBoards(rows);
  books.forEach((book, i) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    makeBookMesh(book, i, row, col);
  });
  document.getElementById('countNum').textContent = books.length;
}

makePlant(-4.4, -1.4, 1.4);
makePlant(4.3, -1.8, 1.0);

// ---------- Day/Night toggle ----------
function lerpColor(hexA, hexB, t) {
  const a = new THREE.Color(hexA), b = new THREE.Color(hexB);
  return a.clone().lerp(b, t);
}
function applyMode(night) {
  const from = night ? DAY : NIGHT;
  const to = night ? NIGHT : DAY;
  const duration = 700;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    scene.background = lerpColor(from.bg, to.bg, t);
    scene.fog.color = lerpColor(from.fog, to.fog, t);
    scene.fog.density = from.fogDensity + (to.fogDensity - from.fogDensity) * t;
    ambientLight.color = lerpColor(from.ambient, to.ambient, t);
    ambientLight.intensity = from.ambientI + (to.ambientI - from.ambientI) * t;
    key.color = lerpColor(from.key, to.key, t);
    key.intensity = from.keyI + (to.keyI - from.keyI) * t;
    rim.color = lerpColor(from.rim, to.rim, t);
    rim.intensity = from.rimI + (to.rimI - from.rimI) * t;
    wallMat.color = lerpColor(from.wall, to.wall, t);
    shelfMat.color = lerpColor(from.shelf, to.shelf, t);
    floorMat.map = t > 0.5 ? (night ? floorTexNight : floorTexDay) : floorMat.map;
    floorMat.needsUpdate = true;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  document.body.classList.toggle('night', night);
  document.getElementById('dimLabel').textContent = night ? 'Brighten up' : 'Dim the lights';
  document.getElementById('dimToggle').firstChild.textContent = night ? '☀️ ' : '🌙 ';
}
document.getElementById('dimToggle').onclick = () => {
  isNight = !isNight;
  applyMode(isNight);
};

// ---------- Animation loop ----------
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Notion + Google Books sync ----------
const CACHE_KEY = 'theshelf_cover_cache_v1';
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
  catch(e) { return {}; }
}
function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch(e) {}
}
const coverCache = loadCache();

function cacheKey(title, author) {
  return (title + '|' + (author||'')).toLowerCase().trim();
}

async function fetchGoogleBooksInfo(title, author) {
  const key = cacheKey(title, author);
  if (coverCache[key]) return coverCache[key];
  try {
    const q = encodeURIComponent(author ? `intitle:${title} inauthor:${author}` : title);
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`);
    const data = await res.json();
    const item = data.items && data.items[0];
    const cover = item?.volumeInfo?.imageLinks?.thumbnail?.replace('http://','https://') || null;
    const ids = item?.volumeInfo?.industryIdentifiers || [];
    const isbn13 = ids.find(i => i.type === 'ISBN_13')?.identifier || '';
    const result = { cover, isbn: isbn13 };
    coverCache[key] = result;
    return result;
  } catch (e) {
    return { cover: null, isbn: '' };
  }
}

async function runWithConcurrency(items, limit, worker) {
  let i = 0;
  let completed = 0;
  const results = new Array(items.length);
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
      completed++;
      updateProgress(completed, items.length);
    }
  }
  const runners = Array.from({length: limit}, next);
  await Promise.all(runners);
  return results;
}

function updateProgress(done, total) {
  const pct = total ? Math.round((done/total)*100) : 0;
  document.getElementById('loadingFill').style.width = pct + '%';
  document.getElementById('loadingLabel').textContent = `Loading covers… ${done}/${total}`;
  if (done >= total) {
    setTimeout(() => {
      document.getElementById('loadingLabel').textContent = '';
      document.getElementById('loadingFill').style.width = '0%';
    }, 1200);
  }
}

function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.style.display = 'block';
}

async function loadLibrary() {
  document.getElementById('loadingLabel').textContent = 'Fetching your catalog from Notion…';
  let notionBooks = [];
  try {
    const res = await fetch('/api/books');
    const data = await res.json();
    if (!res.ok) {
      showError('Could not load from Notion: ' + (data.error?.message || JSON.stringify(data.error) || 'unknown error'));
      return;
    }
    notionBooks = data.books || [];
  } catch (e) {
    showError('Could not reach /api/books. Is this running on Vercel with the environment variables set?');
    return;
  }

  document.getElementById('countNum').textContent = notionBooks.length;

  const enriched = await runWithConcurrency(notionBooks, 4, async (b) => {
    const info = await fetchGoogleBooksInfo(b.title, b.author);
    return {
      title: b.title,
      author: b.author,
      genre: b.genre,
      language: b.language,
      isbn: info.isbn || b.notionISBN || '',
      cover: info.cover
    };
  });

  saveCache(coverCache);
  buildShelfFromBooks(enriched);
}

loadLibrary();
</script>
</body>
</html>
HTMLEOF
cp /home/claude/bookshelf/index.html /mnt/user-data/outputs/index.html
cp /home/claude/bookshelf/api/books.js /mnt/user-data/outputs/books.js
echo done
Output

done

