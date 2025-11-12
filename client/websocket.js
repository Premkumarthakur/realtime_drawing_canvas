export class WebSocketManager {
  constructor() {
    this.socket = null;
    this.callbacks = {};
  }

  connect() {
    this.socket = io('http://localhost:3000');
    return this.socket;
  }

  joinRoom(roomName, username) {
    this.socket.emit('join-room', { roomName, username });
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
      this.socket.on(event, (...args) => {
        this.callbacks[event].forEach(cb => cb(...args));
      });
    }
    this.callbacks[event].push(callback);
  }

  emit(event, data) {
    this.socket.emit(event, data);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
