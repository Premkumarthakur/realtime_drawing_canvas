import { WebSocketManager } from './websocket.js';
import { CanvasManager } from './canvas.js';

/**
 * DrawingApp class
 * ----------------
 * This is the main controller that connects:
 * - WebSocketManager (real-time communication)
 * - CanvasManager (drawing logic)
 * - The DOM/UI (toolbar, users, cursors, etc.)
 */
class DrawingApp {
  constructor() {
    this.wsManager = new WebSocketManager(); // Manages server connection
    this.canvasManager = null;               // Handles all canvas operations
    this.currentUserId = null;               // Stores current user's unique ID
    this.users = new Map();                  // Active users in the room
    this.cursors = new Map();                // Tracks remote users' cursors

    this.initializeElements();
    this.attachEventListeners();
  }

  /**
   * Selects and stores references to all required DOM elements
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
   * Attaches all event listeners for UI elements and keyboard shortcuts
   */
  attachEventListeners() {
    // Handle room join form
    this.joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinRoom();
    });

    // Tool selection
    this.brushBtn.addEventListener('click', () => this.selectTool('brush'));
    this.eraserBtn.addEventListener('click', () => this.selectTool('eraser'));

    // Color picker updates
    this.colorPicker.addEventListener('input', (e) => {
      this.colorPreview.style.background = e.target.value;
      if (this.canvasManager) this.canvasManager.setColor(e.target.value);
    });

    // Stroke width slider updates
    this.strokeWidthInput.addEventListener('input', (e) => {
      this.strokeWidthValue.textContent = e.target.value;
      if (this.canvasManager) this.canvasManager.setStrokeWidth(parseInt(e.target.value));
    });

    // Undo/Redo/Clear buttons
    this.undoBtn.addEventListener('click', () => this.canvasManager?.undo());
    this.redoBtn.addEventListener('click', () => this.canvasManager?.redo());

    this.clearBtn.addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This action cannot be undone.')) {
        this.wsManager.emit('clear-canvas');
      }
    });

    // Leave the room
    this.leaveBtn.addEventListener('click', () => this.leaveRoom());

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.canvasManager?.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.canvasManager?.redo();
      }
    });

    // Set default color preview
    this.colorPreview.style.background = this.colorPicker.value;
  }

  /**
   * Handles joining a drawing room and initializing the drawing environment
   */
  joinRoom() {
    const roomName = this.roomNameInput.value.trim();
    const username = this.usernameInput.value.trim();
    if (!roomName || !username) return;

    // Connect to WebSocket server
    this.wsManager.connect();
    this.wsManager.joinRoom(roomName, username);

    // When the server confirms the user has joined
    this.wsManager.on('room-joined', (data) => {
      this.currentUserId = data.userId;
      this.currentRoomSpan.textContent = roomName;

      // Switch UI to the canvas screen
      this.joinScreen.classList.remove('active');
      this.canvasScreen.classList.add('active');

      // Initialize Canvas Manager
      this.canvasManager = new CanvasManager(this.canvas, this.wsManager);
      this.canvasManager.setColor(this.colorPicker.value);
      this.canvasManager.setStrokeWidth(parseInt(this.strokeWidthInput.value));

      // Load existing canvas state if available
      if (data.drawingState) {
        this.canvasManager.loadDrawingState(data.drawingState);
      }

      // Update user list and setup WebSocket listeners
      this.updateUsersList(data.users);
      this.setupSocketListeners();
    });
  }

  /**
   * Sets up WebSocket event listeners to handle real-time updates
   */
  setupSocketListeners() {
    // When a new user joins
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

    // Receive updated user list
    this.wsManager.on('users-update', (users) => {
      this.updateUsersList(users);
    });

    // Handle drawing from other users
    this.wsManager.on('draw', (stroke) => {
      this.canvasManager.handleRemoteDraw(stroke);
    });

    // Handle cursor movement from other users
    this.wsManager.on('cursor-update', (data) => {
      this.updateCursor(data.userId, data.x, data.y);
    });

    // Handle undo/redo/clear from other users
    this.wsManager.on('undo', (data) => this.canvasManager.handleRemoteUndo(data));
    this.wsManager.on('redo', (data) => this.canvasManager.handleRemoteRedo(data));
    this.wsManager.on('clear-canvas', () => this.canvasManager.clear());
  }

  /**
   * Updates the sidebar list of online users
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
   * Updates or creates a visual cursor for a remote user
   */
  updateCursor(userId, x, y) {
    const user = this.users.get(userId);
    if (!user) return;

    let cursor = this.cursors.get(userId);

    // Create cursor if it doesn't exist
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

    // Calculate cursor position relative to canvas
    const canvasRect = this.canvas.getBoundingClientRect();
    const containerRect = this.cursorsContainer.getBoundingClientRect();

    cursor.style.left = (canvasRect.left - containerRect.left + x) + 'px';
    cursor.style.top = (canvasRect.top - containerRect.top + y) + 'px';
  }

  /**
   * Removes the cursor of a disconnected user
   */
  removeCursor(userId) {
    const cursor = this.cursors.get(userId);
    if (cursor) {
      cursor.remove();
      this.cursors.delete(userId);
    }
  }

  /**
   * Handles tool selection (brush or eraser)
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
   * Leaves the current room and resets the UI to the join screen
   */
  leaveRoom() {
    if (confirm('Leave the room? Your drawing will be saved for other users.')) {
      this.wsManager.disconnect();

      // Reset screens
      this.canvasScreen.classList.remove('active');
      this.joinScreen.classList.add('active');

      // Reset all local state
      this.users.clear();
      this.cursors.forEach(cursor => cursor.remove());
      this.cursors.clear();
      this.canvasManager = null;
      this.roomNameInput.value = '';
      this.usernameInput.value = '';
    }
  }
}

/**
 * Initialize the DrawingApp once the page finishes loading
 */
document.addEventListener('DOMContentLoaded', () => {
  new DrawingApp();
});
