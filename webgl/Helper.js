var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
/**
 * @module ol/webgl/Helper
 */
import ContextEventType from '../webgl/ContextEventType.js';
import Disposable from '../Disposable.js';
import WebGLPostProcessingPass from './PostProcessingPass.js';
import { FLOAT, UNSIGNED_BYTE, UNSIGNED_INT, UNSIGNED_SHORT, getContext, } from '../webgl.js';
import { clear } from '../obj.js';
import { compose as composeTransform, create as createTransform, reset as resetTransform, rotate as rotateTransform, scale as scaleTransform, } from '../transform.js';
import { create, fromTransform } from '../vec/mat4.js';
import { getUid } from '../util.js';
/**
 * @typedef {Object} BufferCacheEntry
 * @property {import("./Buffer.js").default} buffer Buffer.
 * @property {WebGLBuffer} webGlBuffer WebGlBuffer.
 */
/**
 * Shader types, either `FRAGMENT_SHADER` or `VERTEX_SHADER`.
 * @enum {number}
 */
export var ShaderType = {
    FRAGMENT_SHADER: 0x8b30,
    VERTEX_SHADER: 0x8b31,
};
/**
 * Uniform names used in the default shaders: `PROJECTION_MATRIX`, `OFFSET_SCALE_MATRIX`.
 * and `OFFSET_ROTATION_MATRIX`.
 * @enum {string}
 */
export var DefaultUniform = {
    PROJECTION_MATRIX: 'u_projectionMatrix',
    OFFSET_SCALE_MATRIX: 'u_offsetScaleMatrix',
    OFFSET_ROTATION_MATRIX: 'u_offsetRotateMatrix',
    TIME: 'u_time',
    ZOOM: 'u_zoom',
    RESOLUTION: 'u_resolution',
};
/**
 * Attribute types, either `UNSIGNED_BYTE`, `UNSIGNED_SHORT`, `UNSIGNED_INT` or `FLOAT`
 * Note: an attribute stored in a `Float32Array` should be of type `FLOAT`.
 * @enum {number}
 */
export var AttributeType = {
    UNSIGNED_BYTE: UNSIGNED_BYTE,
    UNSIGNED_SHORT: UNSIGNED_SHORT,
    UNSIGNED_INT: UNSIGNED_INT,
    FLOAT: FLOAT,
};
/**
 * Description of an attribute in a buffer
 * @typedef {Object} AttributeDescription
 * @property {string} name Attribute name to use in shaders
 * @property {number} size Number of components per attributes
 * @property {AttributeType} [type] Attribute type, i.e. number of bytes used to store the value. This is
 * determined by the class of typed array which the buffer uses (eg. `Float32Array` for a `FLOAT` attribute).
 * Default is `FLOAT`.
 */
/**
 * @typedef {number|Array<number>|HTMLCanvasElement|HTMLImageElement|ImageData|import("../transform").Transform} UniformLiteralValue
 */
/**
 * Uniform value can be a number, array of numbers (2 to 4), canvas element or a callback returning
 * one of the previous types.
 * @typedef {UniformLiteralValue|function(import("../PluggableMap.js").FrameState):UniformLiteralValue} UniformValue
 */
/**
 * @typedef {Object} PostProcessesOptions
 * @property {number} [scaleRatio] Scale ratio; if < 1, the post process will render to a texture smaller than
 * the main canvas which will then be sampled up (useful for saving resource on blur steps).
 * @property {string} [vertexShader] Vertex shader source
 * @property {string} [fragmentShader] Fragment shader source
 * @property {Object<string,UniformValue>} [uniforms] Uniform definitions for the post process step
 */
/**
 * @typedef {Object} Options
 * @property {Object<string,UniformValue>} [uniforms] Uniform definitions; property names must match the uniform
 * names in the provided or default shaders.
 * @property {Array<PostProcessesOptions>} [postProcesses] Post-processes definitions
 * @property {string} [canvasCacheKey] The cache key for the canvas.
 */
/**
 * @typedef {Object} UniformInternalDescription
 * @property {string} name Name
 * @property {UniformValue} [value] Value
 * @property {WebGLTexture} [texture] Texture
 * @private
 */
/**
 * @typedef {Object} CanvasCacheItem
 * @property {HTMLCanvasElement} canvas Canvas element.
 * @property {number} users The count of users of this canvas.
 */
/**
 * @type {Object<string,CanvasCacheItem>}
 */
