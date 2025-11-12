class DrawingState {
  constructor() {
    this.strokes = [];
    this.historyIndex = -1;
  }

  addStroke(stroke) {
    this.strokes = this.strokes.slice(0, this.historyIndex + 1);
    this.strokes.push(stroke);
    this.historyIndex++;
  }

  undo() {
    if (this.historyIndex > -1) {
      this.historyIndex--;
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.strokes.length - 1) {
      this.historyIndex++;
      return true;
    }
    return false;
  }

  getVisibleStrokes() {
    return this.strokes.slice(0, this.historyIndex + 1);
  }

  getAllState() {
    return {
      strokes: this.strokes,
      historyIndex: this.historyIndex
    };
  }

  clear() {
    this.strokes = [];
    this.historyIndex = -1;
  }
}

module.exports = DrawingState;
