const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const roomManager = require('./rooms');

const app = express();
const httpServer = createServer(app);

// ✅ Allow cross-origin requests
app.use(cors({
  origin: '*', // or specify your frontend origin like 'http://localhost:5173'
  methods: ['GET', 'POST'],
  credentials: true
}));

// ✅ Serve static client files
app.use(express.static(path.join(__dirname, '../client')));

// ✅ Configure Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: '*', // or specific origin like 'http://localhost:5173'
    methods: ['GET', 'POST']
  }
});

const generateUserColor = () => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#52B788', '#E76F51', '#2A9D8F'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUsername = null;

  socket.on('join-room', ({ roomName, username }) => {
    currentRoom = roomName;
    currentUsername = username;
    const userColor = generateUserColor();

    socket.join(roomName);

    const room = roomManager.addUserToRoom(roomName, socket.id, username, userColor);

    socket.emit('room-joined', {
      userId: socket.id,
      color: userColor,
      users: roomManager.getRoomUsers(roomName),
      drawingState: room.drawingState.getAllState()
    });

    socket.to(roomName).emit('user-joined', {
      id: socket.id,
      username,
      color: userColor
    });

    socket.to(roomName).emit('users-update', roomManager.getRoomUsers(roomName));
  });

  socket.on('draw', (strokeData) => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        room.drawingState.addStroke(strokeData);
        socket.to(currentRoom).emit('draw', strokeData);
      }
    }
  });

  socket.on('cursor-move', ({ x, y }) => {
    if (currentRoom) {
      roomManager.updateUserCursor(currentRoom, socket.id, x, y);
      socket.to(currentRoom).emit('cursor-update', {
        userId: socket.id,
        x,
        y
      });
    }
  });

  socket.on('undo', () => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room && room.drawingState.undo()) {
        io.to(currentRoom).emit('undo', {
          historyIndex: room.drawingState.historyIndex
        });
      }
    }
  });

  socket.on('redo', () => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room && room.drawingState.redo()) {
        io.to(currentRoom).emit('redo', {
          historyIndex: room.drawingState.historyIndex
        });
      }
    }
  });

  socket.on('clear-canvas', () => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        room.drawingState.clear();
        io.to(currentRoom).emit('clear-canvas');
      }
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      roomManager.removeUserFromRoom(currentRoom, socket.id);
      socket.to(currentRoom).emit('user-left', socket.id);
      socket.to(currentRoom).emit('users-update', roomManager.getRoomUsers(currentRoom));
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
