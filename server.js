const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve home.html as the root page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

app.use(express.static(path.join(__dirname)));

let mapData = null;
let hostId = null;
let players = {};
let zoneRequests = {};
let lastAllowedPositions = {};

function getZoneIdAt(map, x, y) {
  if (!map) return null;
  let col = Math.floor(x / 32),
    row = Math.floor(y / 32);
  if (row < 0 || row >= map.length) return null;
  if (col < 0 || col >= map[0].length) return null;
  return map[row][col];
}

io.on("connection", (socket) => {
  if (mapData) socket.emit("mapData", mapData);

  socket.on("submitMap", (data) => {
    if (!mapData) {
      mapData = { map: data.map, zoneColors: data.zoneColors };
      hostId = socket.id;
      io.emit("mapData", mapData);
    }
  });

  socket.on("joinAfterMap", (playerInfo) => {
    if (!mapData) return;
    let spawn = null;
    for (let y = 0; y < mapData.map.length && !spawn; ++y) {
      for (let x = 0; x < mapData.map[0].length && !spawn; ++x) {
        if (mapData.map[y][x] === 1) {
          spawn = { x: x * 32 + 16, y: y * 32 + 16 };
        }
      }
    }
    if (!spawn) spawn = { x: 2 * 32 + 16, y: 2 * 32 + 16 };
    
    const name = (playerInfo && playerInfo.name) ? playerInfo.name : 'Anonymous';
    const color = (playerInfo && playerInfo.color) ? playerInfo.color : '#3182ce';
    const style = (playerInfo && playerInfo.style) ? playerInfo.style : 'casual';
    const hair = (playerInfo && playerInfo.hair) ? playerInfo.hair : 'short';

    let isHost = socket.id === hostId;
    players[socket.id] = {
      id: socket.id,
      name: name,
      color: color,
      style: style,
      hair: hair,
      x: spawn.x,
      y: spawn.y,
      zoneId: 1,
      role: isHost ? "host" : "user",
      permissions: isHost ? null : { 1: true },
    };
    lastAllowedPositions[socket.id] = { x: spawn.x, y: spawn.y, zoneId: 1 };
    broadcastState();
  });

  socket.on("playerMove", ({ x, y }) => {
    if (!players[socket.id] || !mapData) return;
    let zid = getZoneIdAt(mapData.map, x, y);
    let player = players[socket.id];

    if (player.role === "host" || (player.permissions && player.permissions[zid])) {
        player.x = x;
        player.y = y;
        player.zoneId = zid;
        lastAllowedPositions[socket.id] = { x, y, zoneId: zid };
        if (zoneRequests[socket.id]) delete zoneRequests[socket.id];
    } else if (zid !== 0 && zid !== null && zid !== 1) {
        if (!zoneRequests[socket.id] || zoneRequests[socket.id].status === 'denied') {
            zoneRequests[socket.id] = { zoneId: zid, status: "pending" };
        }
    }
    broadcastState();
  });

  socket.on("zonePermissionResponse", ({ userId, zoneId, approved }) => {
    if (!players[userId] || socket.id !== hostId) return;
    
    if (approved) {
      players[userId].permissions[zoneId] = true;
      if(zoneRequests[userId]) delete zoneRequests[userId];
    } else {
      zoneRequests[userId] = { zoneId, status: "denied" };
      const pos = lastAllowedPositions[userId];
      if (pos && players[userId]) {
        players[userId].x = pos.x;
        players[userId].y = pos.y;
        players[userId].zoneId = pos.zoneId;
      }
    }
    broadcastState();

    if(!approved) {
        setTimeout(() => {
            if(zoneRequests[userId] && zoneRequests[userId].status === 'denied') {
                delete zoneRequests[userId];
                broadcastState();
            }
        }, 2000);
    }
  });

  socket.on("disconnect", () => {
    if (socket.id === hostId) {
      io.emit("meetingEnded", { reason: "Host left the meeting" });
      mapData = null;
      hostId = null;
      players = {};
      zoneRequests = {};
      lastAllowedPositions = {};
    } else {
      delete players[socket.id];
      delete zoneRequests[socket.id];
      delete lastAllowedPositions[socket.id];
      broadcastState();
    }
  });

  function broadcastState() {
    let zoneRoster = {};
    for (let pid in players) {
      let p = players[pid];
      if (!p.zoneId) continue;
      if (!zoneRoster[p.zoneId]) zoneRoster[p.zoneId] = [];
      zoneRoster[p.zoneId].push({
        id: p.id,
        name: p.name,
        color: p.color,
        style: p.style,
        hair: p.hair,
        role: p.role,
      });
    }
    io.emit("updateState", { players, zoneRoster, hostId, zoneRequests });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
