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
  socket.on("createRoom", ({ name }) => {
    const roomCode = makeRoomCode();

    rooms[roomCode] = {
      players: {
        [socket.id]: { name: name || "Player", color: "#ff85b3" }
      },
      objects: []
    };

    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit("roomCreated", {
      roomCode,
      objects: [],
      players: rooms[roomCode].players
    });

    console.log(`Room ${roomCode} created by ${name}`);
  });

  // ---- JOIN ROOM ----
  socket.on("joinRoom", ({ roomCode, name }) => {
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

    room.players[socket.id] = { name: name || "Player", color: availableColor };
    socket.join(roomCode);
    socket.roomCode = roomCode;

    // Tell joining player the current state
    socket.emit("roomJoined", {
      roomCode,
      objects: room.objects,
      players: room.players
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

  // ---- DELETE OBJECT ----
  socket.on("deleteObject", ({ roomCode, objectId }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.objects = room.objects.filter(obj => obj.id !== objectId);

    // Tell everyone in room
    io.to(roomCode).emit("objectsUpdated", room.objects);
  });

  // ---- MOVE STICKMAN ----
  socket.on("moveStickman", ({ roomCode, x, y, color, name }) => {
    // Broadcast to everyone EXCEPT sender
    socket.to(roomCode).emit("stickmanMoved", {
      id: socket.id,
      x, y, color, name
    });
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
