const socket = io();
const gameCanvas = document.getElementById('gameCanvas');
const gctx = gameCanvas.getContext('2d');

const bootOverlay = document.getElementById('bootOverlay');
const passInput = document.getElementById('passInput');
const passBtn = document.getElementById('passBtn');
const passMsg = document.getElementById('passMsg');

const container = document.getElementById('container');
const nameInput = document.getElementById('nameInput');
const colorInput = document.getElementById('colorInput');
const joinBtn = document.getElementById('joinBtn');
const msgDiv = document.getElementById('msg');
const leadersDiv = document.getElementById('leaders');
const playersCountDiv = document.getElementById('playersCount');
const targetInfo = document.getElementById('targetInfo');

const chatWindow = document.getElementById('chatWindow');
const chatInput = document.getElementById('chatInput');
const devCodeInput = document.getElementById('devCodeInput');

let grid = {w:40,h:30};
let localId = null;
let snakes = [];
let foods = [];
let specialPowers = [];
let currentTarget = null;

function resizeCanvas(){
  const main = document.getElementById('main');
  const padding = 20;
  const availableW = main.clientWidth - padding;
  const availableH = main.clientHeight - padding;
  const cellW = Math.floor(Math.min(availableW / grid.w, availableH / grid.h));
  gameCanvas.width = cellW * grid.w || 800;
  gameCanvas.height = cellW * grid.h || 600;
}
window.addEventListener('resize', resizeCanvas);

// Boot / password flow
passBtn.onclick = () => {
  const pass = passInput.value;
  if (pass === 'PEGASUS') {
    document.getElementById('bootOverlay').style.display = 'none';
    document.getElementById('container').style.display = 'flex';

    // Aquí arrancamos la música
    const music = document.getElementById('bgMusic');
    music.volume = 0.5;
    music.play().catch(err => console.log('Error reproduciendo música:', err));
  } else {
    passMsg.textContent = 'Contraseña incorrecta';
  }
};


// join with password (server validates too)
joinBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Player';
  const color = colorInput.value || '#00aa00';
  const password = 'PEGASUS';
  socket.emit('join',{name, color, password}, (res)=>{
    if (!res || !res.ok){ 
      msgDiv.innerText = 'No se pudo unir: ' + (res && res.reason || ''); 
      return; 
    }
    localId = res.id;
    msgDiv.innerText = '';

    // Ocultar pantalla de contraseña y mostrar juego
    document.getElementById('bootOverlay').style.display = 'none';
    document.getElementById('container').style.display = 'flex';

    // Reproducir música en loop
    const music = document.getElementById('bgMusic');
    music.volume = 0.5; // opcional
    music.play().catch(err => console.log('Error reproduciendo música:', err));
  });
};


// inputs: movement
const keyMap = { 'ArrowUp':'up','ArrowDown':'down','ArrowLeft':'left','ArrowRight':'right', 'w':'up','s':'down','a':'left','d':'right' };
window.addEventListener('keydown', e => {
  const dir = keyMap[e.key];
  if (dir) socket.emit('input',{dir});
  // respawn key 'space' when dead
  if (e.key === ' ' && localId && snakes.find(s => s.id === localId && !s.alive)){
    socket.emit('respawn');
  }
});

// chat send
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim()){
    socket.emit('chat', { text: chatInput.value.trim() });
    chatInput.value = '';
  }
});

// dev codes input
devCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && devCodeInput.value.trim()){
    const code = devCodeInput.value.trim().toLowerCase();
    handleDevCode(code);
    devCodeInput.value = '';
  }
});

function handleDevCode(code) {
  switch(code) {
    case 'rainbow':
      socket.emit('devCode', { code: 'rainbow' });
      break;
    case 'speed':
      socket.emit('devCode', { code: 'speed' });
      break;
    case 'ghost':
      socket.emit('devCode', { code: 'ghost' });
      break;
    case 'reset':
      socket.emit('devCode', { code: 'reset' });
      break;
    default:
      console.log('Unknown dev code:', code);
  }
}

socket.on('chat', (m) => {
  const div = document.createElement('div');
  if (m.from === '_system'){
    div.innerHTML = `<em style="color:#9fb8d9">${m.text}</em>`;
  } else {
    const sw = `<span style="display:inline-block;width:12px;height:12px;background:${m.color||'#ccc'};margin-right:8px;border-radius:3px;border:1px solid rgba(0,0,0,0.2)"></span>`;
    div.innerHTML = sw + `<strong>${m.from}:</strong> ${escapeHtml(m.text)}`;
  }
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
});

