// The CanvasManager class handles everything related to drawing on the canvas
// It manages tools, strokes, colors, undo/redo, and syncing with other users via WebSocket
export class CanvasManager {
  constructor(canvas, wsManager) {
    this.canvas = canvas;                 // Reference to the HTML canvas element
    this.ctx = canvas.getContext('2d');   // Get 2D drawing context
    this.wsManager = wsManager;           // Manages WebSocket communication

    // Default drawing settings
    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#2563eb';        // Default blue brush
    this.strokeWidth = 3;

    // Stores all drawing actions (for undo/redo)
    this.strokes = [];
    this.historyIndex = -1;               // Tracks where we are in the history

    this.setupCanvas();
    this.attachEventListeners();
  }

  // Adjusts canvas size dynamically based on container
  setupCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width - 80, rect.height - 80, 1200);

    this.canvas.width = size;
    this.canvas.height = size;

    this.ctx.lineCap = 'round';   // Smooth line ends
    this.ctx.lineJoin = 'round';  // Smooth connection between strokes
  }

  // Adds mouse, touch, and resize event listeners
  attachEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));

    // Touch events (mobile devices)
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

    // Track cursor movement for showing user pointers in real-time
    this.canvas.addEventListener('mousemove', this.handleCursorMove.bind(this));

    // Keep drawing content safe on window resize
    window.addEventListener('resize', () => {
      const oldImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.setupCanvas();
      this.ctx.putImageData(oldImageData, 0, 0);
    });
  }

  // Converts touch input into mouse-like events
  handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.canvas.dispatchEvent(mouseEvent);
  }

  // Converts screen coordinates to canvas coordinates
  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  // Starts a new stroke when mouse is pressed
  startDrawing(e) {
    this.isDrawing = true;
    const coords = this.getCanvasCoordinates(e);

    this.currentStroke = {
      tool: this.currentTool,
      color: this.currentColor,
      width: this.strokeWidth,
      points: [coords]   // Store points for replay or sync
    };

    this.ctx.beginPath();
    this.ctx.moveTo(coords.x, coords.y);
  }

  // Draws lines as the mouse moves
  draw(e) {
    if (!this.isDrawing) return;

    const coords = this.getCanvasCoordinates(e);
    this.currentStroke.points.push(coords);

    // Change brush color and size (eraser = white)
    this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
    this.ctx.lineWidth = this.currentTool === 'eraser' ? this.strokeWidth * 2 : this.strokeWidth;

    this.ctx.lineTo(coords.x, coords.y);
    this.ctx.stroke();
  }

  // Stops drawing and saves the stroke
  stopDrawing() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      this.addStroke(this.currentStroke);
      this.wsManager.emit('draw', this.currentStroke);  // Send stroke to others
    }

    this.currentStroke = null;
  }

  // Adds a stroke to the history stack
  addStroke(stroke) {
    this.strokes = this.strokes.slice(0, this.historyIndex + 1);
    this.strokes.push(stroke);
    this.historyIndex++;
  }

  // Replays a stroke on the canvas
  drawStroke(stroke) {
    if (stroke.points.length === 0) return;

    this.ctx.beginPath();
    this.ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
    this.ctx.lineWidth = stroke.tool === 'eraser' ? stroke.width * 2 : stroke.width;

    this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let i = 1; i < stroke.points.length; i++) {
      this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    this.ctx.stroke();
  }

  // Clears canvas and redraws strokes based on current history index
  redrawCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const visibleStrokes = this.strokes.slice(0, this.historyIndex + 1);
    visibleStrokes.forEach(stroke => this.drawStroke(stroke));
  }

  // Undo last stroke
  undo() {
    if (this.historyIndex > -1) {
      this.historyIndex--;
      this.redrawCanvas();
      this.wsManager.emit('undo');
    }
  }

  // Redo undone stroke
  redo() {
    if (this.historyIndex < this.strokes.length - 1) {
      this.historyIndex++;
      this.redrawCanvas();
      this.wsManager.emit('redo');
    }
  }

  // Handle undo/redo triggered by other users
  handleRemoteUndo(data) {
    this.historyIndex = data.historyIndex;
    this.redrawCanvas();
  }

  handleRemoteRedo(data) {
    this.historyIndex = data.historyIndex;
    this.redrawCanvas();
  }

  // Draw strokes received from other users
  handleRemoteDraw(stroke) {
    this.addStroke(stroke);
    this.drawStroke(stroke);
  }

  // Load existing drawing state (e.g., on reconnect)
  loadDrawingState(state) {
    this.strokes = state.strokes;
    this.historyIndex = state.historyIndex;
    this.redrawCanvas();
  }

  // Clear everything
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.strokes = [];
    this.historyIndex = -1;
  }

  // Tool configuration setters
  setTool(tool) {
    this.currentTool = tool;
  }

  setColor(color) {
    this.currentColor = color;
  }

  setStrokeWidth(width) {
    this.strokeWidth = width;
  }

  // Tracks cursor for showing remote user pointers
  handleCursorMove(e) {
    const coords = this.getCanvasCoordinates(e);
    const rect = this.canvas.getBoundingClientRect();

    this.wsManager.emit('cursor-move', {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  }
}
