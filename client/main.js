import { WebSocketManager } from './websocket.js';
import { CanvasManager } from './canvas.js';

class DrawingApp {
  constructor() {
    this.wsManager = new WebSocketManager();
    this.canvasManager = null;
    this.currentUserId = null;
    this.users = new Map();
    this.cursors = new Map();

    this.initializeElements();
    this.attachEventListeners();
  }

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

    this.brushBtn = document.getElementById('brush-tool');
    this.eraserBtn = document.getElementById('eraser-tool');
    this.colorPicker = document.getElementById('color-picker');
    this.colorPreview = document.getElementById('color-preview');
    this.strokeWidthInput = document.getElementById('stroke-width');
    this.strokeWidthValue = document.getElementById('stroke-width-value');
    this.undoBtn = document.getElementById('undo-btn');
    this.redoBtn = document.getElementById('redo-btn');
    this.clearBtn = document.getElementById('clear-btn');
    this.leaveBtn = document.getElementById('leave-btn');
  }

  attachEventListeners() {
    this.joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.joinRoom();
    });

    this.brushBtn.addEventListener('click', () => this.selectTool('brush'));
    this.eraserBtn.addEventListener('click', () => this.selectTool('eraser'));

    this.colorPicker.addEventListener('input', (e) => {
      this.colorPreview.style.background = e.target.value;
      if (this.canvasManager) {
        this.canvasManager.setColor(e.target.value);
      }
    });

    this.strokeWidthInput.addEventListener('input', (e) => {
      this.strokeWidthValue.textContent = e.target.value;
      if (this.canvasManager) {
        this.canvasManager.setStrokeWidth(parseInt(e.target.value));
      }
    });

    this.undoBtn.addEventListener('click', () => {
      if (this.canvasManager) {
        this.canvasManager.undo();
      }
    });

    this.redoBtn.addEventListener('click', () => {
      if (this.canvasManager) {
        this.canvasManager.redo();
      }
    });

    this.clearBtn.addEventListener('click', () => {
      if (confirm('Clear the entire canvas? This action cannot be undone.')) {
        this.wsManager.emit('clear-canvas');
      }
    });

    this.leaveBtn.addEventListener('click', () => {
      this.leaveRoom();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (this.canvasManager) {
          this.canvasManager.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (this.canvasManager) {
          this.canvasManager.redo();
        }
      }
    });

    this.colorPreview.style.background = this.colorPicker.value;
  }

  joinRoom() {
    const roomName = this.roomNameInput.value.trim();
    const username = this.usernameInput.value.trim();

    if (!roomName || !username) return;

    this.wsManager.connect();
    this.wsManager.joinRoom(roomName, username);

    this.wsManager.on('room-joined', (data) => {
      this.currentUserId = data.userId;
      this.currentRoomSpan.textContent = roomName;

      this.joinScreen.classList.remove('active');
      this.canvasScreen.classList.add('active');

      this.canvasManager = new CanvasManager(this.canvas, this.wsManager);
      this.canvasManager.setColor(this.colorPicker.value);
      this.canvasManager.setStrokeWidth(parseInt(this.strokeWidthInput.value));

      if (data.drawingState) {
        this.canvasManager.loadDrawingState(data.drawingState);
      }

      this.updateUsersList(data.users);
      this.setupSocketListeners();
    });
  }

  setupSocketListeners() {
    this.wsManager.on('user-joined', (user) => {
      this.users.set(user.id, user);
      this.updateUsersList(Array.from(this.users.values()));
    });

    this.wsManager.on('user-left', (userId) => {
      this.users.delete(userId);
      this.removeCursor(userId);
      this.updateUsersList(Array.from(this.users.values()));
    });

    this.wsManager.on('users-update', (users) => {
      this.updateUsersList(users);
    });

    this.wsManager.on('draw', (stroke) => {
      this.canvasManager.handleRemoteDraw(stroke);
    });

    this.wsManager.on('cursor-update', (data) => {
      this.updateCursor(data.userId, data.x, data.y);
    });

    this.wsManager.on('undo', (data) => {
      this.canvasManager.handleRemoteUndo(data);
    });

    this.wsManager.on('redo', (data) => {
      this.canvasManager.handleRemoteRedo(data);
    });

    this.wsManager.on('clear-canvas', () => {
      this.canvasManager.clear();
    });
  }

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

  updateCursor(userId, x, y) {
    const user = this.users.get(userId);
    if (!user) return;

    let cursor = this.cursors.get(userId);

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

    const canvasRect = this.canvas.getBoundingClientRect();
    const containerRect = this.cursorsContainer.getBoundingClientRect();

    cursor.style.left = (canvasRect.left - containerRect.left + x) + 'px';
    cursor.style.top = (canvasRect.top - containerRect.top + y) + 'px';
  }

  removeCursor(userId) {
    const cursor = this.cursors.get(userId);
    if (cursor) {
      cursor.remove();
      this.cursors.delete(userId);
    }
  }

  selectTool(tool) {
    if (tool === 'brush') {
      this.brushBtn.classList.add('active');
      this.eraserBtn.classList.remove('active');
    } else if (tool === 'eraser') {
      this.eraserBtn.classList.add('active');
      this.brushBtn.classList.remove('active');
    }

    if (this.canvasManager) {
      this.canvasManager.setTool(tool);
    }
  }

  leaveRoom() {
    if (confirm('Leave the room? Your drawing will be saved for other users.')) {
      this.wsManager.disconnect();
      this.canvasScreen.classList.remove('active');
      this.joinScreen.classList.add('active');
      this.users.clear();
      this.cursors.forEach(cursor => cursor.remove());
      this.cursors.clear();
      this.canvasManager = null;
      this.roomNameInput.value = '';
      this.usernameInput.value = '';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DrawingApp();
});
