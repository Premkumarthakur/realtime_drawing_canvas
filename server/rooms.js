const DrawingState = require('./drawing-state');

/**
 * RoomManager
 * ------------
 * Manages all active drawing rooms on the server.
 * Each room tracks:
 *   - Connected users
 *   - Shared drawing state (DrawingState)
 */
class RoomManager {
  constructor() {
    // Stores all active rooms
    // Key: room name (string)
    // Value: { name, users (Map), drawingState (DrawingState instance) }
    this.rooms = new Map();
  }

  /**
   * Returns an existing room or creates a new one if it doesn’t exist.
   * @param {string} roomName - Unique identifier for the room
   * @returns {Object} Room object
   */
  getOrCreateRoom(roomName) {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, {
        name: roomName,
        users: new Map(),              // socketId → user object
        drawingState: new DrawingState() // stores stroke history
      });
    }
    return this.rooms.get(roomName);
  }

  /**
   * Adds a user to a room, creating the room if necessary.
   * @param {string} roomName - Target room name
   * @param {string} socketId - User’s socket ID
   * @param {string} username - Display name of the user
   * @param {string} color - User’s assigned color for display/cursor
   * @returns {Object} Updated room object
   */
  addUserToRoom(roomName, socketId, username, color) {
    const room = this.getOrCreateRoom(roomName);
    room.users.set(socketId, {
      id: socketId,
      username,
      color,
      cursor: { x: 0, y: 0 } // Initial cursor position
    });
    return room;
  }

  /**
   * Removes a user from a room.
   * Deletes the room entirely if it becomes empty.
   * @param {string} roomName - Name of the room
   * @param {string} socketId - Socket ID of the user
   */
  removeUserFromRoom(roomName, socketId) {
    const room = this.rooms.get(roomName);
    if (room) {
      room.users.delete(socketId);
      // Remove the room if no users remain
      if (room.users.size === 0) {
        this.rooms.delete(roomName);
      }
    }
  }

  /**
   * Updates a user’s cursor position in a specific room.
   * @param {string} roomName - Room name
   * @param {string} socketId - User’s socket ID
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  updateUserCursor(roomName, socketId, x, y) {
    const room = this.rooms.get(roomName);
    if (room && room.users.has(socketId)) {
      room.users.get(socketId).cursor = { x, y };
    }
  }

  /**
   * Returns all users currently connected to a room.
   * @param {string} roomName - Room name
   * @returns {Array<Object>} List of users
   */
  getRoomUsers(roomName) {
    const room = this.rooms.get(roomName);
    return room ? Array.from(room.users.values()) : [];
  }

  /**
   * Returns the full room object for a given room name.
   * @param {string} roomName - Room name
   * @returns {Object|undefined} Room object or undefined if not found
   */
  getRoom(roomName) {
    return this.rooms.get(roomName);
  }
}

// Export a singleton instance to maintain shared state across server imports
module.exports = new RoomManager();
