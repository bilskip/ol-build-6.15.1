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
 * @module ol/source/OGCMapTile
 */
import TileImage from './TileImage.js';
import { getTileSetInfo } from './ogcTileUtil.js';
/**
 * @typedef {Object} Options
 * @property {string} url URL to the OGC Map Tileset endpoint.
 * @property {Object} [context] A lookup of values to use in the tile URL template.  The `{tileMatrix}`
 * (zoom level), `{tileRow}`, and `{tileCol}` variables in the URL will always be provided by the source.
 * @property {string} [mediaType] The content type for the tiles (e.g. "image/png").  If not provided,
 * the source will try to find a link with rel="item" that uses a supported image type.
 * @property {import("../proj.js").ProjectionLike} [projection] Projection. By default, the projection
 * will be derived from the `crs` of the `tileMatrixSet`.  You can override this by supplying
 * a projection to the constructor.
 * @property {import("./Source.js").AttributionLike} [attributions] Attributions.
 * @property {number} [cacheSize] Tile cache size. The default depends on the screen size. Will be ignored if too small.
 * @property {null|string} [crossOrigin] The `crossOrigin` attribute for loaded images.  Note that
 * you must provide a `crossOrigin` value if you want to access pixel data with the Canvas renderer.
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image for more detail.
 * @property {boolean} [imageSmoothing=true] Deprecated.  Use the `interpolate` option instead.
 * @property {boolean} [interpolate=true] Use interpolated values when resampling.  By default,
 * linear interpolation is used when resampling.  Set to false to use the nearest neighbor instead.
 * @property {number} [reprojectionErrorThreshold=0.5] Maximum allowed reprojection error (in pixels).
 * Higher values can increase reprojection performance, but decrease precision.
 * @property {import("../Tile.js").LoadFunction} [tileLoadFunction] Optional function to load a tile given a URL. The default is
 * ```js
 * function(tile, src) {
 *   tile.getImage().src = src;
 * };
 * ```
 * @property {boolean} [wrapX=true] Whether to wrap the world horizontally.
 * @property {number} [transition] Duration of the opacity transition for rendering.
 * To disable the opacity transition, pass `transition: 0`.
 */
/**
 * @classdesc
 * Layer source for map tiles from an [OGC API - Tiles](https://ogcapi.ogc.org/tiles/) service that provides "map" type tiles.
 * The service must conform to at least the core (http://www.opengis.net/spec/ogcapi-tiles-1/1.0/conf/core)
 * and tileset (http://www.opengis.net/spec/ogcapi-tiles-1/1.0/conf/tileset) conformance classes.
 */
var OGCMapTile = /** @class */ (function (_super) {
    __extends(OGCMapTile, _super);
    /**
     * @param {Options} options OGC map tile options.
     */
    function OGCMapTile(options) {
        var _this = this;
        var interpolate = options.imageSmoothing !== undefined ? options.imageSmoothing : true;
        if (options.interpolate !== undefined) {
            interpolate = options.interpolate;
        }
        _this = _super.call(this, {
            attributions: options.attributions,
            cacheSize: options.cacheSize,
            crossOrigin: options.crossOrigin,
            interpolate: interpolate,
            projection: options.projection,
            reprojectionErrorThreshold: options.reprojectionErrorThreshold,
            state: 'loading',
            tileLoadFunction: options.tileLoadFunction,
            wrapX: options.wrapX !== undefined ? options.wrapX : true,
            transition: options.transition,
        }) || this;
        var sourceInfo = {
            url: options.url,
            projection: _this.getProjection(),
            mediaType: options.mediaType,
            context: options.context || null,
        };
        getTileSetInfo(sourceInfo)
            .then(_this.handleTileSetInfo_.bind(_this))
            .catch(_this.handleError_.bind(_this));
        return _this;
    }
    /**
     * @param {import("./ogcTileUtil.js").TileSetInfo} tileSetInfo Tile set info.
     * @private
     */
    OGCMapTile.prototype.handleTileSetInfo_ = function (tileSetInfo) {
        this.tileGrid = tileSetInfo.grid;
        this.setTileUrlFunction(tileSetInfo.urlFunction, tileSetInfo.urlTemplate);
        this.setState('ready');
    };
    /**
     * @private
     * @param {Error} error The error.
     */
    OGCMapTile.prototype.handleError_ = function (error) {
        console.error(error); // eslint-disable-line no-console
        this.setState('error');
    };
    return OGCMapTile;
}(TileImage));
export default OGCMapTile;
//# sourceMappingURL=OGCMapTile.js.map