var canvasCache = {};
/**
 * @param {string} key The cache key for the canvas.
 * @return {string} The shared cache key.
 */
function getSharedCanvasCacheKey(key) {
    return 'shared/' + key;
}
var uniqueCanvasCacheKeyCount = 0;
/**
 * @return {string} The unique cache key.
 */
function getUniqueCanvasCacheKey() {
    var key = 'unique/' + uniqueCanvasCacheKeyCount;
    uniqueCanvasCacheKeyCount += 1;
    return key;
}
/**
 * @param {string} key The cache key for the canvas.
 * @return {HTMLCanvasElement} The canvas.
 */
function getCanvas(key) {
    var cacheItem = canvasCache[key];
    if (!cacheItem) {
        var canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.left = '0';
        cacheItem = { users: 0, canvas: canvas };
        canvasCache[key] = cacheItem;
    }
    cacheItem.users += 1;
    return cacheItem.canvas;
}
/**
 * @param {string} key The cache key for the canvas.
 */
function releaseCanvas(key) {
    var cacheItem = canvasCache[key];
    if (!cacheItem) {
        return;
    }
    cacheItem.users -= 1;
    if (cacheItem.users > 0) {
        return;
    }
    var canvas = cacheItem.canvas;
    var gl = getContext(canvas);
    var extension = gl.getExtension('WEBGL_lose_context');
    if (extension) {
        extension.loseContext();
    }
    delete canvasCache[key];
}
/**
 * @classdesc
 * This class is intended to provide low-level functions related to WebGL rendering, so that accessing
 * directly the WebGL API should not be required anymore.
 *
 * Several operations are handled by the `WebGLHelper` class:
 *
 * ### Define custom shaders and uniforms
 *
 *   *Shaders* are low-level programs executed on the GPU and written in GLSL. There are two types of shaders:
 *
 *   Vertex shaders are used to manipulate the position and attribute of *vertices* of rendered primitives (ie. corners of a square).
 *   Outputs are:
 *
 *   * `gl_Position`: position of the vertex in screen space
 *
 *   * Varyings usually prefixed with `v_` are passed on to the fragment shader
 *
 *   Fragment shaders are used to control the actual color of the pixels drawn on screen. Their only output is `gl_FragColor`.
 *
 *   Both shaders can take *uniforms* or *attributes* as input. Attributes are explained later. Uniforms are common, read-only values that
 *   can be changed at every frame and can be of type float, arrays of float or images.
 *
 *   Shaders must be compiled and assembled into a program like so:
 *   ```js
 *   // here we simply create two shaders and assemble them in a program which is then used
 *   // for subsequent rendering calls
 *   const vertexShader = new WebGLVertex(VERTEX_SHADER);
 *   const fragmentShader = new WebGLFragment(FRAGMENT_SHADER);
 *   const program = this.context.getProgram(fragmentShader, vertexShader);
 *   helper.useProgram(this.program);
 *   ```
 *
 *   Uniforms are defined using the `uniforms` option and can either be explicit values or callbacks taking the frame state as argument.
 *   You can also change their value along the way like so:
 *   ```js
 *   helper.setUniformFloatValue('u_value', valueAsNumber);
 *   ```
 *
 * ### Defining post processing passes
 *
 *   *Post processing* describes the act of rendering primitives to a texture, and then rendering this texture to the final canvas
 *   while applying special effects in screen space.
 *   Typical uses are: blurring, color manipulation, depth of field, filtering...
 *
 *   The `WebGLHelper` class offers the possibility to define post processes at creation time using the `postProcesses` option.
 *   A post process step accepts the following options:
 *
 *   * `fragmentShader` and `vertexShader`: text literals in GLSL language that will be compiled and used in the post processing step.
 *   * `uniforms`: uniforms can be defined for the post processing steps just like for the main render.
 *   * `scaleRatio`: allows using an intermediate texture smaller or higher than the final canvas in the post processing step.
 *     This is typically used in blur steps to reduce the performance overhead by using an already downsampled texture as input.
 *
 *   The {@link module:ol/webgl/PostProcessingPass~WebGLPostProcessingPass} class is used internally, refer to its documentation for more info.
 *
 * ### Binding WebGL buffers and flushing data into them
 *
 *   Data that must be passed to the GPU has to be transferred using {@link module:ol/webgl/Buffer~WebGLArrayBuffer} objects.
 *   A buffer has to be created only once, but must be bound every time the buffer content will be used for rendering.
 *   This is done using {@link bindBuffer}.
 *   When the buffer's array content has changed, the new data has to be flushed to the GPU memory; this is done using
 *   {@link flushBufferData}. Note: this operation is expensive and should be done as infrequently as possible.
 *
 *   When binding an array buffer, a `target` parameter must be given: it should be either {@link module:ol/webgl.ARRAY_BUFFER}
 *   (if the buffer contains vertices data) or {@link module:ol/webgl.ELEMENT_ARRAY_BUFFER} (if the buffer contains indices data).
 *
 *   Examples below:
 *   ```js
 *   // at initialization phase
 *   const verticesBuffer = new WebGLArrayBuffer([], DYNAMIC_DRAW);
 *   const indicesBuffer = new WebGLArrayBuffer([], DYNAMIC_DRAW);
 *
 *   // when array values have changed
 *   helper.flushBufferData(ARRAY_BUFFER, this.verticesBuffer);
 *   helper.flushBufferData(ELEMENT_ARRAY_BUFFER, this.indicesBuffer);
 *
 *   // at rendering phase
 *   helper.bindBuffer(ARRAY_BUFFER, this.verticesBuffer);
 *   helper.bindBuffer(ELEMENT_ARRAY_BUFFER, this.indicesBuffer);
 *   ```
 *
 * ### Specifying attributes
 *
 *   The GPU only receives the data as arrays of numbers. These numbers must be handled differently depending on what it describes (position, texture coordinate...).
 *   Attributes are used to specify these uses. Specify the attribute names with
 *   {@link module:ol/webgl/Helper~WebGLHelper#enableAttributes enableAttributes()} (see code snippet below).
 *
 *   Please note that you will have to specify the type and offset of the attributes in the data array. You can refer to the documentation of [WebGLRenderingContext.vertexAttribPointer](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer) for more explanation.
 *   ```js
 *   // here we indicate that the data array has the following structure:
 *   // [posX, posY, offsetX, offsetY, texCoordU, texCoordV, posX, posY, ...]
 *   helper.enableAttributes([
 *     {
 *        name: 'a_position',
 *        size: 2
 *     },
 *     {
 *       name: 'a_offset',
 *       size: 2
 *     },
 *     {
 *       name: 'a_texCoord',
 *       size: 2
 *     }
 *   ])
 *   ```
 *
 * ### Rendering primitives
 *
 *   Once all the steps above have been achieved, rendering primitives to the screen is done using {@link prepareDraw}, {@link drawElements} and {@link finalizeDraw}.
 *   ```js
 *   // frame preparation step
 *   helper.prepareDraw(frameState);
 *
 *   // call this for every data array that has to be rendered on screen
 *   helper.drawElements(0, this.indicesBuffer.getArray().length);
 *
 *   // finalize the rendering by applying post processes
 *   helper.finalizeDraw(frameState);
 *   ```
 *
 * For an example usage of this class, refer to {@link module:ol/renderer/webgl/PointsLayer~WebGLPointsLayerRenderer}.
 *
 * @api
 */
