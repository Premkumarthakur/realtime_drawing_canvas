/**
 * DrawingState
 * -------------
 * Manages the drawing history for a room.
 * 
 * Responsibilities:
 * - Store all strokes drawn by users
 * - Manage undo and redo functionality
 * - Provide the current visible strokes to clients
 * - Reset or export the current state when needed
 */
class DrawingState {
  constructor() {
    this.strokes = [];        // Stores all stroke objects in order
    this.historyIndex = -1;   // Tracks the current visible position in the history
  }

  /**
   * Adds a new stroke to the history and updates the index.
   * Removes any "future" strokes if a new one is added after undoing.
   * @param {Object} stroke - The stroke object containing tool, color, width, and points
   */
  addStroke(stroke) {
    // Discard strokes beyond the current index if any (standard undo/redo behavior)
    this.strokes = this.strokes.slice(0, this.historyIndex + 1);

    // Add new stroke and advance history index
    this.strokes.push(stroke);
    this.historyIndex++;
  }

  /**
   * Moves one step back in the stroke history (undo).
   * @returns {boolean} True if undo was successful, false if already at beginning.
   */
  undo() {
    if (this.historyIndex > -1) {
      this.historyIndex--;
      return true;
    }
    return false;
  }

  /**
   * Moves one step forward in the stroke history (redo).
   * @returns {boolean} True if redo was successful, false if already at latest stroke.
   */
  redo() {
    if (this.historyIndex < this.strokes.length - 1) {
      this.historyIndex++;
      return true;
    }
    return false;
  }

  /**
   * Returns the list of strokes currently visible (up to historyIndex).
   * @returns {Array<Object>} Array of stroke objects.
   */
  getVisibleStrokes() {
    return this.strokes.slice(0, this.historyIndex + 1);
  }

  /**
   * Returns the complete drawing state, including all strokes and current index.
   * Used when syncing state with new clients joining the room.
   * @returns {Object} Full state object containing strokes and history index.
   */
  getAllState() {
    return {
      strokes: this.strokes,
      historyIndex: this.historyIndex
    };
  }

  /**
   * Clears all strokes and resets the drawing history.
   * Used when the canvas is cleared by any user.
   */
  clear() {
    this.strokes = [];
    this.historyIndex = -1;
  }
}

module.exports = DrawingState;
