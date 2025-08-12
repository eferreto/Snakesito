// server.js — final version with password, chat, target formula, pause and reset on 'r'
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 3000;
const GRID_W = 40;
const GRID_H = 30;
const TICK_RATE = 10;
const MAX_PLAYERS = 10;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname,'public')));

let snakes = {}; // socketId -> snake
let foods = [];
let specialPowers = [];
let nextFoodId = 1;
let nextPowerId = 1;

function rndInt(max){ return Math.floor(Math.random()*max); }
function posKey(p){ return `${p.x},${p.y}`; }

function randomEmptyCell(){
  for (let i=0;i<1000;i++){
    const x = rndInt(GRID_W), y = rndInt(GRID_H);
    let occ = false;
    for (const id in snakes){
      const s = snakes[id];
      for (const seg of s.segments){ if (seg.x===x && seg.y===y){ occ=true; break; } }
      if (occ) break;
    }
    // Check special powers too
    for (const p of specialPowers){
      if (p.x === x && p.y === y){ occ = true; break; }
    }
    // Check foods too
    for (const f of foods){
      if (f.x === x && f.y === y){ occ = true; break; }
    }
    if (!occ) return {x,y};
  }
  return {x:0,y:0};
}

const FOOD_MODE = process.env.FOOD_MODE || 'ceil';

function ensureFoodCount(){
  const numPlayers = Object.keys(snakes).length;
  const target = Math.max(1, (FOOD_MODE==='ceil' ? Math.ceil(numPlayers/2) : Math.floor(numPlayers/2)));
  while (foods.length < target){ const p = randomEmptyCell(); foods.push({x:p.x,y:p.y,id:nextFoodId++}); }
  while (foods.length > target) foods.pop();
}

function checkSpecialPowerSpawn(){
  // Check if any snake has gained 10 points since last power spawn
  for (const id in snakes){
    const s = snakes[id];
    if (s.alive && s.segments.length >= 13 && (s.segments.length - 3) % 10 === 0 && !s.powerSpawned){
      // Spawn special power
      const pos = randomEmptyCell();
      specialPowers.push({x: pos.x, y: pos.y, id: nextPowerId++});
      s.powerSpawned = true;
      console.log(`Special power spawned for ${s.name} at ${s.segments.length} length`);
      break;
    }
  }
}

function createSnakeBase(name, color, id){
  const start = randomEmptyCell();
  const dir = ['up','down','left','right'][rndInt(4)];
  const segments = [{x:start.x,y:start.y}];
  for (let i=1;i<3;i++) segments.push({x:(start.x+i)%GRID_W,y:start.y});
  return { id, name, color, segments, dir, nextDir:dir, alive:true, grow:0, powerSpawned:false };
}

// target formula: start 50 for 1 player, then decrease with each extra player incrementally
function computeTarget(){
  const n = Math.max(1, Object.keys(snakes).length);
  if (n === 1) return 50;
  let target = 50;
  const decrements = [10,5,3,2]; // for player 2,3,4,5
  for (let i=2;i<=n;i++){
    const idx = i-2;
    if (idx < decrements.length) target -= decrements[idx];
    else target -= 1;
  }
  return Math.max(10, Math.round(target));
}

io.on('connection', socket => {
  console.log('conn', socket.id);

  // join requires password 'PEGASUS'
  socket.on('join', ({name,color,password}, cb)=>{
    if (password !== 'PEGASUS'){ if (cb) cb({ok:false,reason:'wrong password'}); return; }
    if (Object.keys(snakes).length >= MAX_PLAYERS){ if (cb) cb({ok:false,reason:'max players'}); return; }
    const sn = createSnakeBase(name||('P'+(Object.keys(snakes).length+1)), color||'#'+Math.floor(Math.random()*16777215).toString(16), socket.id);
    snakes[socket.id] = sn;
    ensureFoodCount();
    if (cb) cb({ok:true,id:socket.id});
    io.emit('chat', {from:'_system', text: `${sn.name} se unió`});
  });

  socket.on('input', ({dir})=>{
    const s = snakes[socket.id]; if (!s || !s.alive) return;
    const opposite = { up:'down', down:'up', left:'right', right:'left' };
    if (dir && dir!==opposite[s.dir]) s.nextDir = dir;
  });

  socket.on('chat', ({text})=>{
    const s = snakes[socket.id];
    const name = s ? s.name : 'Anon';
    const color = s ? s.color : '#cccccc';
    io.emit('chat', { from: name, text, color });
  });

  socket.on('respawn', ()=>{
    const s = snakes[socket.id];
    if (s && !s.alive){
      // Preserve cheat codes
      const rainbow = s.rainbow;
      const speed = s.speed;
      const ghost = s.ghost;
      
      // Create new snake
      const newSnake = createSnakeBase(s.name, s.color, socket.id);
      
      // Restore cheat codes
      newSnake.rainbow = rainbow;
      newSnake.speed = speed;
      newSnake.ghost = ghost;
      
      snakes[socket.id] = newSnake;
      ensureFoodCount();
      io.emit('chat', {from:'_system', text: `${s.name} reapareció`});
    }
  });

  socket.on('devCode', ({code})=>{
    const s = snakes[socket.id];
    if (!s) return;
    
    switch(code) {
      case 'rainbow':
        s.rainbow = true;
        io.emit('chat', {from:'_system', text: `${s.name} activó modo arcoíris!`});
        break;
      case 'speed':
        s.speed = true;
        io.emit('chat', {from:'_system', text: `${s.name} activó modo velocidad!`});
        break;
      case 'ghost':
        s.ghost = true;
        io.emit('chat', {from:'_system', text: `${s.name} activó modo fantasma!`});
        break;
    }
  });

  socket.on('disconnect', ()=>{
    const s = snakes[socket.id];
    if (s){ delete snakes[socket.id]; ensureFoodCount(); io.emit('chat', {from:'_system', text: `${s.name} salió`}); }
  });
});