var WebGLHelper = /** @class */ (function (_super) {
    __extends(WebGLHelper, _super);
    /**
     * @param {Options} [opt_options] Options.
     */
    function WebGLHelper(opt_options) {
        var _this = _super.call(this) || this;
        var options = opt_options || {};
        /** @private */
        _this.boundHandleWebGLContextLost_ = _this.handleWebGLContextLost.bind(_this);
        /** @private */
        _this.boundHandleWebGLContextRestored_ =
            _this.handleWebGLContextRestored.bind(_this);
        /**
         * @private
         * @type {string}
         */
        _this.canvasCacheKey_ = options.canvasCacheKey
            ? getSharedCanvasCacheKey(options.canvasCacheKey)
            : getUniqueCanvasCacheKey();
        /**
         * @private
         * @type {HTMLCanvasElement}
         */
        _this.canvas_ = getCanvas(_this.canvasCacheKey_);
        /**
         * @private
         * @type {WebGLRenderingContext}
         */
        _this.gl_ = getContext(_this.canvas_);
        /**
         * @private
         * @type {!Object<string, BufferCacheEntry>}
         */
        _this.bufferCache_ = {};
        /**
         * @private
         * @type {Object<string, Object>}
         */
        _this.extensionCache_ = {};
        /**
         * @private
         * @type {WebGLProgram}
         */
        _this.currentProgram_ = null;
        _this.canvas_.addEventListener(ContextEventType.LOST, _this.boundHandleWebGLContextLost_);
        _this.canvas_.addEventListener(ContextEventType.RESTORED, _this.boundHandleWebGLContextRestored_);
        /**
         * @private
         * @type {import("../transform.js").Transform}
         */
        _this.offsetRotateMatrix_ = createTransform();
        /**
         * @private
         * @type {import("../transform.js").Transform}
         */
        _this.offsetScaleMatrix_ = createTransform();
        /**
         * @private
         * @type {Array<number>}
         */
        _this.tmpMat4_ = create();
        /**
         * @private
         * @type {Object<string, WebGLUniformLocation>}
         */
        _this.uniformLocations_ = {};
        /**
         * @private
         * @type {Object<string, number>}
         */
        _this.attribLocations_ = {};
        /**
         * Holds info about custom uniforms used in the post processing pass.
         * If the uniform is a texture, the WebGL Texture object will be stored here.
         * @type {Array<UniformInternalDescription>}
         * @private
         */
        _this.uniforms_ = [];
        if (options.uniforms) {
            _this.setUniforms(options.uniforms);
        }
        var gl = _this.getGL();
        /**
         * An array of PostProcessingPass objects is kept in this variable, built from the steps provided in the
         * options. If no post process was given, a default one is used (so as not to have to make an exception to
         * the frame buffer logic).
         * @type {Array<WebGLPostProcessingPass>}
         * @private
         */
        _this.postProcessPasses_ = options.postProcesses
            ? options.postProcesses.map(function (options) {
                return new WebGLPostProcessingPass({
                    webGlContext: gl,
                    scaleRatio: options.scaleRatio,
                    vertexShader: options.vertexShader,
                    fragmentShader: options.fragmentShader,
                    uniforms: options.uniforms,
                });
            })
            : [new WebGLPostProcessingPass({ webGlContext: gl })];
        /**
         * @type {string|null}
         * @private
         */
        _this.shaderCompileErrors_ = null;
        /**
         * @type {number}
         * @private
         */
        _this.startTime_ = Date.now();
        return _this;
    }
    /**
     * @param {Object<string, UniformValue>} uniforms Uniform definitions.
     */
    WebGLHelper.prototype.setUniforms = function (uniforms) {
        this.uniforms_ = [];
        for (var name_1 in uniforms) {
            this.uniforms_.push({
                name: name_1,
                value: uniforms[name_1],
            });
        }
        this.uniformLocations_ = {};
    };
    /**
     * @param {string} canvasCacheKey The canvas cache key.
     * @return {boolean} The provided key matches the one this helper was constructed with.
     */
    WebGLHelper.prototype.canvasCacheKeyMatches = function (canvasCacheKey) {
        return this.canvasCacheKey_ === getSharedCanvasCacheKey(canvasCacheKey);
    };
    /**
     * Get a WebGL extension.  If the extension is not supported, null is returned.
     * Extensions are cached after they are enabled for the first time.
     * @param {string} name The extension name.
     * @return {Object|null} The extension or null if not supported.
     */
    WebGLHelper.prototype.getExtension = function (name) {
        if (name in this.extensionCache_) {
            return this.extensionCache_[name];
        }
        var extension = this.gl_.getExtension(name);
        this.extensionCache_[name] = extension;
        return extension;
    };
    /**
     * Just bind the buffer if it's in the cache. Otherwise create
     * the WebGL buffer, bind it, populate it, and add an entry to
     * the cache.
     * @param {import("./Buffer").default} buffer Buffer.
     * @api
     */
    WebGLHelper.prototype.bindBuffer = function (buffer) {
        var gl = this.getGL();
        var bufferKey = getUid(buffer);
        var bufferCache = this.bufferCache_[bufferKey];
        if (!bufferCache) {
            var webGlBuffer = gl.createBuffer();
            bufferCache = {
                buffer: buffer,
                webGlBuffer: webGlBuffer,
            };
            this.bufferCache_[bufferKey] = bufferCache;
        }
        gl.bindBuffer(buffer.getType(), bufferCache.webGlBuffer);
    };
    /**
     * Update the data contained in the buffer array; this is required for the
     * new data to be rendered
     * @param {import("./Buffer").default} buffer Buffer.
     * @api
     */
    WebGLHelper.prototype.flushBufferData = function (buffer) {
        var gl = this.getGL();
        this.bindBuffer(buffer);
        gl.bufferData(buffer.getType(), buffer.getArray(), buffer.getUsage());
    };
    /**
     * @param {import("./Buffer.js").default} buf Buffer.
     */
    WebGLHelper.prototype.deleteBuffer = function (buf) {
        var gl = this.getGL();
        var bufferKey = getUid(buf);
        var bufferCacheEntry = this.bufferCache_[bufferKey];
        if (bufferCacheEntry && !gl.isContextLost()) {
            gl.deleteBuffer(bufferCacheEntry.webGlBuffer);
        }
        delete this.bufferCache_[bufferKey];
    };
    /**
     * Clean up.
     */
    WebGLHelper.prototype.disposeInternal = function () {
        this.canvas_.removeEventListener(ContextEventType.LOST, this.boundHandleWebGLContextLost_);
        this.canvas_.removeEventListener(ContextEventType.RESTORED, this.boundHandleWebGLContextRestored_);
        releaseCanvas(this.canvasCacheKey_);
        delete this.gl_;
        delete this.canvas_;
    };
    /**
     * Clear the buffer & set the viewport to draw.
     * Post process passes will be initialized here, the first one being bound as a render target for
     * subsequent draw calls.
     * @param {import("../PluggableMap.js").FrameState} frameState current frame state
     * @param {boolean} [opt_disableAlphaBlend] If true, no alpha blending will happen.
     * @api
     */
    WebGLHelper.prototype.prepareDraw = function (frameState, opt_disableAlphaBlend) {
        var gl = this.getGL();
        var canvas = this.getCanvas();
        var size = frameState.size;
        var pixelRatio = frameState.pixelRatio;
        canvas.width = size[0] * pixelRatio;
        canvas.height = size[1] * pixelRatio;
        canvas.style.width = size[0] + 'px';
        canvas.style.height = size[1] + 'px';
        gl.useProgram(this.currentProgram_);
        // loop backwards in post processes list
        for (var i = this.postProcessPasses_.length - 1; i >= 0; i--) {
            this.postProcessPasses_[i].init(frameState);
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, opt_disableAlphaBlend ? gl.ZERO : gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.currentProgram_);
        this.applyFrameState(frameState);
        this.applyUniforms(frameState);
    };
    /**
     * Clear the render target & bind it for future draw operations.
     * This is similar to `prepareDraw`, only post processes will not be applied.
     * Note: the whole viewport will be drawn to the render target, regardless of its size.
     * @param {import("../PluggableMap.js").FrameState} frameState current frame state
     * @param {import("./RenderTarget.js").default} renderTarget Render target to draw to
     * @param {boolean} [opt_disableAlphaBlend] If true, no alpha blending will happen.
     */
    WebGLHelper.prototype.prepareDrawToRenderTarget = function (frameState, renderTarget, opt_disableAlphaBlend) {
        var gl = this.getGL();
        var size = renderTarget.getSize();
        gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.getFramebuffer());
        gl.viewport(0, 0, size[0], size[1]);
        gl.bindTexture(gl.TEXTURE_2D, renderTarget.getTexture());
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, opt_disableAlphaBlend ? gl.ZERO : gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.currentProgram_);
        this.applyFrameState(frameState);
        this.applyUniforms(frameState);
    };
    /**
     * Execute a draw call based on the currently bound program, texture, buffers, attributes.
     * @param {number} start Start index.
     * @param {number} end End index.
     * @api
     */
    WebGLHelper.prototype.drawElements = function (start, end) {
        var gl = this.getGL();
        this.getExtension('OES_element_index_uint');
        var elementType = gl.UNSIGNED_INT;
        var elementSize = 4;
        var numItems = end - start;
        var offsetInBytes = start * elementSize;
        gl.drawElements(gl.TRIANGLES, numItems, elementType, offsetInBytes);
    };
    /**
     * Apply the successive post process passes which will eventually render to the actual canvas.
     * @param {import("../PluggableMap.js").FrameState} frameState current frame state
     * @param {function(WebGLRenderingContext, import("../PluggableMap.js").FrameState):void} [preCompose] Called before composing.
     * @param {function(WebGLRenderingContext, import("../PluggableMap.js").FrameState):void} [postCompose] Called before composing.
     */
    WebGLHelper.prototype.finalizeDraw = function (frameState, preCompose, postCompose) {
        // apply post processes using the next one as target
        for (var i = 0, ii = this.postProcessPasses_.length; i < ii; i++) {
            if (i === ii - 1) {
                this.postProcessPasses_[i].apply(frameState, null, preCompose, postCompose);
            }
            else {
                this.postProcessPasses_[i].apply(frameState, this.postProcessPasses_[i + 1]);
            }
        }
    };
    /**
     * @return {HTMLCanvasElement} Canvas.
     * @api
     */
    WebGLHelper.prototype.getCanvas = function () {
        return this.canvas_;
    };
    /**
     * Get the WebGL rendering context
     * @return {WebGLRenderingContext} The rendering context.
     * @api
     */
    WebGLHelper.prototype.getGL = function () {
        return this.gl_;
    };
    /**
     * Sets the default matrix uniforms for a given frame state. This is called internally in `prepareDraw`.
     * @param {import("../PluggableMap.js").FrameState} frameState Frame state.
     */
    WebGLHelper.prototype.applyFrameState = function (frameState) {
        var size = frameState.size;
        var rotation = frameState.viewState.rotation;
        var offsetScaleMatrix = resetTransform(this.offsetScaleMatrix_);
        scaleTransform(offsetScaleMatrix, 2 / size[0], 2 / size[1]);
        var offsetRotateMatrix = resetTransform(this.offsetRotateMatrix_);
        if (rotation !== 0) {
            rotateTransform(offsetRotateMatrix, -rotation);
        }
        this.setUniformMatrixValue(DefaultUniform.OFFSET_SCALE_MATRIX, fromTransform(this.tmpMat4_, offsetScaleMatrix));
        this.setUniformMatrixValue(DefaultUniform.OFFSET_ROTATION_MATRIX, fromTransform(this.tmpMat4_, offsetRotateMatrix));
        this.setUniformFloatValue(DefaultUniform.TIME, (Date.now() - this.startTime_) * 0.001);
        this.setUniformFloatValue(DefaultUniform.ZOOM, frameState.viewState.zoom);
        this.setUniformFloatValue(DefaultUniform.RESOLUTION, frameState.viewState.resolution);
    };
    /**
     * Sets the custom uniforms based on what was given in the constructor. This is called internally in `prepareDraw`.
     * @param {import("../PluggableMap.js").FrameState} frameState Frame state.
     */
    WebGLHelper.prototype.applyUniforms = function (frameState) {
        var gl = this.getGL();
        var value;
        var textureSlot = 0;
        this.uniforms_.forEach(function (uniform) {
            value =
                typeof uniform.value === 'function'
                    ? uniform.value(frameState)
                    : uniform.value;
            // apply value based on type
            if (value instanceof HTMLCanvasElement ||
                value instanceof HTMLImageElement ||
                value instanceof ImageData) {
                // create a texture & put data
                if (!uniform.texture) {
                    uniform.prevValue = undefined;
                    uniform.texture = gl.createTexture();
                }
                gl.activeTexture(gl["TEXTURE".concat(textureSlot)]);
                gl.bindTexture(gl.TEXTURE_2D, uniform.texture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                var imageReady = !(value instanceof HTMLImageElement) ||
                    /** @type {HTMLImageElement} */ (value).complete;
                if (imageReady && uniform.prevValue !== value) {
                    uniform.prevValue = value;
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, value);
                }
                // fill texture slots by increasing index
                gl.uniform1i(this.getUniformLocation(uniform.name), textureSlot++);
            }
            else if (Array.isArray(value) && value.length === 6) {
                this.setUniformMatrixValue(uniform.name, fromTransform(this.tmpMat4_, value));
            }
            else if (Array.isArray(value) && value.length <= 4) {
                switch (value.length) {
                    case 2:
                        gl.uniform2f(this.getUniformLocation(uniform.name), value[0], value[1]);
                        return;
                    case 3:
                        gl.uniform3f(this.getUniformLocation(uniform.name), value[0], value[1], value[2]);
                        return;
                    case 4:
                        gl.uniform4f(this.getUniformLocation(uniform.name), value[0], value[1], value[2], value[3]);
                        return;
                    default:
                        return;
                }
            }
            else if (typeof value === 'number') {
                gl.uniform1f(this.getUniformLocation(uniform.name), value);
            }
        }.bind(this));
    };
    /**
     * Use a program.  If the program is already in use, this will return `false`.
     * @param {WebGLProgram} program Program.
     * @return {boolean} Changed.
     * @api
     */
    WebGLHelper.prototype.useProgram = function (program) {
        if (program == this.currentProgram_) {
            return false;
        }
        else {
            var gl = this.getGL();
            gl.useProgram(program);
            this.currentProgram_ = program;
            this.uniformLocations_ = {};
            this.attribLocations_ = {};
            return true;
        }
    };
    /**
     * Will attempt to compile a vertex or fragment shader based on source
     * On error, the shader will be returned but
     * `gl.getShaderParameter(shader, gl.COMPILE_STATUS)` will return `true`
     * Use `gl.getShaderInfoLog(shader)` to have details
     * @param {string} source Shader source
     * @param {ShaderType} type VERTEX_SHADER or FRAGMENT_SHADER
     * @return {WebGLShader} Shader object
     */
    WebGLHelper.prototype.compileShader = function (source, type) {
        var gl = this.getGL();
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
    };
    /**
     * Create a program for a vertex and fragment shader.  Throws if shader compilation fails.
     * @param {string} fragmentShaderSource Fragment shader source.
     * @param {string} vertexShaderSource Vertex shader source.
     * @return {WebGLProgram} Program
     * @api
     */
    WebGLHelper.prototype.getProgram = function (fragmentShaderSource, vertexShaderSource) {
        var gl = this.getGL();
        var fragmentShader = this.compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
        var vertexShader = this.compileShader(vertexShaderSource, gl.VERTEX_SHADER);
        var program = gl.createProgram();
        gl.attachShader(program, fragmentShader);
        gl.attachShader(program, vertexShader);
        gl.linkProgram(program);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            var message = "Fragment shader compliation failed: ".concat(gl.getShaderInfoLog(fragmentShader));
            throw new Error(message);
        }
        gl.deleteShader(fragmentShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            var message = "Vertex shader compilation failed: ".concat(gl.getShaderInfoLog(vertexShader));
            throw new Error(message);
        }
        gl.deleteShader(vertexShader);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            var message = "GL program linking failed: ".concat(gl.getShaderInfoLog(vertexShader));
            throw new Error(message);
        }
        return program;
    };
    /**
     * Will get the location from the shader or the cache
     * @param {string} name Uniform name
     * @return {WebGLUniformLocation} uniformLocation
     * @api
     */
    WebGLHelper.prototype.getUniformLocation = function (name) {
        if (this.uniformLocations_[name] === undefined) {
            this.uniformLocations_[name] = this.getGL().getUniformLocation(this.currentProgram_, name);
        }
        return this.uniformLocations_[name];
    };
    /**
     * Will get the location from the shader or the cache
     * @param {string} name Attribute name
     * @return {number} attribLocation
     * @api
     */
    WebGLHelper.prototype.getAttributeLocation = function (name) {
        if (this.attribLocations_[name] === undefined) {
            this.attribLocations_[name] = this.getGL().getAttribLocation(this.currentProgram_, name);
        }
        return this.attribLocations_[name];
    };
    /**
     * Modifies the given transform to apply the rotation/translation/scaling of the given frame state.
     * The resulting transform can be used to convert world space coordinates to view coordinates.
     * @param {import("../PluggableMap.js").FrameState} frameState Frame state.
     * @param {import("../transform").Transform} transform Transform to update.
     * @return {import("../transform").Transform} The updated transform object.
     * @api
     */
    WebGLHelper.prototype.makeProjectionTransform = function (frameState, transform) {
        var size = frameState.size;
        var rotation = frameState.viewState.rotation;
        var resolution = frameState.viewState.resolution;
        var center = frameState.viewState.center;
        resetTransform(transform);
        composeTransform(transform, 0, 0, 2 / (resolution * size[0]), 2 / (resolution * size[1]), -rotation, -center[0], -center[1]);
        return transform;
    };
    /**
     * Give a value for a standard float uniform
     * @param {string} uniform Uniform name
     * @param {number} value Value
     * @api
     */
    WebGLHelper.prototype.setUniformFloatValue = function (uniform, value) {
        this.getGL().uniform1f(this.getUniformLocation(uniform), value);
    };
    /**
     * Give a value for a vec4 uniform
     * @param {string} uniform Uniform name
     * @param {Array<number>} value Array of length 4.
     */
    WebGLHelper.prototype.setUniformFloatVec4 = function (uniform, value) {
        this.getGL().uniform4fv(this.getUniformLocation(uniform), value);
    };
    /**
     * Give a value for a standard matrix4 uniform
     * @param {string} uniform Uniform name
     * @param {Array<number>} value Matrix value
     * @api
     */
    WebGLHelper.prototype.setUniformMatrixValue = function (uniform, value) {
        this.getGL().uniformMatrix4fv(this.getUniformLocation(uniform), false, value);
    };
    /**
     * Will set the currently bound buffer to an attribute of the shader program. Used by `#enableAttributes`
     * internally.
     * @param {string} attribName Attribute name
     * @param {number} size Number of components per attributes
     * @param {number} type UNSIGNED_INT, UNSIGNED_BYTE, UNSIGNED_SHORT or FLOAT
     * @param {number} stride Stride in bytes (0 means attribs are packed)
     * @param {number} offset Offset in bytes
     * @private
     */
    WebGLHelper.prototype.enableAttributeArray_ = function (attribName, size, type, stride, offset) {
        var location = this.getAttributeLocation(attribName);
        // the attribute has not been found in the shaders; do not enable it
        if (location < 0) {
            return;
        }
        this.getGL().enableVertexAttribArray(location);
        this.getGL().vertexAttribPointer(location, size, type, false, stride, offset);
    };
    /**
     * Will enable the following attributes to be read from the currently bound buffer,
     * i.e. tell the GPU where to read the different attributes in the buffer. An error in the
     * size/type/order of attributes will most likely break the rendering and throw a WebGL exception.
     * @param {Array<AttributeDescription>} attributes Ordered list of attributes to read from the buffer
     * @api
     */
    WebGLHelper.prototype.enableAttributes = function (attributes) {
        var stride = computeAttributesStride(attributes);
        var offset = 0;
        for (var i = 0; i < attributes.length; i++) {
            var attr = attributes[i];
            this.enableAttributeArray_(attr.name, attr.size, attr.type || FLOAT, stride, offset);
            offset += attr.size * getByteSizeFromType(attr.type);
        }
    };
    /**
     * WebGL context was lost
     * @private
     */
    WebGLHelper.prototype.handleWebGLContextLost = function () {
        clear(this.bufferCache_);
        this.currentProgram_ = null;
    };
    /**
     * WebGL context was restored
     * @private
     */
    WebGLHelper.prototype.handleWebGLContextRestored = function () { };
    /**
     * Will create or reuse a given webgl texture and apply the given size. If no image data
     * specified, the texture will be empty, otherwise image data will be used and the `size`
     * parameter will be ignored.
     * Note: wrap parameters are set to clamp to edge, min filter is set to linear.
     * @param {Array<number>} size Expected size of the texture
     * @param {ImageData|HTMLImageElement|HTMLCanvasElement} [opt_data] Image data/object to bind to the texture
     * @param {WebGLTexture} [opt_texture] Existing texture to reuse
     * @return {WebGLTexture} The generated texture
     * @api
     */
    WebGLHelper.prototype.createTexture = function (size, opt_data, opt_texture) {
        var gl = this.getGL();
        var texture = opt_texture || gl.createTexture();
        // set params & size
        var level = 0;
        var internalFormat = gl.RGBA;
        var border = 0;
        var format = gl.RGBA;
        var type = gl.UNSIGNED_BYTE;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (opt_data) {
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, format, type, opt_data);
        }
        else {
            gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, size[0], size[1], border, format, type, null);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    };
    return WebGLHelper;
}(Disposable));
/**
 * Compute a stride in bytes based on a list of attributes
 * @param {Array<AttributeDescription>} attributes Ordered list of attributes
 * @return {number} Stride, ie amount of values for each vertex in the vertex buffer
 * @api
 */
export function computeAttributesStride(attributes) {
    var stride = 0;
    for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        stride += attr.size * getByteSizeFromType(attr.type);
    }
    return stride;
}
/**
 * Computes the size in byte of an attribute type.
 * @param {AttributeType} type Attribute type
 * @return {number} The size in bytes
 */
function getByteSizeFromType(type) {
    switch (type) {
        case AttributeType.UNSIGNED_BYTE:
            return Uint8Array.BYTES_PER_ELEMENT;
        case AttributeType.UNSIGNED_SHORT:
            return Uint16Array.BYTES_PER_ELEMENT;
        case AttributeType.UNSIGNED_INT:
            return Uint32Array.BYTES_PER_ELEMENT;
        case AttributeType.FLOAT:
        default:
            return Float32Array.BYTES_PER_ELEMENT;
    }
}
export default WebGLHelper;
//# sourceMappingURL=Helper.js.map