socket.on('playSound', (data) => {
  const audio = document.getElementById(data.sound);
  if (audio) {
    audio.currentTime = 0;
    audio.volume = 0.3;
    audio.play().catch(err => console.log('Error playing sound:', err));
  }
});

socket.on('state', st => {
  snakes = st.snakes;
  foods = st.foods;
  specialPowers = st.specialPowers || [];
  grid = st.grid || grid;
  currentTarget = st.target;
  targetInfo.innerText = 'Target: ' + (currentTarget || '--');
  resizeCanvas();
  render();
  renderLeaderboard(st.leaderboard);
  playersCountDiv.innerText = 'Jugadores: ' + snakes.length;
});

function render(){
  const W = gameCanvas.width, H = gameCanvas.height;
  const cellW = W / grid.w, cellH = H / grid.h;
  gctx.clearRect(0,0,W,H);

  // faint grid
  gctx.strokeStyle = 'rgba(255,255,255,0.02)';
  gctx.lineWidth = 1;
  for (let x=0;x<=grid.w;x++){ gctx.beginPath(); gctx.moveTo(x*cellW,0); gctx.lineTo(x*cellW,H); gctx.stroke(); }
  for (let y=0;y<=grid.h;y++){ gctx.beginPath(); gctx.moveTo(0,y*cellH); gctx.lineTo(W,y*cellH); gctx.stroke(); }

  // foods
  for (const f of foods){
    gctx.fillStyle = '#ffcc00';
    const px = f.x * cellW, py = f.y * cellH;
    gctx.beginPath();
    gctx.arc(px + cellW/2, py + cellH/2, Math.min(cellW,cellH)*0.35, 0, Math.PI*2);
    gctx.fill();
  }

  // special powers
  for (const p of specialPowers){
    gctx.fillStyle = '#ff3366';
    const px = p.x * cellW, py = p.y * cellH;
    gctx.beginPath();
    gctx.arc(px + cellW/2, py + cellH/2, Math.min(cellW,cellH)*0.4, 0, Math.PI*2);
    gctx.fill();
    
    // Add a pulsing effect
    gctx.strokeStyle = '#ff6699';
    gctx.lineWidth = 2;
    gctx.beginPath();
    gctx.arc(px + cellW/2, py + cellH/2, Math.min(cellW,cellH)*0.45, 0, Math.PI*2);
    gctx.stroke();
  }

  // snakes
  for (const s of snakes){
    for (let i=0;i<s.segments.length;i++){
      const seg = s.segments[i];
      const px = seg.x * cellW, py = seg.y * cellH;
      const rad = Math.min(cellW,cellH)*0.12;
      
      // Rainbow effect
      if (s.rainbow) {
        const hue = (Date.now() / 10 + i * 30) % 360;
        gctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
      } else {
        gctx.fillStyle = s.color || '#33cc33';
      }
      
      roundRect(gctx, px+1, py+1, cellW-2, cellH-2, rad, true, false);
    }
  }
}

function renderLeaderboard(lb){
  leadersDiv.innerHTML = '';
  for (const item of lb){
    const row = document.createElement('div');
    row.className = 'leaderItem';
    const sw = document.createElement('div'); 
    sw.className='colorSwatch'; 
    if (item.rainbow) {
      sw.style.background = 'linear-gradient(45deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)';
      sw.style.backgroundSize = '200% 200%';
      sw.style.animation = 'rainbow-gradient 2s ease infinite';
    } else {
      sw.style.background = item.color || '#33cc33';
    }
    const txt = document.createElement('div'); txt.className='leaderText'; txt.innerText = item.name;
    const score = document.createElement('div'); score.className='leaderScore'; score.innerText = item.len;
    row.appendChild(sw); row.appendChild(txt); row.appendChild(score);
    leadersDiv.appendChild(row);
  }
}

// helpers
function roundRect(ctx,x,y,w,h,r,fill,stroke){
  if (typeof r === 'undefined') r=5;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function escapeHtml(unsafe){
  return unsafe.replace(/[&<"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','"':'&quot;',"'":'&#039;'}[m]) });
}

resizeCanvas();
