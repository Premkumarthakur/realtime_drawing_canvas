// Import the WebSocket and Canvas management modules
import { WebSocketManager } from './websocket.js';
import { CanvasManager } from './canvas.js';

/**
 * 🎨 DrawingApp
 * This class controls the entire front-end flow:
 * - Handles room joining
 * - Manages users and cursors
 * - Connects CanvasManager with WebSocketManager
 * - Handles tool and color selection
 * - Listens for WebSocket events and updates the UI in real time
 */
class DrawingApp {
  constructor() {
    this.wsManager = new WebSocketManager(); // Handles server connection
    this.canvasManager = null;               // Will manage canvas drawing once room is joined
    this.currentUserId = null;               // Stores current user's unique ID
    this.users = new Map();                  // Active users list
    this.cursors = new Map();                // Cursor markers for remote users

    this.initializeElements();
    this.attachEventListeners();
  }

  /** 
   * 🧩 Grabs all important DOM elements 
   * and stores them as properties for easy access.
   */
  initializeElements() {
    this.joinScreen = document.getElementById('join-screen');
    this.canvasScreen = document.getElementById('canvas-screen');
    this.joinForm = document.getElementById('join-form');
    this.roomNameInput = document.getElementById('room-name');
    this.usernameInput = document.getElementById('username');
    this.currentRoomSpan = document.getElementById('current-room');
    this.usersList = document.getElementById('users-list');
    this.canvas = document.getElementById('drawing-canvas');
    this.cursorsContainer = document.getElementById('cursors-container');

    // Toolbar elements
    this.brushBtn = document.getElementById('brush-tool');
    this.eraserBtn = document.getElementById('eraser-tool');
    this.colorPicker = document.getElementById('color-picker');
    this.colorPreview = document.getElementById('color-preview');
    this.strokeWidthInput = document.getElementById('stroke-width');
    this.strokeWidthValue = document.getElementById('stroke-width-value');

    // Action buttons
    this.undoBtn = document.getElementById('undo-btn');
    this.redoBtn = document.getElementById('redo-btn');
    this.clearBtn = document.getElementById('clear-btn');
    this.leaveBtn = document.getElementById('leave-btn');
  }

