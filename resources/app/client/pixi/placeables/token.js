/**
 * A Token is an implementation of PlaceableObject which represents an Actor within a viewed Scene on the game canvas.
 * @category - Canvas
 * @see {TokenDocument}
 * @see {TokenLayer}
 */
class Token extends PlaceableObject {
  constructor(document) {
    super(document);
    this.#initialize();
  }

  /** @inheritdoc */
  static embeddedName = "Token";

  /**
   * A Graphics instance which renders the border frame for this Token inside the GridLayer.
   * @type {PIXI.Graphics}
   */
  border;

  /**
   * Track the set of User documents which are currently targeting this Token
   * @type {Set<User>}
   */
  targeted = new Set([]);

  /**
   * A reference to the SpriteMesh which displays this Token in the PrimaryCanvasGroup.
   * @type {TokenMesh}
   */
  mesh;

  /**
   * A reference to the VisionSource object which defines this vision source area of effect
   * @type {VisionSource}
   */
  vision = new VisionSource(this);

  /**
   * A reference to the LightSource object which defines this light source area of effect
   * @type {LightSource}
   */
  light = new LightSource(this);

  /**
   * A reference to an animation that is currently in progress for this Token, if any
   * @type {Promise|null}
   * @internal
   */
  _animation = null;

  /**
   * An Object which records the Token's prior velocity dx and dy.
   * This can be used to determine which direction a Token was previously moving.
   * @type {{dx: number, dy: number, ox: number, oy: number}}
   */
  #priorMovement;

  /**
   * The Token central coordinate, adjusted for its most recent movement vector.
   * @type {Point}
   */
  #adjustedCenter;

  /**
   * @typedef {Point} TokenPosition
   * @property {number} rotation  The token's last valid rotation.
   */

  /**
   * The Token's most recent valid position and rotation.
   * @type {TokenPosition}
   */
  #validPosition;

  /**
   * A flag to capture whether this Token has an unlinked video texture
   * @type {boolean}
   */
  #unlinkedVideo = false;

  /* -------------------------------------------- */

  /**
   * Establish an initial velocity of the token based on its direction of facing.
   * Assume the Token made some prior movement towards the direction that it is currently facing.
   */
  #initialize() {

    // Initialize prior movement
    const {x, y, rotation} = this.document;
    const r = Ray.fromAngle(x, y, Math.toRadians(rotation + 90), canvas.dimensions.size);

