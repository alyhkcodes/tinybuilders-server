const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store all active rooms in memory
const rooms = {};

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Make sure code is unique
  if (rooms[code]) return makeRoomCode();
  return code;
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // ---- CREATE ROOM ----
  socket.on("createRoom", ({ name, mapId, mode, team }) => {
    const roomCode = makeRoomCode();

    rooms[roomCode] = {
  players: { [socket.id]: { name: name || "Player", color: "#ff85b3", team: team || "red" } },
      objects: [],
      mapId: mapId || "meadow"
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit("roomCreated", { roomCode, objects: [], players: rooms[roomCode].players, mapId: rooms[roomCode].mapId, mode: rooms[roomCode].mode });

    console.log(`Room ${roomCode} created by ${name}`);
  });

  // ---- JOIN ROOM ----
  socket.on("joinRoom", ({ roomCode, name, team }) => {
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("joinError", "Room not found! Check the code.");
      return;
    }

    if (Object.keys(room.players).length >= 4) {
      socket.emit("joinError", "Room is full (max 4 players).");
      return;
    }

    const colors = ["#ff85b3", "#c4a8ff", "#ffe066", "#7ecb6f", "#ffb347", "#87ceeb"];
    const takenColors = Object.values(room.players).map(p => p.color);
    const availableColor = colors.find(c => !takenColors.includes(c)) || colors[0];

    room.players[socket.id] = { name: name || "Player", color: availableColor, team: team || "red" };
    socket.join(roomCode);
    socket.roomCode = roomCode;

    // Tell joining player the current state
    socket.emit("roomJoined", {
      roomCode,
      objects: room.objects,
      players: room.players,
      mapId: room.mapId || "meadow"
    });

    // Tell everyone in room about updated players
    io.to(roomCode).emit("playersUpdated", room.players);

    console.log(`${name} joined room ${roomCode}`);
  });

  // ---- PLACE OBJECT ----
  socket.on("placeObject", ({ roomCode, object }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.objects.push(object);

    // Tell everyone in room
    io.to(roomCode).emit("objectsUpdated", room.objects);
  });

  // ---- UPDATE OBJECT (move/resize/rotate) ----
  socket.on("updateObject", ({ roomCode, object }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const idx = room.objects.findIndex(o => o.id === object.id);
    if (idx !== -1) room.objects[idx] = object;
    // Broadcast to others only (sender already has latest)
    socket.to(roomCode).emit("objectTransformed", object);
  });

  // ---- DELETE OBJECT ----
  socket.on("deleteObject", ({ roomCode, objectId }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.objects = room.objects.filter(obj => obj.id !== objectId);

    // Tell everyone in room
    io.to(roomCode).emit("objectsUpdated", room.objects);
  });

  // ---- CHANGE MAP ----
  socket.on("changeMap", ({ roomCode, mapId }) => {
    const room = rooms[roomCode];
    if (!room || !mapId) return;

    room.mapId = mapId;
    io.to(roomCode).emit("mapChanged", { mapId });
  });

  // ---- MOVE STICKMAN ----
  socket.on("moveStickman", ({ roomCode, x, y, color, name }) => {
    // Broadcast to everyone EXCEPT sender
    socket.to(roomCode).emit("stickmanMoved", {
      id: socket.id,
      x, y, color, name
    });
  });
  // ---- BULLET FIRED ----
  socket.on("bulletFired", ({ roomCode, bullet }) => {
    socket.to(roomCode).emit("bulletFired", bullet);
  });

  // ---- PLAYER HIT ----
  socket.on("playerHit", ({ roomCode, targetId, damage }) => {
    io.to(roomCode).emit("playerHit", { targetId, damage });
  });

  // ---- OBJECT HIT ----
  socket.on("objHit", ({ roomCode, objId, hp }) => {
    socket.to(roomCode).emit("objHit", { objId, hp });
  });

  // ---- DISCONNECT ----
  socket.on("disconnect", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];
    delete room.players[socket.id];

    // Tell remaining players
    io.to(roomCode).emit("playersUpdated", room.players);

    // Clean up empty rooms
    if (Object.keys(room.players).length === 0) {
      delete rooms[roomCode];
      console.log(`Room ${roomCode} deleted (empty)`);
    }

    console.log(`Player ${socket.id} left room ${roomCode}`);
  });
});

// Health check route (Render needs this)
app.get("/", (req, res) => {
  res.send("TinyBuilders server is running! 🏠");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TinyBuilders server running on port ${PORT}`);
});
