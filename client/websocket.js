/**
 * WebSocketManager
 * ----------------
 * Handles all WebSocket (Socket.IO) interactions with the backend.
 * 
 * Responsibilities:
 *  - Establish a connection to the WebSocket server
 *  - Emit events to the server
 *  - Listen for incoming events
 *  - Manage event callbacks for multiple listeners
 */
export class WebSocketManager {
  constructor() {
    this.socket = null;         // Active Socket.IO connection instance
    this.callbacks = {};        // Stores event-specific callback lists
  }

  /**
   * Establishes a WebSocket connection to the backend server
   * @returns {Socket} The connected socket instance
   */
  connect() {
    this.socket = io('https://realtime-drawing-canvas-backend.onrender.com');
    return this.socket;
  }

  /**
   * Sends a request to join a specific drawing room
   * @param {string} roomName - The name of the drawing room
   * @param {string} username - The display name of the user
   */
  joinRoom(roomName, username) {
    this.socket.emit('join-room', { roomName, username });
  }

  /**
   * Registers a listener for a specific event type
   * Multiple listeners per event are supported.
   * @param {string} event - Event name to listen for
   * @param {Function} callback - Function to execute when event occurs
   */
  on(event, callback) {
    // If this is the first time registering this event, 
    // initialize the callback list and bind the socket listener
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
      this.socket.on(event, (...args) => {
        this.callbacks[event].forEach(cb => cb(...args));
      });
    }

    // Add the new callback to the list
    this.callbacks[event].push(callback);
  }

  /**
   * Emits an event to the server with optional data
   * @param {string} event - Event name
   * @param {any} data - Payload to send to the server
   */
  emit(event, data) {
    this.socket.emit(event, data);
  }

  /**
   * Closes the WebSocket connection gracefully
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