    // Initialize valid position
    this.#validPosition = {x, y, rotation};
    this.#priorMovement = {dx: r.dx, dy: r.dy, ox: Math.sign(r.dx), oy: Math.sign(r.dy)};
    this.#adjustedCenter = this.getMovementAdjustedPoint(this.center);
  }

  /* -------------------------------------------- */
  /*  Permission Attributes
  /* -------------------------------------------- */

  /**
   * A convenient reference to the Actor object associated with the Token embedded document.
   * @returns {Actor|null}
   */
  get actor() {
    return this.document.actor;
  }

  /* -------------------------------------------- */

  /**
   * A convenient reference for whether the current User has full control over the Token document.
   * @type {boolean}
   */
  get owner() {
    return this.document.isOwner;
  }

  get isOwner() {
    return this.document.isOwner;
  }

  /* -------------------------------------------- */

  /**
   * A boolean flag for whether the current game User has observer permission for the Token
   * @type {boolean}
   */
  get observer() {
    return game.user.isGM || !!this.actor?.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /**
   * Is the HUD display active for this token?
   * @returns {boolean}
   */
  get hasActiveHUD() {
    return this.layer.hud.object === this;
  }

  /* -------------------------------------------- */

  /**
   * Convenience access to the token's nameplate string
   * @type {string}
   */
  get name() {
    return this.document.name;
  }

  /* -------------------------------------------- */
  /*  Rendering Attributes
  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y} = this.document;
    return new PIXI.Rectangle(x, y, this.w, this.h);
  }

  /* -------------------------------------------- */

  /**
   * Defines the filter to use for detection.
   * @param {PIXI.Filter|null} filter
   */
  set detectionFilter(filter) {
    // First removing the detection filter if it is defined
    if ( this.#detectionFilter ) this.mesh.filters.findSplice(o => o === this.#detectionFilter);

    // Assigning the new filter (or an undefined value)
    this.#detectionFilter = (filter && (filter instanceof PIXI.Filter)) ? filter : undefined;
    if ( !this.#detectionFilter ) return;

    // Install the filter disabled
    this.#detectionFilter.enabled = false;
    if ( this.mesh.filters ) this.mesh.filters.unshift(this.#detectionFilter);
    else this.mesh.filters = [this.#detectionFilter];
  }

  #detectionFilter;

  /* -------------------------------------------- */

  /**
   * Translate the token's grid width into a pixel width based on the canvas size
   * @type {number}
   */
  get w() {
    return canvas.grid.grid.getRect(this.document.width, this.document.height).width;
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's grid height into a pixel height based on the canvas size
   * @type {number}
   */
  get h() {
    return canvas.grid.grid.getRect(this.document.width, this.document.height).height;
  }

  /* -------------------------------------------- */

  /**
   * The Token's current central position
   * @type {Point}
   */
  get center() {
    return this.getCenter(this.document.x, this.document.y);
  }

  /* -------------------------------------------- */

  /**
   * The Token's central position, adjusted in each direction by one or zero pixels to offset it relative to walls.
   * @type {Point}
   */
  getMovementAdjustedPoint(point, {offsetX, offsetY}={}) {
    const x = Math.roundFast(point.x);
    const y = Math.roundFast(point.y);
    const r = new PIXI.Rectangle(x, y, 0, 0);
    const walls = canvas.walls.quadtree.getObjects(r, {collisionTest: o => {
      return foundry.utils.orient2dFast(o.t.A, o.t.B, {x, y}) === 0;
    }});
    if ( walls.size ) {
      const {ox, oy} = this.#priorMovement;
      return {x: x - (offsetX ?? ox), y: y - (offsetY ?? oy)};
    }
    return {x, y};
  }

  /* -------------------------------------------- */

  /**
   * The HTML source element for the primary Tile texture
   * @type {HTMLImageElement|HTMLVideoElement}
   */
  get sourceElement() {
    return this.texture?.baseTexture.resource.source;
  }

  /* -------------------------------------------- */

  /** @override */
  get sourceId() {
    let id = `${this.document.documentName}.${this.document.id}`;
    if ( this.isPreview ) id += ".preview";
    return id;
  }

  /* -------------------------------------------- */

  /**
   * Does this Tile depict an animated video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* -------------------------------------------- */
  /*  State Attributes
  /* -------------------------------------------- */

  /**
   * An indicator for whether or not this token is currently involved in the active combat encounter.
   * @type {boolean}
   */
  get inCombat() {
    return this.document.inCombat;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to a Combatant that represents this Token, if one is present in the current encounter.
   * @type {Combatant|null}
   */
  get combatant() {
    return this.document.combatant;
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether the Token is currently targeted by the active game User
   * @type {boolean}
   */
  get isTargeted() {
    return this.targeted.has(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the detection modes array.
   * @type {[object]}
   */
  get detectionModes() {
    return this.document.detectionModes;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the Token is visible to the calling user's perspective.
   * Hidden Tokens are only displayed to GM Users.
   * Non-hidden Tokens are always visible if Token Vision is not required.
   * Controlled tokens are always visible.
   * All Tokens are visible to a GM user if no Token is controlled.
   *
   * @see {CanvasVisibility#testVisibility}
   * @type {boolean}
   */
  get isVisible() {
    // Only GM users can see hidden tokens
    const gm = game.user.isGM;
    if ( this.document.hidden && !gm ) return false;

    // Some tokens are always visible
    if ( !canvas.effects.visibility.tokenVision ) return true;
    if ( this.controlled ) return true;

    // Otherwise, test visibility against current sight polygons
    if ( canvas.effects.visionSources.has(this.sourceId) ) return true;
    const tolerance = Math.min(this.w, this.h) / 4;
    return canvas.effects.visibility.testVisibility(this.center, {tolerance, object: this});
  }

  /* -------------------------------------------- */

  /**
   * The animation name used for Token movement
   * @type {string}
   */
  get animationName() {
    return `${this.sourceId}.animate`;
  }

  /* -------------------------------------------- */
  /*  Lighting and Vision Attributes
  /* -------------------------------------------- */

  /**
   * Test whether the Token has sight (or blindness) at any radius
   * @type {boolean}
   */
  get hasSight() {
    return this.document.sight.enabled;
  }

  /* -------------------------------------------- */

  /**
   * Does this Token actively emit light given its properties and the current darkness level of the Scene?
   * @type {boolean}
   */
  get emitsLight() {
    const {hidden, light} = this.document;
    if ( hidden ) return false;
    if ( !(light.dim || light.bright) ) return false;
    const darkness = canvas.darknessLevel;
    return darkness.between(light.darkness.min, light.darkness.max);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the Token uses a limited angle of vision or light emission.
   * @type {boolean}
   */
  get hasLimitedSourceAngle() {
    const doc = this.document;
    return (this.hasSight && (doc.sight.angle !== 360)) || (this.emitsLight && (doc.light.angle !== 360));
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's dim light distance in units into a radius in pixels.
   * @type {number}
   */
  get dimRadius() {
    return this.getLightRadius(this.document.light.dim);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's bright light distance in units into a radius in pixels.
   * @type {number}
   */
  get brightRadius() {
    return this.getLightRadius(this.document.light.bright);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's vision range in units into a radius in pixels.
   * @type {number}
   */
  get sightRange() {
    return this.getLightRadius(this.document.sight.range);
  }

  /* -------------------------------------------- */

  /**
   * Translate the token's maximum vision range that takes into account lights.
   * @type {number}
   */
  get optimalSightRange() {
    const r = Math.max(Math.abs(this.document.light.bright), Math.abs(this.document.light.dim));
    return this.getLightRadius(Math.max(this.document.sight.range, r));
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone() {
    const clone = super.clone();
    clone.#priorMovement = this.#priorMovement;
    clone.#validPosition = this.#validPosition;
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Update the light and vision source objects associated with this Token.
   * @param {object} [options={}]       Options which configure how perception sources are updated
   * @param {boolean} [options.defer=false]         Defer refreshing the SightLayer to manually call that refresh later
   * @param {boolean} [options.deleted=false]       Indicate that this light source has been deleted
   */
  updateSource({defer=false, deleted=false}={}) {
    this.#adjustedCenter = this.getMovementAdjustedPoint(this.center);
    this.updateLightSource({defer, deleted});
    this.updateVisionSource({defer, deleted});
  }

  /* -------------------------------------------- */

  /**
   * Update an emitted light source associated with this Token.
   * @param {object} [options={}]
   * @param {boolean} [options.defer]      Defer refreshing the LightingLayer to manually call that refresh later.
   * @param {boolean} [options.deleted]    Indicate that this light source has been deleted.
   */
  updateLightSource({defer=false, deleted=false}={}) {

    // Prepare data
    const origin = this.#adjustedCenter;
    const sourceId = this.sourceId;
    const d = canvas.dimensions;
    const isLightSource = this.emitsLight;

    // Initialize a light source
    if ( isLightSource && !deleted ) {
      const lightConfig = foundry.utils.mergeObject(this.document.light.toObject(false), {
        x: origin.x,
        y: origin.y,
        dim: Math.clamped(this.getLightRadius(this.document.light.dim), 0, d.maxR),
        bright: Math.clamped(this.getLightRadius(this.document.light.bright), 0, d.maxR),
        z: this.document.getFlag("core", "priority"),
        seed: this.document.getFlag("core", "animationSeed"),
        rotation: this.document.rotation
      });
      this.light.initialize(lightConfig);
      canvas.effects.lightSources.set(sourceId, this.light);
    }

    // Remove a light source
    else canvas.effects.lightSources.delete(sourceId);

    // Schedule a perception update
    if ( !defer && ( isLightSource || deleted ) ) {
      canvas.perception.update({
        refreshLighting: true,
        refreshVision: true
      }, true);
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the VisionSource instance associated with this Token.
   * @param {object} [options]        Options which affect how the vision source is updated
   * @param {boolean} [options.defer]     Defer refreshing the LightingLayer to manually call that refresh later.
   * @param {boolean} [options.deleted]   Indicate that this vision source has been deleted.
   */
  updateVisionSource({defer=false, deleted=false}={}) {

    // Prepare data
    const origin = this.#adjustedCenter;
    const sourceId = this.sourceId;
    const d = canvas.dimensions;
    const isVisionSource = this._isVisionSource();

    // Initialize vision source
    if ( isVisionSource && !deleted ) {
      this.vision.initialize({
        x: origin.x,
        y: origin.y,
        radius: Math.clamped(this.sightRange, 0, d.maxR),
        externalRadius: Math.max(this.mesh.width, this.mesh.height) / 2,
        angle: this.document.sight.angle,
        contrast: this.document.sight.contrast,
        saturation: this.document.sight.saturation,
        brightness: this.document.sight.brightness,
        attenuation: this.document.sight.attenuation,
        rotation: this.document.rotation,
        visionMode: this.document.sight.visionMode,
        color: Color.from(this.document.sight.color),
        isPreview: !!this._original,
        blinded: this.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND)
      });
      canvas.effects.visionSources.set(sourceId, this.vision);
    }

    // Remove vision source
    else canvas.effects.visionSources.delete(sourceId);

    // Schedule a perception update
    if ( !defer && (isVisionSource || deleted) ) {
      canvas.perception.update({refreshVision: true, refreshLighting: true}, true);
    }
  }

  /* -------------------------------------------- */

  /**
   * Test whether this Token is a viable vision source for the current User
   * @returns {boolean}
   * @private
   */
  _isVisionSource() {
    if ( !canvas.effects.visibility.tokenVision || !this.hasSight ) return false;

    // Only display hidden tokens for the GM
    const isGM = game.user.isGM;
    if (this.document.hidden && !isGM) return false;

    // Always display controlled tokens which have vision
    if ( this.controlled ) return true;

    // Otherwise vision is ignored for GM users
    if ( isGM ) return false;

    // If a non-GM user controls no other tokens with sight, display sight anyways
    const canObserve = this.actor?.testUserPermission(game.user, "OBSERVER") ?? false;
    if ( !canObserve ) return false;
    const others = this.layer.controlled.filter(t => !t.document.hidden && t.hasSight);
    return !others.length;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  render(renderer) {
    if ( this.#detectionFilter ) {
      this.#detectionFilter.enabled = true;
      this.mesh.pluginName = BaseSamplerShader.classPluginName;
      this.mesh.render(renderer);
      this.mesh.pluginName = null;
      this.#detectionFilter.enabled = false;
    }
    super.render(renderer);
  }

  /* -------------------------------------------- */

  /** @override */
  clear() {
    if ( this.hasActiveHUD ) this.layer.hud.clear();
    return super.clear();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _destroy(options) {
    canvas.primary.removeToken(this);           // Remove the TokenMesh from the PrimaryCanvasGroup
    this.border.destroy();                      // Remove the border Graphics from the GridLayer
    this.light.destroy();                       // Destroy the LightSource
    this.vision.destroy();                      // Destroy the VisionSource
    this.texture.destroy(this.#unlinkedVideo);  // Destroy base texture if the token has an unlinked video
    this.texture = undefined;
    this.#unlinkedVideo = false;
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw() {
    this._cleanData();

    // Draw the token as invisible, so it will be safely revealed later
    this.visible = false;

    // Load token texture
    let texture;
    if ( this.isPreview ) texture = this._original.texture?.clone();
    else texture = await loadTexture(this.document.texture.src, {fallback: CONST.DEFAULT_TOKEN});

    // Manage video playback
    let video = game.video.getVideoSource(texture);
    this.#unlinkedVideo = video && !this._original;
    if ( video ) {
      const playOptions = {volume: 0};
      if ( this.#unlinkedVideo ) {
        texture = await game.video.cloneTexture(video);
        video = game.video.getVideoSource(texture);
        if ( this.document.getFlag("core", "randomizeVideo") !== false ) {
          playOptions.offset = Math.random() * video.duration;
        }
      }
      game.video.play(video, playOptions);
    }
    this.texture = texture;

    // Draw the TokenMesh in the PrimaryCanvasGroup
    this.mesh = canvas.primary.addToken(this);
    this.#animationAttributes = this.getDisplayAttributes();

    // Draw the border frame in the GridLayer
    this.border ||= canvas.grid.borders.addChild(new PIXI.Graphics());

    // Draw Token interface components
    this.bars = this.addChild(this._drawAttributeBars());
    this.tooltip = this.addChild(this._drawTooltip());
    this.effects = this.addChild(new PIXI.Container());

    this.target = this.addChild(new PIXI.Graphics());
    this.nameplate = this.addChild(this._drawNameplate());

    // Draw elements
    this.drawBars();
    await this.drawEffects();

    // Define initial interactivity and visibility state
    this.hitArea = new PIXI.Rectangle(0, 0, this.w, this.h);
    this.buttonMode = true;
  }

  /* -------------------------------------------- */

  /**
   * Apply initial sanitizations to the provided input data to ensure that a Token has valid required attributes.
   * Constrain the Token position to remain within the Canvas rectangle.
   * @private
   */
  _cleanData() {
    if ( !canvas || !this.scene?.active ) return;
    const d = canvas.dimensions;
    this.document.x = Math.clamped(this.document.x, 0, d.width - this.w);
    this.document.y = Math.clamped(this.document.y, 0, d.height - this.h);
  }

  /* -------------------------------------------- */

  /**
   * Draw resource bars for the Token
   * @private
   */
  _drawAttributeBars() {
    const bars = new PIXI.Container();
    bars.bar1 = bars.addChild(new PIXI.Graphics());
    bars.bar2 = bars.addChild(new PIXI.Graphics());
    return bars;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh(options) {
    this.position.set(this.document.x, this.document.y);
    this.mesh?.refresh();
    this._refreshTarget();
    this.refreshHUD(options);
  }

  /* -------------------------------------------- */

  /**
   * Refresh display of elements of the Token HUD.
   * @param {object} options          Which components of the HUD to refresh?
   * @param {boolean} [options.bars]        Re-draw bars?
   * @param {boolean} [options.border]      Re-draw the border?
   * @param {boolean} [options.effects]     Re-draw effect icons?
   * @param {boolean} [options.elevation]   Re-draw elevation text
   * @param {boolean} [options.nameplate]   Re-draw the nameplate?
   */
  refreshHUD({bars=true, border=true, effects=true, elevation=true, nameplate=true}={}) {
    if ( bars ) this.drawBars();
    if ( border ) this._refreshBorder();
    if ( effects ) this._refreshEffects();
    if ( elevation ) {
      const tt = this._getTooltipText();
      if ( tt !== this.tooltip.text ) this.tooltip.text = tt;
      this.tooltip.position.set(this.w / 2, -2);
    }
    if ( nameplate ) {
      if ( this.document.name !== this.nameplate.text ) this.nameplate.text = this.document.name;
      this.nameplate.position.set(this.w / 2, this.h + 2);
      this.nameplate.visible = this._canViewMode(this.document.displayName);
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the Token border, taking into consideration the grid type and border color
   * @protected
   */
  _refreshBorder() {
    this.border.clear();
    this.border.position.set(this.document.x, this.document.y);
    if ( !this.visible ) return;
    const borderColor = this._getBorderColor();
    if ( !borderColor ) return;
    const t = CONFIG.Canvas.objectBorderThickness;

    // Draw Hex border for size 1 tokens on a hex grid
    if ( canvas.grid.isHex ) {
      const polygon = canvas.grid.grid.getBorderPolygon(this.document.width, this.document.height, t);
      if ( polygon ) {
        this.border.lineStyle(t, 0x000000, 0.8).drawPolygon(polygon);
        this.border.lineStyle(t/2, borderColor, 1.0).drawPolygon(polygon);
        return;
      }
    }

    // Otherwise, draw square border
    const h = Math.round(t/2);
    const o = Math.round(h/2);
    this.border.lineStyle(t, 0x000000, 0.8).drawRoundedRect(-o, -o, this.w+h, this.h+h, 3);
    this.border.lineStyle(h, borderColor, 1.0).drawRoundedRect(-o, -o, this.w+h, this.h+h, 3);
  }

  /* -------------------------------------------- */

  /**
   * Get the hex color that should be used to render the Token border
   * @param {object} [options]
   * @param {boolean} [options.hover]  Return a border color for this hover state, otherwise use the token's current
   *                                   state.
   * @returns {number|null}            The hex color used to depict the border color
   * @private
   */
  _getBorderColor({hover}={}) {
    const colors = CONFIG.Canvas.dispositionColors;
    if ( this.controlled ) return colors.CONTROLLED;
    else if ( (hover ?? this.hover) || canvas.tokens._highlight ) {
      let d = parseInt(this.document.disposition);
      if ( !game.user.isGM && this.isOwner ) return colors.CONTROLLED;
      else if ( this.actor?.hasPlayerOwner ) return colors.PARTY;
      else if ( d === CONST.TOKEN_DISPOSITIONS.FRIENDLY ) return colors.FRIENDLY;
      else if ( d === CONST.TOKEN_DISPOSITIONS.NEUTRAL ) return colors.NEUTRAL;
      else return colors.HOSTILE;
    }
    else return null;
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} ReticuleOptions
   * @property {number} [margin=0]        The amount of margin between the targeting arrows and the token's bounding
   *                                      box, expressed as a fraction of an arrow's size.
   * @property {number} [alpha=1]         The alpha value of the arrows.
   * @property {number} [size=0.15]       The size of the arrows as a proportion of grid size.
   * @property {number} [color=0xFF6400]  The color of the arrows.
   * @property {object} [border]          The arrows' border style configuration.
   * @property {number} [border.color=0]  The border color.
   * @property {number} [border.width=2]  The border width.
   */

  /**
   * Refresh the target indicators for the Token.
   * Draw both target arrows for the primary User as well as indicator pips for other Users targeting the same Token.
   * @param {ReticuleOptions} [reticule]  Additional parameters to configure how the targeting reticule is drawn.
   * @protected
   */
  _refreshTarget(reticule) {
    this.target.clear();
    if ( !this.targeted.size ) return;

    // Determine whether the current user has target and any other users
    const [others, user] = Array.from(this.targeted).partition(u => u === game.user);

    // For the current user, draw the target arrows
    if ( user.length ) this._drawTarget(reticule);

    // For other users, draw offset pips
    const hw = this.w / 2;
    for ( let [i, u] of others.entries() ) {
      const offset = Math.floor((i+1) / 2) * 16;
      const sign = i % 2 === 0 ? 1 : -1;
      const x = hw + (sign * offset);
      this.target.beginFill(Color.from(u.color), 1.0).lineStyle(2, 0x0000000).drawCircle(x, 0, 6);
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw the targeting arrows around this token.
   * @param {ReticuleOptions} [reticule]  Additional parameters to configure how the targeting reticule is drawn.
   * @protected
   */
  _drawTarget({margin: m=0, alpha=1, size=.15, color, border: {width=2, color: lineColor=0}={}}={}) {
    const l = canvas.dimensions.size * size; // Side length.
    const {h, w} = this;
    const lineStyle = {color: lineColor, alpha, width, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.BEVEL};
    color ??= this._getBorderColor({hover: true});
    m *= l * -1;
    this.target.beginFill(color, alpha).lineStyle(lineStyle)
      .drawPolygon([-m, -m, -m-l, -m, -m, -m-l]) // Top left
      .drawPolygon([w+m, -m, w+m+l, -m, w+m, -m-l]) // Top right
      .drawPolygon([-m, h+m, -m-l, h+m, -m, h+m+l]) // Bottom left
      .drawPolygon([w+m, h+m, w+m+l, h+m, w+m, h+m+l]); // Bottom right
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of Token attribute bars, rendering its latest resource data
   * If the bar attribute is valid (has a value and max), draw the bar. Otherwise hide it.
   */
  drawBars() {
    if ( !this.actor || (this.document.displayBars === CONST.TOKEN_DISPLAY_MODES.NONE) ) {
      return this.bars.visible = false;
    }
    ["bar1", "bar2"].forEach((b, i) => {
      const bar = this.bars[b];
      const attr = this.document.getBarAttribute(b);
      if ( !attr || (attr.type !== "bar") ) return bar.visible = false;
      this._drawBar(i, bar, attr);
      bar.visible = true;
    });
    this.bars.visible = this._canViewMode(this.document.displayBars);
  }

  /* -------------------------------------------- */

  /**
   * Draw a single resource bar, given provided data
   * @param {number} number       The Bar number
   * @param {PIXI.Graphics} bar   The Bar container
   * @param {Object} data         Resource data for this bar
   * @protected
   */
  _drawBar(number, bar, data) {
    const val = Number(data.value);
    const pct = Math.clamped(val, 0, data.max) / data.max;

    // Determine sizing
    let h = Math.max((canvas.dimensions.size / 12), 8);
    const w = this.w;
    const bs = Math.clamped(h / 8, 1, 2);
    if ( this.document.height >= 2 ) h *= 1.6;  // Enlarge the bar for large tokens

    // Determine the color to use
    const blk = 0x000000;
    let color;
    if ( number === 0 ) color = PIXI.utils.rgb2hex([(1-(pct/2)), pct, 0]);
    else color = PIXI.utils.rgb2hex([(0.5 * pct), (0.7 * pct), 0.5 + (pct / 2)]);

    // Draw the bar
    bar.clear();
    bar.beginFill(blk, 0.5).lineStyle(bs, blk, 1.0).drawRoundedRect(0, 0, this.w, h, 3);
    bar.beginFill(color, 1.0).lineStyle(bs, blk, 1.0).drawRoundedRect(0, 0, pct*w, h, 2);

    // Set position
    let posY = number === 0 ? this.h - h : 0;
    bar.position.set(0, posY);
  }

  /* -------------------------------------------- */

  /**
   * Draw the token's nameplate as a text object
   * @returns {PIXI.Text}  The Text object for the Token nameplate
   */
  _drawNameplate() {
    const style = this._getTextStyle();
    const name = new PreciseText(this.document.name, style);
    name.anchor.set(0.5, 0);
    name.position.set(this.w / 2, this.h + 2);
    return name;
  }

  /* -------------------------------------------- */

  /**
   * Draw a text tooltip for the token which can be used to display Elevation or a resource value
   * @returns {PreciseText}     The text object used to render the tooltip
   * @private
   */
  _drawTooltip() {
    let text = this._getTooltipText();
    const style = this._getTextStyle();
    const tip = new PreciseText(text, style);
    tip.anchor.set(0.5, 1);
    tip.position.set(this.w / 2, -2);
    return tip;
  }

  /* -------------------------------------------- */

  /**
   * Return the text which should be displayed in a token's tooltip field
   * @returns {string}
   * @private
   */
  _getTooltipText() {
    let el = this.document.elevation;
    if ( !Number.isFinite(el) || el === 0 ) return "";
    let units = canvas.scene.grid.units;
    return el > 0 ? `+${el} ${units}` : `${el} ${units}`;
  }

  /* -------------------------------------------- */

  _getTextStyle() {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 24;
    if (canvas.dimensions.size >= 200) style.fontSize = 28;
    else if (canvas.dimensions.size < 50) style.fontSize = 20;
    style.wordWrapWidth = this.w * 2.5;
    return style;
  }

  /* -------------------------------------------- */

  /**
   * Draw the active effects and overlay effect icons which are present upon the Token
   */
  async drawEffects() {
    this.effects.renderable = false;
    this.effects.removeChildren().forEach(c => c.destroy());
    this.effects.bg = this.effects.addChild(new PIXI.Graphics());
    this.effects.overlay = null;

    // Categorize new effects
    const tokenEffects = this.document.effects;
    const actorEffects = this.actor?.temporaryEffects || [];
    let overlay = {
      src: this.document.overlayEffect,
      tint: null
    };

    // Draw status effects
    if ( tokenEffects.length || actorEffects.length ) {
      const promises = [];

      // Draw actor effects first
      for ( let f of actorEffects ) {
        if ( !f.icon ) continue;
        const tint = Color.from(f.tint ?? null);
        if ( f.getFlag("core", "overlay") ) {
          overlay = {src: f.icon, tint};
          continue;
        }
        promises.push(this._drawEffect(f.icon, tint));
      }

      // Next draw token effects
      for ( let f of tokenEffects ) promises.push(this._drawEffect(f, null));
      await Promise.all(promises);
    }

    // Draw overlay effect
    this.effects.overlay = await this._drawOverlay(overlay.src, overlay.tint);
    this._refreshEffects();
    this.effects.renderable = true;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of status effects, adjusting their position for the token width and height.
   * @protected
   */
  _refreshEffects() {
    let i = 0;
    const w = Math.round(canvas.dimensions.size / 2 / 5) * 2;
    const rows = Math.floor(this.document.height * 5);
    const bg = this.effects.bg.clear().beginFill(0x000000, 0.40).lineStyle(1.0, 0x000000);
    for ( const effect of this.effects.children ) {
      if ( effect === bg ) continue;

      // Overlay effect
      if ( effect === this.effects.overlay ) {
        const size = Math.min(this.w * 0.6, this.h * 0.6);
        effect.width = effect.height = size;
        effect.position.set((this.w - size) / 2, (this.h - size) / 2);
      }

      // Status effect
      else {
        effect.width = effect.height = w;
        effect.x = Math.floor(i / rows) * w;
        effect.y = (i % rows) * w;
        bg.drawRoundedRect(effect.x + 1, effect.y + 1, w - 2, w - 2, 2);
        i++;
      }
    }
  }


  /* -------------------------------------------- */

  /**
   * Draw a status effect icon
   * @param {string} src
   * @param {number|null} tint
   * @returns {Promise<PIXI.Sprite|undefined>}
   * @protected
   */
  async _drawEffect(src, tint) {
    if ( !src ) return;
    let tex = await loadTexture(src, {fallback: "icons/svg/hazard.svg"});
    let icon = new PIXI.Sprite(tex);
    if ( tint ) icon.tint = tint;
    return this.effects.addChild(icon);
  }

  /* -------------------------------------------- */

  /**
   * Draw the overlay effect icon
   * @param {string} src
   * @param {number|null} tint
   * @returns {Promise<PIXI.Sprite>}
   * @protected
   */
  async _drawOverlay(src, tint) {
    const icon = await this._drawEffect(src, tint);
    if ( icon ) icon.alpha = 0.8;
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Helper method to determine whether a token attribute is viewable under a certain mode
   * @param {number} mode   The mode from CONST.TOKEN_DISPLAY_MODES
   * @returns {boolean}      Is the attribute viewable?
   * @private
   */
  _canViewMode(mode) {
    if ( mode === CONST.TOKEN_DISPLAY_MODES.NONE ) return false;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.ALWAYS ) return true;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.CONTROL ) return this.controlled;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.HOVER ) return (this.hover || canvas.tokens._highlight);
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER ) return this.isOwner && this.hover;
    else if ( mode === CONST.TOKEN_DISPLAY_MODES.OWNER ) return this.isOwner;
    return false;
  }

  /* -------------------------------------------- */
  /*  Token Animation                             */
  /* -------------------------------------------- */

  /**
   * @typedef {object} TokenAttributesSnapshot
   * @property {number} x
   * @property {number} y
   * @property {number} width
   * @property {number} height
   * @property {number} alpha
   * @property {number} rotation
   * @property {TextureData} texture
   */

  /**
   * A point-in-time snapshot of the display attributes for the Token which provides a baseline for animation.
   * @type {TokenAttributesSnapshot}
   */
  #animationAttributes;

  /* -------------------------------------------- */

  /**
   * Get the display attributes of the TokenDocument which are used to inform refresh.
   * @returns {object}
   */
  getDisplayAttributes() {
    let {alpha, rotation, texture, x, y, width, height, lockRotation} = this.document;
    let {scaleX, scaleY, tint} = texture;
    rotation = lockRotation ? 0 : Math.normalizeDegrees(rotation);
    tint = Color.from(tint ?? 0xFFFFFF);
    return {x, y, width, height, alpha, rotation, texture: {scaleX, scaleY, tint}};
  }

  /* -------------------------------------------- */

  /**
   * Animate changes to the appearance of the Token.
   * Animations are performed over differences between the TokenDocument and the current Token and TokenMesh appearance.
   * @param {object} updateData                     A record of the differential data which changed, for reference only
   * @param {CanvasAnimationOptions} [options]      Options which configure the animation behavior
   * @param {number} [options.movementSpeed]        A desired token movement speed in grid spaces per second
   * @param {TokenAttributesSnapshot} [options.a0]  The animation starting attributes if different from those cached.
   * @returns {Promise<void>}                       A promise which resolves once the animation is complete
   */
  async animate(updateData, {name, duration, easing, movementSpeed=6, ontick, a0}={}) {
    a0 ??= this.#animationAttributes;
    const a1 = this.getDisplayAttributes();
    const animation = {};
    const attributes = {};

    // Regular numeric attributes
    for ( const k of ["x", "y", "alpha", "width", "height"] ) {
      if ( a1[k] !== a0[k] ) attributes[k] = {attribute: k, from: a0[k], to: a1[k], parent: animation};
    }
    for ( const k of ["scaleX", "scaleY"] ) {
      if ( a1.texture[k] !== a0.texture[k] ) {
        animation.texture ||= {};
        attributes[k] = {attribute: k, from: a0.texture[k], to: a1.texture[k], parent: animation.texture};
      }
    }

    // Special handling for rotation
    let dr = a1.rotation - a0.rotation;
    if ( dr !== 0 ) {
      let r = a1.rotation;
      if ( dr > 180 ) r -= 360;
      if ( dr < -180 ) r += 360;
      dr = r - a0.rotation;
      attributes.rotation = {attribute: "rotation", from: a0.rotation, to: r, parent: animation};
    }

    // Special handling for hidden state
    if ( "hidden" in updateData ) {
      const to = Math.min(a1.alpha, updateData.hidden ? .5 : 1);
      attributes.alpha = {attribute: "alpha", from: a0.alpha, to, parent: animation};
    }

    // Special handling for tint
    if ( !a1.texture?.tint.equals(a0.texture?.tint) ) {
      animation.texture ||= {};
      const targetRGB = a1.texture.tint.rgb;
      const currentRGB = a0.texture.tint.rgb;
      attributes.tintR = {attribute: "r", from: currentRGB[0], to: targetRGB[0], parent: animation.texture};
      attributes.tintG = {attribute: "g", from: currentRGB[1], to: targetRGB[1], parent: animation.texture};
      attributes.tintB = {attribute: "b", from: currentRGB[2], to: targetRGB[2], parent: animation.texture};
    }

    // Configure animation
    if ( foundry.utils.isEmpty(attributes) ) return;
    const emits = this.emitsLight;
    const isPerceptionChange = ["x", "y", "rotation"].some(k => k in updateData);
    const config = game.settings.get("core", "visionAnimation") && isPerceptionChange ? {
      animatePerception: this._isVisionSource() || emits,
      sound: this.observer,
      forceUpdateFog: emits && !this.controlled && (canvas.effects.visionSources.size > 0)
    } : {animatePerception: false};

    // Configure animation duration aligning movement and rotation speeds
    if ( !duration ) {
      const durations = [];
      const dx = a1.x - a0.x;
      const dy = a1.y - a0.y;
      if ( dx || dy ) durations.push((Math.hypot(dx, dy) * 1000) / (canvas.dimensions.size * movementSpeed));
      if ( dr ) durations.push((Math.abs(dr) * 1000) / (movementSpeed * 60));
      if ( durations.length ) duration = Math.max(...durations);
    }

    // Dispatch animation
    this._animation = CanvasAnimation.animate(Object.values(attributes), {
      name: name || this.animationName,
      context: this,
      duration: duration,
      easing: easing,
      priority: PIXI.UPDATE_PRIORITY.HIGH + 1,
      ontick: (dt, anim) => {
        this.#animateFrame(animation, config);
        if ( ontick ) ontick(dt, anim, animation, config);
      }
    });
    await this._animation;
    this._animation = null;

    // Render the completed animation
    config.animatePerception = config.forceUpdateFog = true;
    this.#animateFrame(animation, config);
  }

  /* -------------------------------------------- */

  /**
   * Handle a single frame of a token animation.
   * @param {object} frame          The current animation frame
   * @param {object} config         The animation configuration
   * @param {boolean} [config.animatePerception]    Animate perception changes
   * @param {boolean} [config.forceUpdateFog]       Force updating fog of war during animation
   * @param {boolean} [config.sound]                Animate ambient sound changes
   */
  #animateFrame(frame, {animatePerception, forceUpdateFog, sound}={}) {

    // Recover animation color
    if ( frame.texture?.tintR ) {
      const {tintR, tintG, tintB} = frame.texture;
      frame.texture.tint = Color.fromRGB([tintR, tintG, tintB]);
    }

    // Update the document
    frame = this.document.constructor.cleanData(frame, {partial: true});
    foundry.utils.mergeObject(this.document, frame, {insertKeys: false});

    // Record animation attributes
    this.#animationAttributes = this.getDisplayAttributes();

    // Refresh the Token and TokenMesh
    const changePosition = ("x" in frame) || ("y" in frame);
    const changeSize = ("width" in frame) || ("height" in frame);
    this.refresh({
      bars: changeSize,
      border: changePosition || changeSize,
      effects: changeSize,
      elevation: changeSize,
      nameplate: changeSize
    });

    // Animate perception changes
    if ( animatePerception ) {
      this.updateSource({defer: true});
      canvas.perception.update({
        refreshLighting: true,
        refreshVision: true,
        refreshTiles: true,
        forceUpdateFog: forceUpdateFog,
        refreshSounds: sound
      }, true);
    }

    // Otherwise, update visibility each frame
    else if (changeSize || changePosition) this.visible = this.isVisible;
  }

  /* -------------------------------------------- */

  /**
   * Terminate animation of this particular Token.
   */
  stopAnimation() {
    return CanvasAnimation.terminateAnimation(this.animationName);
  }

  /* -------------------------------------------- */
  /*  Methods
  /* -------------------------------------------- */

  /**
   * Check for collision when attempting a move to a new position
   * @param {Point} destination           The central destination point of the attempted movement
   * @param {object} [options={}]         Additional options forwarded to WallsLayer#checkCollision
   * @returns {boolean|object[]|object}   The result of the WallsLayer#checkCollision test
   */
  checkCollision(destination, {origin, type="move", mode="any"}={}) {

    // The test origin is the last confirmed valid position of the Token
    const center = origin || this.getCenter(this.#validPosition.x, this.#validPosition.y);
    origin = this.getMovementAdjustedPoint(center);

    // The test destination is the adjusted point based on the proposed movement vector
    const dx = destination.x - center.x;
    const dy = destination.y - center.y;
    const offsetX = dx === 0 ? this.#priorMovement.ox : Math.sign(dx);
    const offsetY = dy === 0 ? this.#priorMovement.oy : Math.sign(dy);
    destination = this.getMovementAdjustedPoint(destination, {offsetX, offsetY});

    // Reference the correct source object
    let source;
    switch ( type ) {
      case "move":
        source = this.#getMovementSource(origin); break;
      case "sight":
        source = this.vision; break;
      case "light":
        source = this.light; break;
      case "sound":
        throw new Error("Collision testing for Token sound sources is not supported at this time");
    }

    // Create a movement source passed to the polygon backend
    return CONFIG.Canvas.losBackend.testCollision(origin, destination, {type, mode, source});
  }

  /* -------------------------------------------- */

  /**
   * Prepare a MovementSource for the document
   * @returns {MovementSource}
   */
  #getMovementSource(origin) {
    const movement = new MovementSource(this);
    movement.initialize({x: origin.x, y: origin.y, elevation: this.document.elevation});
    return movement;
  }

  /* -------------------------------------------- */

  /**
   * Get the center-point coordinate for a given grid position
   * @param {number} x    The grid x-coordinate that represents the top-left of the Token
   * @param {number} y    The grid y-coordinate that represents the top-left of the Token
   * @returns {Object}     The coordinate pair which represents the Token's center at position (x, y)
   */
  getCenter(x, y) {
    return {
      x: x + (this.w / 2),
      y: y + (this.h / 2)
    };
  }

  /* -------------------------------------------- */

  /**
   * Update the tracked position and movement velocity of the Token
   * @param {object} [options]              Options provided as part of a Token update
   * @param {boolean} [options.recenter]    Automatically re-center the canvas if the Token has moved off-screen
   */
  updatePosition({recenter=true}={}) {

    // Record the new token position
    const origin = this._animation ? this.position : this.#validPosition;
    const destination = {x: this.document.x, y: this.document.y};
    this.#recordMovement(origin, destination);

    // Update visibility for a non-controlled token which may have moved into the field-of-view
    this.visible = this.isVisible;

    // If the movement took a controlled token off-screen, re-center the view
    if ( this.controlled && this.visible && recenter ) {
      const pad = 50;
      const sidebarPad = $("#sidebar").width() + pad;
      const rect = new PIXI.Rectangle(pad, pad, window.innerWidth - sidebarPad, window.innerHeight - pad);
      let gp = this.getGlobalPosition();
      if ( !rect.contains(gp.x, gp.y) ) canvas.animatePan(this.center);
    }
  }

  /* -------------------------------------------- */

  /**
   * Record that a Token movement has occurred, updating various internal attributes.
   * @param {Point} origin          The prior token top-left coordinate
   * @param {Point} destination     The new token top-left coordinate
   * @private
   */
  #recordMovement(origin, destination) {
    const ray = new Ray(origin, destination);
    const prior = this.#priorMovement;
    const ox = ray.dx === 0 ? prior.ox : Math.sign(ray.dx);
    const oy = ray.dy === 0 ? prior.oy : Math.sign(ray.dy);
    foundry.utils.mergeObject(this.#validPosition, destination);
    return this.#priorMovement = {dx: ray.dx, dy: ray.dy, ox, oy};
  }

  /* -------------------------------------------- */

  /**
   * Set this Token as an active target for the current game User.
   * Note: If the context is set with groupSelection:true, you need to manually broadcast the activity for other users.
   * @param {boolean} targeted                        Is the Token now targeted?
   * @param {object} [context={}]                     Additional context options
   * @param {User|null} [context.user=null]           Assign the token as a target for a specific User
   * @param {boolean} [context.releaseOthers=true]    Release other active targets for the same player?
   * @param {boolean} [context.groupSelection=false]  Is this target being set as part of a group selection workflow?
   */
  setTarget(targeted=true, {user=null, releaseOthers=true, groupSelection=false}={}) {
    user = user || game.user;

    // Release other targets
    if ( user.targets.size && releaseOthers ) {
      user.targets.forEach(t => {
        if ( t !== this ) t.setTarget(false, {user, releaseOthers: false, groupSelection});
      });
      user.targets.clear();
    }

    // Acquire target
    if ( targeted ) {
      this.targeted.add(user);
      user.targets.add(this);
    }

    // Release target
    else {
      this.targeted.delete(user);
      user.targets.delete(this);
    }

    // Refresh Token display
    this.refresh();

    // Refresh the Token HUD
    if ( this.hasActiveHUD ) this.layer.hud.render();

    // Broadcast the target change
    if ( !groupSelection ) user.broadcastActivity({targets: user.targets.ids});
  }

  /* -------------------------------------------- */

  /**
   * Add or remove the currently controlled Tokens from the active combat encounter
   * @param {Combat} [combat]    A specific combat encounter to which this Token should be added
   * @returns {Promise<Token>} The Token which initiated the toggle
   */
  async toggleCombat(combat) {
    await this.layer.toggleCombat(!this.inCombat, combat, {token: this});
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Toggle an active effect by its texture path.
   * Copy the existing Array in order to ensure the update method detects the data as changed.
   *
   * @param {string|object} effect  The texture file-path of the effect icon to toggle on the Token.
   * @param {object} [options]      Additional optional arguments which configure how the effect is handled.
   * @param {boolean} [options.active]    Force a certain active state for the effect
   * @param {boolean} [options.overlay]   Whether to set the effect as the overlay effect?
   * @returns {Promise<boolean>}   Was the texture applied (true) or removed (false)
   */
  async toggleEffect(effect, {active, overlay=false}={}) {
    const fx = this.document.effects;
    const texture = effect.icon ?? effect;

    // Case 1 - handle an active effect object
    if ( effect.icon ) await this.document.toggleActiveEffect(effect, {active, overlay});

    // Case 2 - overlay effect
    else if ( overlay ) await this._toggleOverlayEffect(texture, {active});

    // Case 3 - add or remove a standard effect icon
    else {
      const idx = fx.findIndex(e => e === texture);
      if ((idx !== -1) && (active !== true)) fx.splice(idx, 1);
      else if ((idx === -1) && (active !== false)) fx.push(texture);
      await this.document.update({effects: fx}, {
        diff: false,
        toggleEffect: CONFIG.statusEffects.find(e => e.icon === texture)?.id
      });
    }

    // Update the Token HUD
    if ( this.hasActiveHUD ) canvas.tokens.hud.refreshStatusIcons();
    return active;
  }

  /* -------------------------------------------- */

  /**
   * A helper function to toggle the overlay status icon on the Token
   * @param {string} texture
   * @param {object} root0
   * @param {boolean} root0.active
   * @returns {Promise<*>}
   * @private
   */
  async _toggleOverlayEffect(texture, {active}) {

    // Assign the overlay effect
    active = active ?? this.document.overlayEffect !== texture;
    let effect = active ? texture : null;
    await this.document.update({overlayEffect: effect});

    // Set the defeated status in the combat tracker
    // TODO - deprecate this and require that active effects be used instead
    if ( (texture === CONFIG.controlIcons.defeated) && game.combat ) {
      const combatant = game.combat.getCombatantByToken(this.id);
      if ( combatant ) await combatant.update({defeated: active});
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Toggle the visibility state of any Tokens in the currently selected set
   * @returns {Promise<TokenDocument[]>}     A Promise which resolves to the updated Token documents
   */
  async toggleVisibility() {
    let isHidden = this.document.hidden;
    const tokens = this.controlled ? canvas.tokens.controlled : [this];
    const updates = tokens.map(t => { return {_id: t.id, hidden: !isHidden};});
    return canvas.scene.updateEmbeddedDocuments("Token", updates);
  }

  /* -------------------------------------------- */

  /**
   * A generic transformation to turn a certain number of grid units into a radius in canvas pixels.
   * This function adds additional padding to the light radius equal to half the token width.
   * This causes light to be measured from the outer token edge, rather than from the center-point.
   * @param {number} units  The radius in grid units
   * @returns {number}       The radius in canvas units
   */
  getLightRadius(units) {
    if (units === 0) return 0;
    const u = Math.abs(units);
    const hw = (this.w / 2);
    return (((u / canvas.dimensions.distance) * canvas.dimensions.size) + hw) * Math.sign(units);
  }

  /* -------------------------------------------- */

  /** @override */
  _getShiftedPosition(dx, dy) {
    let [x, y] = canvas.grid.grid.shiftPosition(this.x, this.y, dx, dy, {token: this});
    let targetCenter = this.getCenter(x, y);
    let collide = this.checkCollision(targetCenter);
    return collide ? {x: this.document.x, y: this.document.y} : {x, y};
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _onCreate(options, userId) {

    // Start by drawing the newly created token
    this.draw().then(() => {

      // Draw vision for the new token
      const refreshVision = this.document.sight.enabled && this.observer;
      const refreshLighting = this.emitsLight;
      if ( refreshVision || refreshLighting ) {
        this.updateSource({defer: true});
        canvas.perception.update({refreshVision, refreshLighting}, true);
      }

      // Assume token control
      if ( !game.user.isGM && this.isOwner && !this.document.hidden ) this.control({pan: true});

      // Update visibility of objects in the Scene
      if ( !refreshVision ) canvas.effects.visibility.restrictVisibility();
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    const keys = Object.keys(foundry.utils.flattenObject(data));
    const changed = new Set(keys);
    const positionChange = ["x", "y"].some(c => changed.has(c));
    const shapeChange = ["width", "height"].some(k => changed.has(k));
    const perceptionUpdate = {};

    // Update token appearance
    // noinspection ES6MissingAwait
    this._onUpdateAppearance(data, changed, options);

    // Record cached attributes
    this.#animationAttributes = this.getDisplayAttributes();
    if ( positionChange ) this.updatePosition(options);
    if ( changed.has("rotation") ) this.#validPosition.rotation = this.document.rotation;

    // Update quadtree position
    if ( shapeChange || positionChange ) this.layer.quadtree.update({r: this.bounds, t: this});

    // Handle changes to the visibility state of the token
    const visibilityChange = changed.has("hidden");
    if ( visibilityChange ) {
      if ( !game.user.isGM ) {
        if ( this.controlled && data.hidden ) this.release();
        else if ( !data.hidden && !canvas.tokens.controlled.length ) this.control({pan: true});
      }
      this.visible = this.isVisible;
    }

    // Sort parent container
    if ( changed.has("elevation") ) {
      canvas.primary.sortChildren();
      perceptionUpdate.refreshTiles = perceptionUpdate.refreshVision = true;
    }

    // Determine whether the token's perspective has changed
    const rotationChange = changed.has("rotation") && this.hasLimitedSourceAngle;
    const perspectiveChange = visibilityChange || positionChange || rotationChange;
    const visionChange = ("sight" in data) || (this.hasSight && perspectiveChange) || ("detectionModes" in data);
    const lightChange = ("light" in data) || (this.emitsLight && perspectiveChange);
    if ( visionChange || lightChange ) {
      this.updateSource({defer: true});
      foundry.utils.mergeObject(perceptionUpdate, {
        initializeVision: changed.has("sight.enabled") || changed.has("sight.visionMode"),
        forceUpdateFog: this.hasLimitedSourceAngle,
        refreshLighting: true,
        refreshVision: true,
        refreshSounds: true,
        refreshTiles: true
      });
    }

    // Update tile occlusion
    if ( shapeChange || ["texture.scaleX", "texture.scaleY"].some(r => changed.has(r)) ) {
      this.hitArea = new PIXI.Rectangle(0, 0, this.w, this.h);
      perceptionUpdate.refreshTiles = true;
    }

    // Update the Token HUD
    if ( this.hasActiveHUD ) {
      if ( positionChange || shapeChange ) this.layer.hud.clear();
    }

    // Process Combat Tracker changes
    if ( this.inCombat ) {
      if ( changed.has("name") ) {
        canvas.addPendingOperation("Combat.setupTurns", game.combat.setupTurns, game.combat);
      }
      if ( ["effects", "name", "overlayEffect"].some(k => changed.has(k)) ) {
        canvas.addPendingOperation("CombatTracker.render", ui.combat.render, ui.combat);
      }
    }

    // Schedule perception updates
    canvas.perception.update(perceptionUpdate, true);
  }

  /* -------------------------------------------- */

  /**
   * Control updates to the appearance of the Token and its linked TokenMesh when a data update occurs.
   * @returns {Promise<void>}
   * @private
   */
  async _onUpdateAppearance(data, changed, options) {
    const fullRedraw = ["texture.src", "actorId", "actorLink"].some(r => changed.has(r));
    const animate = options.animate !== false;
    const p0 = {x: this.x, y: this.y};
    const a0 = this.#animationAttributes;

    // Fully re-draw certain changes
    if ( fullRedraw ) {
      const priorVisible = this.visible;
      await this.draw();
      this.visible = priorVisible;
    }

    // Incremental updates
    else {
      if ( ["effects", "overlayEffect"].some(k => changed.has(k)) ) await this.drawEffects();
      if ( !this.actor && (options.toggleEffect === "blind") ) {
        this.updateVisionSource();
        canvas.perception.update({initializeVision: true}, true);
      }
      this.refresh();
    }

    // Animate changes
    if ( animate ) {
      this.position.set(p0.x, p0.y);
      this.animate(data, {...options.animation, a0});
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {

    // Cancel movement animations
    this.stopAnimation();

    // Remove target (if applicable)
    game.user.targets.delete(this);

    // Process changes to perception
    const refreshVision = this.document.vision && this.observer;
    const refreshLighting = this.emitsLight;
    if ( refreshVision || refreshLighting ) {
      this.updateSource({deleted: true, defer: true});
      canvas.perception.update({refreshVision, refreshLighting}, true);
    }

    // Remove Combatants
    if (userId === game.user.id) {
      game.combats._onDeleteToken(this.scene.id, this.id);
    }

    // Parent class deletion handlers
    return super._onDelete(options, userId);
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to Token behavior when a significant status effect is applied
   * @param {string} statusId       The status effect ID being applied, from CONFIG.specialStatusEffects
   * @param {boolean} active        Is the special status effect now active?
   * @internal
   */
  _onApplyStatusEffect(statusId, active) {
    switch ( statusId ) {
      case CONFIG.specialStatusEffects.INVISIBLE:
        canvas.perception.update({refreshVision: true, refreshLighting: true}, true);
        this.mesh.refresh();
        break;
      case CONFIG.specialStatusEffects.BLIND:
        this.updateVisionSource();
        canvas.perception.update({initializeVision: true}, true);
        break;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onControl({releaseOthers=true, pan=false}={}) {
    _token = this;
    this.document.sort += 1;
    this.refresh();
    if ( pan ) canvas.addPendingOperation("Canvas.animatePan", canvas.animatePan, canvas, [{x: this.x, y: this.y}]);
    canvas.perception.update({
      initializeVision: true,
      forceUpdateFog: true,
      refreshLighting: true,
      refreshSounds: true,
      refreshTiles: true
    }, true);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onRelease(options) {
    super._onRelease(options);
    this.document.sort -= 1;
    canvas.perception.update({
      initializeVision: true,
      refreshLighting: true,
      refreshSounds: true,
      refreshTiles: true
    }, true);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  _canControl(user, event) {
    if ( canvas.controls.ruler.active ) return false;
    const tool = game.activeTool;
    if ( tool === "target" ) return true;
    return game.user.isGM || (this.actor?.testUserPermission(user, "OWNER") ?? false);
  }

  /* -------------------------------------------- */

  /** @override */
  _canHUD(user, event) {
    if ( canvas.controls.ruler.active ) return false;
    return user.isGM || (this.actor?.testUserPermission(user, "OWNER") ?? false);
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user, event) {
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  _canHover(user, event) {
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  _canView(user, event) {
    if ( !this.actor ) ui.notifications.warn("TOKEN.WarningNoActor", {localize: true});
    return this.actor?.testUserPermission(user, "LIMITED");
  }

  /* -------------------------------------------- */

  /** @override */
  _canDrag(user, event) {
    if ( !this.controlled || this._animation ) return false;
    const tool = game.activeTool;
    if ( ( tool !== "select" ) || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL) ) return false;
    return game.user.isGM || !game.paused;
  }

  /* -------------------------------------------- */

  /** @override */
  _onHoverIn(event, options) {
    const combatant = this.combatant;
    if ( combatant ) ui.combat.hoverCombatant(combatant, true);
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @override */
  _onHoverOut(event) {
    const combatant = this.combatant;
    if ( combatant ) ui.combat.hoverCombatant(combatant, false);
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickLeft(event) {
    const tool = game.activeTool;
    const oe = event.data.originalEvent;
    let isRuler = (tool === "ruler") || ( oe.ctrlKey || oe.metaKey );
    if ( isRuler ) canvas.mouseInteractionManager._handleClickLeft(event);
    if ( tool === "target" ) return this.setTarget(!this.isTargeted, {releaseOthers: !oe.shiftKey});
    super._onClickLeft(event);
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickLeft2(event) {
    const sheet = this.actor.sheet;
    if ( sheet.rendered ) {
      sheet.maximize();
      sheet.bringToTop();
    }
    else sheet.render(true, {token: this.document});
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight2(event) {
    if ( this.isOwner ) {
      if ( game.user.can("TOKEN_CONFIGURE") ) return super._onClickRight2(event);
    }
    else return this.setTarget(!this.targeted.has(game.user), {releaseOthers: !event.data.originalEvent.shiftKey});
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftDrop(event) {
    const clones = event.data.clones || [];
    const {originalEvent, destination} = event.data;

    // Ensure the cursor destination is within bounds
    if ( !canvas.dimensions.rect.contains(destination.x, destination.y) ) return false;

    // Compute the final dropped positions
    const updates = clones.reduce((updates, c) => {

      // Get the snapped top-left coordinate
      let dest = {x: c.document.x, y: c.document.y};
      if ( !originalEvent.shiftKey && (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS) ) {
        const isTiny = (c.document.width < 1) && (c.document.height < 1);
        const interval = canvas.grid.isHex ? 1 : isTiny ? 2 : 1;
        dest = canvas.grid.getSnappedPosition(dest.x, dest.y, interval, {token: c});
      }

      // Test collision for each moved token vs the central point of its destination space
      const target = c.getCenter(dest.x, dest.y);
      if ( !game.user.isGM ) {
        let collides = c._original.checkCollision(target);
        if ( collides ) {
          ui.notifications.error("ERROR.TokenCollide", {localize: true, console: false});
          return updates;
        }
      }

      // Otherwise, ensure the final token center is in-bounds
      else if ( !canvas.dimensions.rect.contains(target.x, target.y) ) return updates;

      // Perform updates where no collision occurs
      updates.push({_id: c._original.id, x: dest.x, y: dest.y});
      return updates;
    }, []);

    // Submit the data update
    return canvas.scene.updateEmbeddedDocuments("Token", updates);
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    const {clones, destination, origin, originalEvent} = event.data;
    const preview = game.settings.get("core", "tokenDragPreview");

    // Pan the canvas if the drag event approaches the edge
    canvas._onDragCanvasPan(originalEvent);

    // Determine dragged distance
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;

    // Update the position of each clone
    for ( let c of clones || [] ) {
      const o = c._original;
      const x = o.document.x + dx;
      const y = o.document.y + dy;
      if ( preview && !game.user.isGM ) {
        const collision = o.checkCollision(o.getCenter(x, y));
        if ( collision ) continue;
      }
      c.document.x = x;
      c.document.y = y;
      c.refresh();
      if ( preview ) c.updateSource({defer: true});
    }

    // Update perception immediately
    if ( preview ) canvas.perception.update({refreshLighting: true, refreshVision: true}, true);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    this._preview?.updateSource({deleted: true});
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragStart() {
    super._onDragStart();
    const o = this._original;
    o.mesh.alpha = o.alpha;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _onDragEnd() {
    super._onDragEnd();
    this._original.mesh.refresh();
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get hasLimitedVisionAngle() {
    const msg = "Token#hasLimitedVisionAngle has been renamed to Token#hasLimitedSourceAngle";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.hasLimitedSourceAngle;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  getSightOrigin() {
    const msg = "Token#getSightOrigin has been deprecated in favor of Token#getMovementAdjustedPoint";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.getMovementAdjustedPoint(this.center);
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get icon() {
    foundry.utils.logCompatibilityWarning("Token#icon has been renamed to Token#mesh.", {since: 10, until: 12});
    return this.mesh;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  async setPosition(x, y, {animate=true, movementSpeed, recenter=true}={}) {
    throw new Error("The Token#setPosition method is deprecated in favor of a standard TokenDocument#update");
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  async animateMovement(ray, {movementSpeed=6}={}) {
    throw new Error("The Token#animateMovement method is deprecated in favor Token#animate");
  }
}

/**
 * A "secret" global to help debug attributes of the currently controlled Token.
 * This is only for debugging, and may be removed in the future, so it's not safe to use.
 * @type {Token}
 * @ignore
 */
let _token = null;