  /**
   * 🖱️ Sets up event listeners for form submission,
   * toolbar actions, shortcuts, and color/size changes.
   */
  attachEventListeners() {
    // Handle "Join Room" form submission
    this.joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinRoom();
    });

    // Tool selection
    this.brushBtn.addEventListener('click', () => this.selectTool('brush'));
    this.eraserBtn.addEventListener('click', () => this.selectTool('eraser'));

    // Color picker update
    this.colorPicker.addEventListener('input', (e) => {
      this.colorPreview.style.background = e.target.value;
      if (this.canvasManager) this.canvasManager.setColor(e.target.value);
    });

    // Stroke width slider
    this.strokeWidthInput.addEventListener('input', (e) => {
      this.strokeWidthValue.textContent = e.target.value;
      if (this.canvasManager) this.canvasManager.setStrokeWidth(parseInt(e.target.value));
    });

    // Undo/Redo/Clear button actions
    this.undoBtn.addEventListener('click', () => this.canvasManager?.undo());
    this.redoBtn.addEventListener('click', () => this.canvasManager?.redo());

    this.clearBtn.addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This action cannot be undone.')) {
        this.wsManager.emit('clear-canvas');
      }
    });

    // Leave the room
    this.leaveBtn.addEventListener('click', () => this.leaveRoom());

    // Keyboard shortcuts (Ctrl+Z / Ctrl+Y)
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.canvasManager?.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.canvasManager?.redo();
      }
    });

    // Set the initial color preview
    this.colorPreview.style.background = this.colorPicker.value;
  }

  /**
   * 🚪 Called when the user clicks "Join Room"
   * Connects to the WebSocket server and initializes the drawing environment.
   */
  joinRoom() {
    const roomName = this.roomNameInput.value.trim();
    const username = this.usernameInput.value.trim();
    if (!roomName || !username) return;

    this.wsManager.connect();
    this.wsManager.joinRoom(roomName, username);

    // When server confirms user has joined
    this.wsManager.on('room-joined', (data) => {
      this.currentUserId = data.userId;
      this.currentRoomSpan.textContent = roomName;

      // Switch screens
      this.joinScreen.classList.remove('active');
      this.canvasScreen.classList.add('active');

      // Initialize Canvas Manager
      this.canvasManager = new CanvasManager(this.canvas, this.wsManager);
      this.canvasManager.setColor(this.colorPicker.value);
      this.canvasManager.setStrokeWidth(parseInt(this.strokeWidthInput.value));

      // If server provides previous drawing data, load it
      if (data.drawingState) {
        this.canvasManager.loadDrawingState(data.drawingState);
      }

      // Update user list and setup live event handlers
      this.updateUsersList(data.users);
      this.setupSocketListeners();
    });
  }

  /**
   * 🔄 Sets up event listeners for all WebSocket events
   * to sync drawing, users, cursors, and actions in real-time.
   */
  setupSocketListeners() {
    // When a new user joins the room
    this.wsManager.on('user-joined', (user) => {
      this.users.set(user.id, user);
      this.updateUsersList(Array.from(this.users.values()));
    });

    // When a user leaves
    this.wsManager.on('user-left', (userId) => {
      this.users.delete(userId);
      this.removeCursor(userId);
      this.updateUsersList(Array.from(this.users.values()));
    });

    // Full user list update
    this.wsManager.on('users-update', (users) => {
      this.updateUsersList(users);
    });

    // Receive and render remote drawing
    this.wsManager.on('draw', (stroke) => {
      this.canvasManager.handleRemoteDraw(stroke);
    });

    // Remote cursor movement
    this.wsManager.on('cursor-update', (data) => {
      this.updateCursor(data.userId, data.x, data.y);
    });

    // Undo/Redo/Clear actions from other users
    this.wsManager.on('undo', (data) => this.canvasManager.handleRemoteUndo(data));
    this.wsManager.on('redo', (data) => this.canvasManager.handleRemoteRedo(data));
    this.wsManager.on('clear-canvas', () => this.canvasManager.clear());
  }

  /**
   * 👥 Updates the list of online users shown in sidebar.
   */
  updateUsersList(users) {
    users.forEach(user => this.users.set(user.id, user));

    this.usersList.innerHTML = '';
    users.forEach(user => {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';
      userItem.innerHTML = `
        <div class="user-color" style="background: ${user.color}"></div>
        <div class="user-name">${user.username}${user.id === this.currentUserId ? ' (You)' : ''}</div>
      `;
      this.usersList.appendChild(userItem);
    });
  }

  /**
   * 🖱️ Displays and moves other users’ cursors on your screen
   * so you can see where they are drawing in real-time.
   */
  updateCursor(userId, x, y) {
    const user = this.users.get(userId);
    if (!user) return;

    let cursor = this.cursors.get(userId);

    // Create new cursor element if not already visible
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.innerHTML = `
        <div class="cursor-dot" style="background: ${user.color}"></div>
        <div class="cursor-label">${user.username}</div>
      `;
      this.cursorsContainer.appendChild(cursor);
      this.cursors.set(userId, cursor);
    }

    // Position cursor correctly on the canvas
    const canvasRect = this.canvas.getBoundingClientRect();
    const containerRect = this.cursorsContainer.getBoundingClientRect();

    cursor.style.left = (canvasRect.left - containerRect.left + x) + 'px';
    cursor.style.top = (canvasRect.top - containerRect.top + y) + 'px';
  }

  /**
   * 🧹 Removes cursor when user disconnects.
   */
  removeCursor(userId) {
    const cursor = this.cursors.get(userId);
    if (cursor) {
      cursor.remove();
      this.cursors.delete(userId);
    }
  }

  /**
   * 🧰 Switch between brush and eraser.
   */
  selectTool(tool) {
    if (tool === 'brush') {
      this.brushBtn.classList.add('active');
      this.eraserBtn.classList.remove('active');
    } else {
      this.eraserBtn.classList.add('active');
      this.brushBtn.classList.remove('active');
    }

    if (this.canvasManager) {
      this.canvasManager.setTool(tool);
    }
  }

  /**
   * 🚪 Leaves the current room and resets UI back to join screen.
   */
  leaveRoom() {
    if (confirm('Leave the room? Your drawing will be saved for other users.')) {
      this.wsManager.disconnect();

      // Switch back to the join screen
      this.canvasScreen.classList.remove('active');
      this.joinScreen.classList.add('active');

      // Reset local state
      this.users.clear();
      this.cursors.forEach(cursor => cursor.remove());
      this.cursors.clear();
      this.canvasManager = null;
      this.roomNameInput.value = '';
      this.usernameInput.value = '';
    }
  }
}

// ✅ Initialize the app when page finishes loading
document.addEventListener('DOMContentLoaded', () => {
  new DrawingApp();
});
