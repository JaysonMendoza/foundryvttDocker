/**
 * An abstract pattern for primary layers of the game canvas to implement.
 * @category - Canvas
 * @abstract
 * @interface
 */
class CanvasLayer extends PIXI.Container {

  /**
   * Options for this layer instance.
   * @type {{name: string}}
   */
  options = this.constructor.layerOptions;

  // Default interactivity
  interactiveChildren = false;

  /* -------------------------------------------- */
  /*  Layer Attributes                            */
  /* -------------------------------------------- */

  /**
   * Customize behaviors of this CanvasLayer by modifying some behaviors at a class level.
   * @type {{name: string}}
   */
  static get layerOptions() {
    return {
      name: ""
    };
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the active instance of this canvas layer
   * @type {CanvasLayer}
   */
  static get instance() {
    return canvas[this.layerOptions.name];
  }

  /* -------------------------------------------- */

  /**
   * The canonical name of the CanvasLayer
   * @type {string}
   */
  get name() {
    return this.constructor.name;
  }

  /* -------------------------------------------- */

  /**
   * The name used by hooks to construct their hook string.
   * Note: You should override this getter if hookName should not return the class constructor name.
   * @type {string}
   */
  get hookName() {
    return this.name;
  }

  /* -------------------------------------------- */
  /*  Rendering
  /* -------------------------------------------- */

  /**
   * Draw the canvas layer, rendering its internal components and returning a Promise.
   * The Promise resolves to the drawn layer once its contents are successfully rendered.
   * @param {object} [options]      Options which configure how the layer is drawn
   * @returns {Promise<CanvasLayer>}
   */
  async draw(options={}) {
    console.log(`${vtt} | Drawing the ${this.constructor.name} canvas layer`);
    await this.tearDown();
    await this._draw(options);
    Hooks.callAll(`draw${this.hookName}`, this);
    return this;
  }

  /**
   * The inner _draw method which must be defined by each CanvasLayer subclass.
   * @param {object} [options]      Options which configure how the layer is drawn
   * @abstract
   * @protected
   */
  async _draw(options) {
    throw new Error(`The ${this.constructor.name} subclass of CanvasLayer must define the _draw method`);
  }

  /* -------------------------------------------- */

  /**
   * Deconstruct data used in the current layer in preparation to re-draw the canvas
   * @param {object} [options]      Options which configure how the layer is deconstructed
   * @returns {Promise<CanvasLayer>}
   */
  async tearDown(options={}) {
    this.renderable = false;
    await this._tearDown();
    Hooks.callAll(`tearDown${this.hookName}`, this);
    this.renderable = true;
    return this;
  }

  /**
   * The inner _tearDown method which may be customized by each CanvasLayer subclass.
   * @param {object} [options]      Options which configure how the layer is deconstructed
   * @protected
   */
  async _tearDown(options) {
    this.removeChildren().forEach(c => c.destroy({children: true}));
  }
}

/* -------------------------------------------- */
