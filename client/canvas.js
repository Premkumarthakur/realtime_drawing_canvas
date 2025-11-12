export class CanvasManager {
  constructor(canvas, wsManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.wsManager = wsManager;

    this.isDrawing = false;
    this.currentTool = 'brush';
    this.currentColor = '#2563eb';
    this.strokeWidth = 3;

    this.strokes = [];
    this.historyIndex = -1;

    this.setupCanvas();
    this.attachEventListeners();
  }

  setupCanvas() {
    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const size = Math.min(rect.width - 80, rect.height - 80, 1200);

    this.canvas.width = size;
    this.canvas.height = size;

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  attachEventListeners() {
    this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
    this.canvas.addEventListener('mousemove', this.draw.bind(this));
    this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
    this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));

    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));

    this.canvas.addEventListener('mousemove', this.handleCursorMove.bind(this));

    window.addEventListener('resize', () => {
      const oldImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.setupCanvas();
      this.ctx.putImageData(oldImageData, 0, 0);
    });
  }

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

  getCanvasCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  startDrawing(e) {
    this.isDrawing = true;
    const coords = this.getCanvasCoordinates(e);

    this.currentStroke = {
      tool: this.currentTool,
      color: this.currentColor,
      width: this.strokeWidth,
      points: [coords]
    };

    this.ctx.beginPath();
    this.ctx.moveTo(coords.x, coords.y);
  }

  draw(e) {
    if (!this.isDrawing) return;

    const coords = this.getCanvasCoordinates(e);
    this.currentStroke.points.push(coords);

    this.ctx.strokeStyle = this.currentTool === 'eraser' ? '#ffffff' : this.currentColor;
    this.ctx.lineWidth = this.currentTool === 'eraser' ? this.strokeWidth * 2 : this.strokeWidth;

    this.ctx.lineTo(coords.x, coords.y);
    this.ctx.stroke();
  }

  stopDrawing() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      this.addStroke(this.currentStroke);
      this.wsManager.emit('draw', this.currentStroke);
    }

    this.currentStroke = null;
  }

  addStroke(stroke) {
    this.strokes = this.strokes.slice(0, this.historyIndex + 1);
    this.strokes.push(stroke);
    this.historyIndex++;
  }

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

  redrawCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const visibleStrokes = this.strokes.slice(0, this.historyIndex + 1);
    visibleStrokes.forEach(stroke => this.drawStroke(stroke));
  }

  undo() {
    if (this.historyIndex > -1) {
      this.historyIndex--;
      this.redrawCanvas();
      this.wsManager.emit('undo');
    }
  }

  redo() {
    if (this.historyIndex < this.strokes.length - 1) {
      this.historyIndex++;
      this.redrawCanvas();
      this.wsManager.emit('redo');
    }
  }

  handleRemoteUndo(data) {
    this.historyIndex = data.historyIndex;
    this.redrawCanvas();
  }

  handleRemoteRedo(data) {
    this.historyIndex = data.historyIndex;
    this.redrawCanvas();
  }

  handleRemoteDraw(stroke) {
    this.addStroke(stroke);
    this.drawStroke(stroke);
  }

  loadDrawingState(state) {
    this.strokes = state.strokes;
    this.historyIndex = state.historyIndex;
    this.redrawCanvas();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.strokes = [];
    this.historyIndex = -1;
  }

  setTool(tool) {
    this.currentTool = tool;
  }

  setColor(color) {
    this.currentColor = color;
  }

  setStrokeWidth(width) {
    this.strokeWidth = width;
  }

  handleCursorMove(e) {
    const coords = this.getCanvasCoordinates(e);
    const rect = this.canvas.getBoundingClientRect();

    this.wsManager.emit('cursor-move', {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  }
}