function inBounds(p){ return p.x>=0 && p.x<GRID_W && p.y>=0 && p.y<GRID_H; }
function movePoint(p,dir){ const r={x:p.x,y:p.y}; if(dir==='up') r.y--; if(dir==='down') r.y++; if(dir==='left') r.x--; if(dir==='right') r.x++; return r; }

function tick(){
  const newHeads = {};
  for (const id in snakes){ const s = snakes[id]; if (!s.alive) continue; s.dir = s.nextDir || s.dir; newHeads[id] = movePoint(s.segments[0], s.dir); }

  const bodyMap = new Map();
  for (const id in snakes){ const s = snakes[id]; if (!s.alive) continue; for (let i=0;i<s.segments.length;i++){ const seg=s.segments[i]; const key=posKey(seg); if (!bodyMap.has(key)) bodyMap.set(key,[]); bodyMap.get(key).push({owner:id,index:i}); } }

  const willDie = new Set();
  for (const id in newHeads){
    const nh = newHeads[id];
    if (!inBounds(nh)){ willDie.add(id); continue; }
    const key = posKey(nh);
    if (bodyMap.has(key)){
      const owners = bodyMap.get(key);
      let collision = true;
      if (owners.length===1 && owners[0].owner===id){
        const s = snakes[id];
        const tail = s.segments[s.segments.length-1];
        const tailKey = posKey(tail);
        if (key===tailKey && s.grow===0) collision=false;
      }
      if (collision) willDie.add(id);
    }
  }

  const headCounts = {};
  for (const id in newHeads){ const key=posKey(newHeads[id]); headCounts[key]=headCounts[key]||[]; headCounts[key].push(id); }
  for (const key in headCounts){ if (headCounts[key].length>1) for (const id of headCounts[key]) willDie.add(id); }

  for (const id of willDie){ const s = snakes[id]; if (s) s.alive=false; }

  for (const id in snakes){
    const s = snakes[id]; if (!s.alive) continue;
    const nh = newHeads[id];
    
    // Check for special power pickup
    const powerIdx = specialPowers.findIndex(p => p.x === nh.x && p.y === nh.y);
    if (powerIdx !== -1){
      specialPowers.splice(powerIdx, 1);
      // Play power sound for the player who got the power
      io.to(id).emit('playSound', { sound: 'powerSound' });
      // Find a random other alive player to reduce their tail
      const otherPlayers = Object.values(snakes).filter(other => other.alive && other.id !== id);
      if (otherPlayers.length > 0){
        const target = otherPlayers[rndInt(otherPlayers.length)];
        const reduction = Math.min(10, target.segments.length - 3); // Don't reduce below 3 segments
        for (let i = 0; i < reduction; i++){
          if (target.segments.length > 3) target.segments.pop();
        }
        io.emit('chat', {from:'_system', text: `${s.name} usó poder especial contra ${target.name}! (-${reduction} segmentos)`});
      }
    }
    
    const fIdx = foods.findIndex(f => f.x===nh.x && f.y===nh.y);
    if (fIdx !== -1){ s.grow += 1; foods.splice(fIdx,1); }
    s.segments.unshift(nh);
    if (s.grow>0) s.grow -= 1; else s.segments.pop();
    
    // Reset power spawn flag when length changes
    if (s.segments.length % 10 !== 3) s.powerSpawned = false;
  }

  ensureFoodCount();
  checkSpecialPowerSpawn();

  const publicSnakes = Object.values(snakes).map(s => ({ 
    id:s.id, 
    name:s.name, 
    color:s.color, 
    segments:s.segments, 
    alive:s.alive,
    rainbow: s.rainbow || false,
    speed: s.speed || false,
    ghost: s.ghost || false
  }));
  const leaderboard = publicSnakes.filter(s=>s.alive).map(s=>({ name:s.name, len:s.segments.length, color:s.color, rainbow:s.rainbow })).sort((a,b)=>b.len-a.len);

  const target = computeTarget();
  io.emit('state',{ snakes: publicSnakes, foods, specialPowers, leaderboard, grid:{w:GRID_W,h:GRID_H}, target });

}

setInterval(tick, 1000 / TICK_RATE);
server.listen(PORT, ()=>console.log(`Server listening on port ${PORT}`));
