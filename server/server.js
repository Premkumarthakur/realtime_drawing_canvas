// Core dependencies
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// Custom room management logic
const roomManager = require('./rooms');

const app = express();
const httpServer = createServer(app);

// ---------------------------------------------
// Middleware Configuration
// ---------------------------------------------

// Enable CORS for cross-origin WebSocket and HTTP requests
app.use(cors({
  origin: '*', // Replace '*' with frontend origin in production (e.g. 'https://yourdomain.com')
  methods: ['GET', 'POST'],
  credentials: true
}));

// Serve static frontend files (client-side app)
app.use(express.static(path.join(__dirname, '../client')));

// ---------------------------------------------
// Socket.IO Server Setup
// ---------------------------------------------
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Update to your frontend origin for production security
    methods: ['GET', 'POST']
  }
});

// ---------------------------------------------
// Utility: Assigns a random color to each new user
// ---------------------------------------------
const generateUserColor = () => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
    '#F8B739', '#52B788', '#E76F51', '#2A9D8F'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

// ---------------------------------------------
// Socket.IO Event Handlers
// ---------------------------------------------
io.on('connection', (socket) => {
  // Track the user’s current room and username for cleanup and broadcasts
  let currentRoom = null;
  let currentUsername = null;

  /**
   * Handles user joining a specific room
   */
  socket.on('join-room', ({ roomName, username }) => {
    currentRoom = roomName;
    currentUsername = username;
    const userColor = generateUserColor();

    // Join the user to the Socket.IO room
    socket.join(roomName);

    // Add user to server-side room manager
    const room = roomManager.addUserToRoom(roomName, socket.id, username, userColor);

    // Send confirmation and initial state to the newly joined user
    socket.emit('room-joined', {
      userId: socket.id,
      color: userColor,
      users: roomManager.getRoomUsers(roomName),
      drawingState: room.drawingState.getAllState()
    });

    // Notify all other users that a new participant has joined
    socket.to(roomName).emit('user-joined', {
      id: socket.id,
      username,
      color: userColor
    });

    // Send updated user list to everyone in the room
    socket.to(roomName).emit('users-update', roomManager.getRoomUsers(roomName));
  });

  /**
   * Broadcast drawing strokes to all users in the same room
   */
  socket.on('draw', (strokeData) => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        // Save stroke to room history and broadcast to others
        room.drawingState.addStroke(strokeData);
        socket.to(currentRoom).emit('draw', strokeData);
      }
    }
  });

  /**
   * Broadcast cursor movements to other users for live collaboration
   */
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

  /**
   * Handles undo actions and updates all users with the new drawing state
   */
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

  /**
   * Handles redo actions and updates all users accordingly
   */
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

  /**
   * Clears the entire canvas for all users in the room
   */
  socket.on('clear-canvas', () => {
    if (currentRoom) {
      const room = roomManager.getRoom(currentRoom);
      if (room) {
        room.drawingState.clear();
        io.to(currentRoom).emit('clear-canvas');
      }
    }
  });

  /**
   * Cleans up when a user disconnects (closes tab or leaves room)
   */
  socket.on('disconnect', () => {
    if (currentRoom) {
      roomManager.removeUserFromRoom(currentRoom, socket.id);

      // Notify others in the room about user leaving
      socket.to(currentRoom).emit('user-left', socket.id);
      socket.to(currentRoom).emit('users-update', roomManager.getRoomUsers(currentRoom));
    }
  });
});

// ---------------------------------------------
// Start the HTTP and WebSocket server
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
