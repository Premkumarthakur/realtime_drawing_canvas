const DrawingState = require('./drawing-state');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  getOrCreateRoom(roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, {
        name: roomName,
        users: new Map(),
        drawingState: new DrawingState()
      });
    }
    return this.rooms.get(roomName);
  }

  addUserToRoom(roomName, socketId, username, color) {
    const room = this.getOrCreateRoom(roomName);
    room.users.set(socketId, {
      id: socketId,
      username,
      color,
      cursor: { x: 0, y: 0 }
    });
    return room;
  }

  removeUserFromRoom(roomName, socketId) {
    const room = this.rooms.get(roomName);
    if (room) {
      room.users.delete(socketId);
      if (room.users.size === 0) {
        this.rooms.delete(roomName);
      }
    }
  }

  updateUserCursor(roomName, socketId, x, y) {
    const room = this.rooms.get(roomName);
    if (room && room.users.has(socketId)) {
      room.users.get(socketId).cursor = { x, y };
    }
  }

  getRoomUsers(roomName) {
    const room = this.rooms.get(roomName);
    return room ? Array.from(room.users.values()) : [];
  }

  getRoom(roomName) {
    return this.rooms.get(roomName);
  }
}

module.exports = new RoomManager();
