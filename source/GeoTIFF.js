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
 * @module ol/source/GeoTIFF
 */
import DataTile from './DataTile.js';
import TileGrid from '../tilegrid/TileGrid.js';
import { Pool, fromBlob as tiffFromBlob, fromUrl as tiffFromUrl, fromUrls as tiffFromUrls, } from 'geotiff';
import { Projection, get as getCachedProjection, toUserCoordinate, toUserExtent, } from '../proj.js';
import { clamp } from '../math.js';
import { getCenter, getIntersection } from '../extent.js';
import { fromCode as unitsFromCode } from '../proj/Units.js';
/**
 * @typedef {Object} SourceInfo
 * @property {string} [url] URL for the source GeoTIFF.
 * @property {Array<string>} [overviews] List of any overview URLs, only applies if the url parameter is given.
 * @property {Blob} [blob] Blob containing the source GeoTIFF. `blob` and `url` are mutually exclusive.
 * @property {number} [min=0] The minimum source data value.  Rendered values are scaled from 0 to 1 based on
 * the configured min and max.  If not provided and raster statistics are available, those will be used instead.
 * If neither are available, the minimum for the data type will be used.  To disable this behavior, set
 * the `normalize` option to `false` in the constructor.
 * @property {number} [max] The maximum source data value.  Rendered values are scaled from 0 to 1 based on
 * the configured min and max.  If not provided and raster statistics are available, those will be used instead.
 * If neither are available, the maximum for the data type will be used.  To disable this behavior, set
 * the `normalize` option to `false` in the constructor.
 * @property {number} [nodata] Values to discard (overriding any nodata values in the metadata).
 * When provided, an additional alpha band will be added to the data.  Often the GeoTIFF metadata
 * will include information about nodata values, so you should only need to set this property if
 * you find that it is not already extracted from the metadata.
 * @property {Array<number>} [bands] Band numbers to be read from (where the first band is `1`). If not provided, all bands will
 * be read. For example, if a GeoTIFF has blue (1), green (2), red (3), and near-infrared (4) bands, and you only need the
 * near-infrared band, configure `bands: [4]`.
 */
/**
 * @typedef {Object} GeoKeys
 * @property {number} GTModelTypeGeoKey Model type.
 * @property {number} GTRasterTypeGeoKey Raster type.
 * @property {number} GeogAngularUnitsGeoKey Angular units.
 * @property {number} GeogInvFlatteningGeoKey Inverse flattening.
 * @property {number} GeogSemiMajorAxisGeoKey Semi-major axis.
 * @property {number} GeographicTypeGeoKey Geographic coordinate system code.
 * @property {number} ProjLinearUnitsGeoKey Projected linear unit code.
 * @property {number} ProjectedCSTypeGeoKey Projected coordinate system code.
 */
/**
 * @typedef {import("geotiff").GeoTIFF} GeoTIFF
 */
/**
 * @typedef {import("geotiff").MultiGeoTIFF} MultiGeoTIFF
 */
/**
 * @typedef {Object} GDALMetadata
 * @property {string} STATISTICS_MINIMUM The minimum value (as a string).
 * @property {string} STATISTICS_MAXIMUM The maximum value (as a string).
 */
var STATISTICS_MAXIMUM = 'STATISTICS_MAXIMUM';
var STATISTICS_MINIMUM = 'STATISTICS_MINIMUM';
/**
 * @typedef {import("geotiff").GeoTIFFImage} GeoTIFFImage
 */
var workerPool;
function getWorkerPool() {
    if (!workerPool) {
        workerPool = new Pool();
    }
    return workerPool;
}
/**
 * Get the bounding box of an image.  If the image does not have an affine transform,
 * the pixel bounds are returned.
 * @param {GeoTIFFImage} image The image.
 * @return {Array<number>} The image bounding box.
 */
function getBoundingBox(image) {
    try {
        return image.getBoundingBox();
    }
    catch (_) {
        var fileDirectory = image.fileDirectory;
        return [0, 0, fileDirectory.ImageWidth, fileDirectory.ImageLength];
    }
}
/**
 * Get the origin of an image.  If the image does not have an affine transform,
 * the top-left corner of the pixel bounds is returned.
 * @param {GeoTIFFImage} image The image.
 * @return {Array<number>} The image origin.
 */
function getOrigin(image) {
    try {
        return image.getOrigin().slice(0, 2);
    }
    catch (_) {
        return [0, image.fileDirectory.ImageLength];
    }
}
/**
 * Get the resolution of an image.  If the image does not have an affine transform,
 * the width of the image is compared with the reference image.
 * @param {GeoTIFFImage} image The image.
 * @param {GeoTIFFImage} referenceImage The reference image.
 * @return {Array<number>} The map x and y units per pixel.
 */
function getResolutions(image, referenceImage) {
    try {
        return image.getResolution(referenceImage);
    }
    catch (_) {
        return [
            referenceImage.fileDirectory.ImageWidth / image.fileDirectory.ImageWidth,
            referenceImage.fileDirectory.ImageHeight /
                image.fileDirectory.ImageHeight,
        ];
    }
}
/**
 * @param {GeoTIFFImage} image A GeoTIFF.
 * @return {import("../proj/Projection.js").default} The image projection.
 */
function getProjection(image) {
    var geoKeys = image.geoKeys;
    if (!geoKeys) {
        return null;
    }
    if (geoKeys.ProjectedCSTypeGeoKey) {
        var code = 'EPSG:' + geoKeys.ProjectedCSTypeGeoKey;
        var projection = getCachedProjection(code);
        if (!projection) {
            var units = unitsFromCode(geoKeys.ProjLinearUnitsGeoKey);
            if (units) {
                projection = new Projection({
                    code: code,
                    units: units,
                });
            }
        }
        return projection;
    }
    if (geoKeys.GeographicTypeGeoKey) {
        var code = 'EPSG:' + geoKeys.GeographicTypeGeoKey;
        var projection = getCachedProjection(code);
        if (!projection) {
            var units = unitsFromCode(geoKeys.GeogAngularUnitsGeoKey);
            if (units) {
                projection = new Projection({
                    code: code,
                    units: units,
                });
            }
        }
        return projection;
    }
    return null;
}
/**
 * @param {GeoTIFF|MultiGeoTIFF} tiff A GeoTIFF.
 * @return {Promise<Array<GeoTIFFImage>>} Resolves to a list of images.
 */
function getImagesForTIFF(tiff) {
    return tiff.getImageCount().then(function (count) {
        var requests = new Array(count);
        for (var i = 0; i < count; ++i) {
            requests[i] = tiff.getImage(i);
        }
        return Promise.all(requests);
    });
}
/**
 * @param {SourceInfo} source The GeoTIFF source.
 * @param {Object} options Options for the GeoTIFF source.
 * @return {Promise<Array<GeoTIFFImage>>} Resolves to a list of images.
 */
function getImagesForSource(source, options) {
    var request;
    if (source.blob) {
        request = tiffFromBlob(source.blob);
    }
    else if (source.overviews) {
        request = tiffFromUrls(source.url, source.overviews, options);
    }
    else {
        request = tiffFromUrl(source.url, options);
    }
    return request.then(getImagesForTIFF);
}
/**
 * @param {number|Array<number>|Array<Array<number>>} expected Expected value.
 * @param {number|Array<number>|Array<Array<number>>} got Actual value.
 * @param {number} tolerance Accepted tolerance in fraction of expected between expected and got.
 * @param {string} message The error message.
 * @param {function(Error):void} rejector A function to be called with any error.
 */
function assertEqual(expected, got, tolerance, message, rejector) {
    if (Array.isArray(expected)) {
        var length_1 = expected.length;
        if (!Array.isArray(got) || length_1 != got.length) {
            var error = new Error(message);
            rejector(error);
            throw error;
        }
        for (var i = 0; i < length_1; ++i) {
            assertEqual(expected[i], got[i], tolerance, message, rejector);
        }
        return;
    }
    got = /** @type {number} */ (got);
    if (Math.abs(expected - got) > tolerance * expected) {
        throw new Error(message);
    }
}
/**
 * @param {Array} array The data array.
 * @return {number} The minimum value.
 */
function getMinForDataType(array) {
    if (array instanceof Int8Array) {
        return -128;
    }
    if (array instanceof Int16Array) {
        return -32768;
    }
    if (array instanceof Int32Array) {
        return -2147483648;
    }
    if (array instanceof Float32Array) {
        return 1.2e-38;
    }
    return 0;
}
/**
 * @param {Array} array The data array.
 * @return {number} The maximum value.
 */
function getMaxForDataType(array) {
    if (array instanceof Int8Array) {
        return 127;
    }
    if (array instanceof Uint8Array) {
        return 255;
    }
    if (array instanceof Uint8ClampedArray) {
        return 255;
    }
    if (array instanceof Int16Array) {
        return 32767;
    }
    if (array instanceof Uint16Array) {
        return 65535;
    }
    if (array instanceof Int32Array) {
        return 2147483647;
    }
    if (array instanceof Uint32Array) {
        return 4294967295;
    }
    if (array instanceof Float32Array) {
        return 3.4e38;
    }
    return 255;
}
/**
 * @typedef {Object} GeoTIFFSourceOptions
 * @property {boolean} [forceXHR=false] Whether to force the usage of the browsers XMLHttpRequest API.
 * @property {Object<string, string>} [headers] additional key-value pairs of headers to be passed with each request. Key is the header name, value the header value.
 * @property {string} [credentials] How credentials shall be handled. See
 * https://developer.mozilla.org/en-US/docs/Web/API/fetch for reference and possible values
 * @property {number} [maxRanges] The maximum amount of ranges to request in a single multi-range request.
 * By default only a single range is used.
 * @property {boolean} [allowFullFile=false] Whether or not a full file is accepted when only a portion is
 * requested. Only use this when you know the source image to be small enough to fit in memory.
 * @property {number} [blockSize=65536] The block size to use.
 * @property {number} [cacheSize=100] The number of blocks that shall be held in a LRU cache.
 */
/**
 * @typedef {Object} Options
 * @property {Array<SourceInfo>} sources List of information about GeoTIFF sources.
 * Multiple sources can be combined when their resolution sets are equal after applying a scale.
 * The list of sources defines a mapping between input bands as they are read from each GeoTIFF and
 * the output bands that are provided by data tiles. To control which bands to read from each GeoTIFF,
 * use the {@link import("./GeoTIFF.js").SourceInfo bands} property. If, for example, you specify two
 * sources, one with 3 bands and {@link import("./GeoTIFF.js").SourceInfo nodata} configured, and
 * another with 1 band, the resulting data tiles will have 5 bands: 3 from the first source, 1 alpha
 * band from the first source, and 1 band from the second source.
 * @property {GeoTIFFSourceOptions} [sourceOptions] Additional options to be passed to [geotiff.js](https://geotiffjs.github.io/geotiff.js/module-geotiff.html)'s `fromUrl` or `fromUrls` methods.
 * @property {boolean} [convertToRGB = false] By default, bands from the sources are read as-is. When
 * reading GeoTIFFs with the purpose of displaying them as RGB images, setting this to `true` will
 * convert other color spaces (YCbCr, CMYK) to RGB.
 * @property {boolean} [normalize=true] By default, the source data is normalized to values between
 * 0 and 1 with scaling factors based on the raster statistics or `min` and `max` properties of each source.
 * If instead you want to work with the raw values in a style expression, set this to `false`.  Setting this option
 * to `false` will make it so any `min` and `max` properties on sources are ignored.
 * @property {boolean} [opaque=false] Whether the layer is opaque.
 * @property {number} [transition=250] Duration of the opacity transition for rendering.
 * To disable the opacity transition, pass `transition: 0`.
 * @property {boolean} [wrapX=false] Render tiles beyond the tile grid extent.
 * @property {boolean} [interpolate=true] Use interpolated values when resampling.  By default,
 * the linear interpolation is used to resample the data.  If false, nearest neighbor is used.
 */
/**
 * @classdesc
 * A source for working with GeoTIFF data.
 * @api
 */
var GeoTIFFSource = /** @class */ (function (_super) {
    __extends(GeoTIFFSource, _super);
    /**
     * @param {Options} options Data tile options.
     */
    function GeoTIFFSource(options) {
        var _this = _super.call(this, {
            state: 'loading',
            tileGrid: null,
            projection: null,
            opaque: options.opaque,
            transition: options.transition,
            interpolate: options.interpolate !== false,
            wrapX: options.wrapX,
        }) || this;
        /**
         * @type {Array<SourceInfo>}
         * @private
         */
        _this.sourceInfo_ = options.sources;
        var numSources = _this.sourceInfo_.length;
        /**
         * @type {Object}
         * @private
         */
        _this.sourceOptions_ = options.sourceOptions;
        /**
         * @type {Array<Array<GeoTIFFImage>>}
         * @private
         */
        _this.sourceImagery_ = new Array(numSources);
        /**
         * @type {Array<number>}
         * @private
         */
        _this.resolutionFactors_ = new Array(numSources);
        /**
         * @type {Array<number>}
         * @private
         */
        _this.samplesPerPixel_;
        /**
         * @type {Array<Array<number>>}
         * @private
         */
        _this.nodataValues_;
        /**
         * @type {Array<Array<GDALMetadata>>}
         * @private
         */
        _this.metadata_;
        /**
         * @type {boolean}
         * @private
         */
        _this.normalize_ = options.normalize !== false;
        /**
         * @type {boolean}
         * @private
         */
        _this.addAlpha_ = false;
        /**
         * @type {Error}
         * @private
         */
        _this.error_ = null;
        /**
         * @type {'readRasters' | 'readRGB'}
         */
        _this.readMethod_ = options.convertToRGB ? 'readRGB' : 'readRasters';
        _this.setKey(_this.sourceInfo_.map(function (source) { return source.url; }).join(','));
        var self = _this;
        var requests = new Array(numSources);
        for (var i = 0; i < numSources; ++i) {
            requests[i] = getImagesForSource(_this.sourceInfo_[i], _this.sourceOptions_);
        }
        Promise.all(requests)
            .then(function (sources) {
            self.configure_(sources);
        })
            .catch(function (error) {
            console.error(error); // eslint-disable-line no-console
            self.error_ = error;
            self.setState('error');
        });
        return _this;
    }
    /**
     * @return {Error} A source loading error. When the source state is `error`, use this function
     * to get more information about the error. To debug a faulty configuration, you may want to use
     * a listener like
     * ```js
     * geotiffSource.on('change', () => {
     *   if (geotiffSource.getState() === 'error') {
     *     console.error(geotiffSource.getError());
     *   }
     * });
     * ```
     */
    GeoTIFFSource.prototype.getError = function () {
        return this.error_;
    };
    /**
     * Configure the tile grid based on images within the source GeoTIFFs.  Each GeoTIFF
     * must have the same internal tiled structure.
     * @param {Array<Array<GeoTIFFImage>>} sources Each source is a list of images
     * from a single GeoTIFF.
     * @private
     */
    GeoTIFFSource.prototype.configure_ = function (sources) {
        var extent;
        var origin;
        var commonRenderTileSizes;
        var commonSourceTileSizes;
        var resolutions;
        var samplesPerPixel = new Array(sources.length);
        var nodataValues = new Array(sources.length);
        var metadata = new Array(sources.length);
        var minZoom = 0;
        var sourceCount = sources.length;
        var _loop_1 = function (sourceIndex) {
            var images = sources[sourceIndex];
            var imageCount = images.length;
            var sourceExtent = void 0;
            var sourceOrigin = void 0;
            var sourceTileSizes = new Array(imageCount);
            var renderTileSizes = new Array(imageCount);
            var sourceResolutions = new Array(imageCount);
            nodataValues[sourceIndex] = new Array(imageCount);
            metadata[sourceIndex] = new Array(imageCount);
            for (var imageIndex = 0; imageIndex < imageCount; ++imageIndex) {
                var image = images[imageIndex];
                var nodataValue = image.getGDALNoData();
                metadata[sourceIndex][imageIndex] = image.getGDALMetadata(0);
                nodataValues[sourceIndex][imageIndex] = nodataValue;
                var wantedSamples = this_1.sourceInfo_[sourceIndex].bands;
                samplesPerPixel[sourceIndex] = wantedSamples
                    ? wantedSamples.length
                    : image.getSamplesPerPixel();
                var level = imageCount - (imageIndex + 1);
                if (!sourceExtent) {
                    sourceExtent = getBoundingBox(image);
                }
                if (!sourceOrigin) {
                    sourceOrigin = getOrigin(image);
                }
                var imageResolutions = getResolutions(image, images[0]);
                sourceResolutions[level] = imageResolutions[0];
                var sourceTileSize = [image.getTileWidth(), image.getTileHeight()];
                sourceTileSizes[level] = sourceTileSize;
                var aspectRatio = imageResolutions[0] / Math.abs(imageResolutions[1]);
                renderTileSizes[level] = [
                    sourceTileSize[0],
                    sourceTileSize[1] / aspectRatio,
                ];
            }
            if (!extent) {
                extent = sourceExtent;
            }
            else {
                getIntersection(extent, sourceExtent, extent);
            }
            if (!origin) {
                origin = sourceOrigin;
            }
            else {
                var message = "Origin mismatch for source ".concat(sourceIndex, ", got [").concat(sourceOrigin, "] but expected [").concat(origin, "]");
                assertEqual(origin, sourceOrigin, 0, message, this_1.viewRejector);
            }
            if (!resolutions) {
                resolutions = sourceResolutions;
                this_1.resolutionFactors_[sourceIndex] = 1;
            }
            else {
                if (resolutions.length - minZoom > sourceResolutions.length) {
                    minZoom = resolutions.length - sourceResolutions.length;
                }
                var resolutionFactor_1 = resolutions[resolutions.length - 1] /
                    sourceResolutions[sourceResolutions.length - 1];
                this_1.resolutionFactors_[sourceIndex] = resolutionFactor_1;
                var scaledSourceResolutions = sourceResolutions.map(function (resolution) { return (resolution *= resolutionFactor_1); });
                var message = "Resolution mismatch for source ".concat(sourceIndex, ", got [").concat(scaledSourceResolutions, "] but expected [").concat(resolutions, "]");
                assertEqual(resolutions.slice(minZoom, resolutions.length), scaledSourceResolutions, 0.02, message, this_1.viewRejector);
            }
            if (!commonRenderTileSizes) {
                commonRenderTileSizes = renderTileSizes;
            }
            else {
                assertEqual(commonRenderTileSizes.slice(minZoom, commonRenderTileSizes.length), renderTileSizes, 0.01, "Tile size mismatch for source ".concat(sourceIndex), this_1.viewRejector);
            }
            if (!commonSourceTileSizes) {
                commonSourceTileSizes = sourceTileSizes;
            }
            else {
                assertEqual(commonSourceTileSizes.slice(minZoom, commonSourceTileSizes.length), sourceTileSizes, 0, "Tile size mismatch for source ".concat(sourceIndex), this_1.viewRejector);
            }
            this_1.sourceImagery_[sourceIndex] = images.reverse();
        };
        var this_1 = this;
        for (var sourceIndex = 0; sourceIndex < sourceCount; ++sourceIndex) {
            _loop_1(sourceIndex);
        }
        for (var i = 0, ii = this.sourceImagery_.length; i < ii; ++i) {
            var sourceImagery = this.sourceImagery_[i];
            while (sourceImagery.length < resolutions.length) {
                sourceImagery.unshift(undefined);
            }
        }
        if (!this.getProjection()) {
            var firstSource = sources[0];
            for (var i = firstSource.length - 1; i >= 0; --i) {
                var image = firstSource[i];
                var projection = getProjection(image);
                if (projection) {
                    this.projection = projection;
                    break;
                }
            }
        }
        this.samplesPerPixel_ = samplesPerPixel;
        this.nodataValues_ = nodataValues;
        this.metadata_ = metadata;
        // decide if we need to add an alpha band to handle nodata
        outer: for (var sourceIndex = 0; sourceIndex < sourceCount; ++sourceIndex) {
            // option 1: source is configured with a nodata value
            if (this.sourceInfo_[sourceIndex].nodata !== undefined) {
                this.addAlpha_ = true;
                break;
            }
            var values = nodataValues[sourceIndex];
            // option 2: check image metadata for limited bands
            var bands = this.sourceInfo_[sourceIndex].bands;
            if (bands) {
                for (var i = 0; i < bands.length; ++i) {
                    if (values[bands[i] - 1] !== null) {
                        this.addAlpha_ = true;
                        break outer;
                    }
                }
                continue;
            }
            // option 3: check image metadata for all bands
            for (var imageIndex = 0; imageIndex < values.length; ++imageIndex) {
                if (values[imageIndex] !== null) {
                    this.addAlpha_ = true;
                    break outer;
                }
            }
        }
        var additionalBands = this.addAlpha_ ? 1 : 0;
        this.bandCount =
            samplesPerPixel.reduce(function (accumulator, value) {
                accumulator += value;
                return accumulator;
            }, 0) + additionalBands;
        var tileGrid = new TileGrid({
            extent: extent,
            minZoom: minZoom,
            origin: origin,
            resolutions: resolutions,
            tileSizes: commonRenderTileSizes,
        });
        this.tileGrid = tileGrid;
        this.setTileSizes(commonSourceTileSizes);
        this.setLoader(this.loadTile_.bind(this));
        this.setState('ready');
        this.viewResolver({
            projection: this.projection,
            resolutions: resolutions,
            center: toUserCoordinate(getCenter(extent), this.projection),
            extent: toUserExtent(extent, this.projection),
            zoom: 0,
        });
    };
    GeoTIFFSource.prototype.loadTile_ = function (z, x, y) {
        var sourceTileSize = this.getTileSize(z);
        var sourceCount = this.sourceImagery_.length;
        var requests = new Array(sourceCount);
        var addAlpha = this.addAlpha_;
        var bandCount = this.bandCount;
        var samplesPerPixel = this.samplesPerPixel_;
        var nodataValues = this.nodataValues_;
        var sourceInfo = this.sourceInfo_;
        var _loop_2 = function (sourceIndex) {
            var source = sourceInfo[sourceIndex];
            var resolutionFactor = this_2.resolutionFactors_[sourceIndex];
            var pixelBounds = [
                Math.round(x * (sourceTileSize[0] * resolutionFactor)),
                Math.round(y * (sourceTileSize[1] * resolutionFactor)),
                Math.round((x + 1) * (sourceTileSize[0] * resolutionFactor)),
                Math.round((y + 1) * (sourceTileSize[1] * resolutionFactor)),
            ];
            var image = this_2.sourceImagery_[sourceIndex][z];
            var samples = void 0;
            if (source.bands) {
                samples = source.bands.map(function (bandNumber) {
                    return bandNumber - 1;
                });
            }
            /** @type {number|Array<number>} */
            var fillValue = void 0;
            if ('nodata' in source && source.nodata !== null) {
                fillValue = source.nodata;
            }
            else {
                if (!samples) {
                    fillValue = nodataValues[sourceIndex];
                }
                else {
                    fillValue = samples.map(function (sampleIndex) {
                        return nodataValues[sourceIndex][sampleIndex];
                    });
                }
            }
            requests[sourceIndex] = image[this_2.readMethod_]({
                window: pixelBounds,
                width: sourceTileSize[0],
                height: sourceTileSize[1],
                samples: samples,
                fillValue: fillValue,
                pool: getWorkerPool(),
                interleave: false,
            });
        };
        var this_2 = this;
        for (var sourceIndex = 0; sourceIndex < sourceCount; ++sourceIndex) {
            _loop_2(sourceIndex);
        }
        var pixelCount = sourceTileSize[0] * sourceTileSize[1];
        var dataLength = pixelCount * bandCount;
        var normalize = this.normalize_;
        var metadata = this.metadata_;
        return Promise.all(requests)
            .then(function (sourceSamples) {
            /** @type {Uint8Array|Float32Array} */
            var data;
            if (normalize) {
                data = new Uint8Array(dataLength);
            }
            else {
                data = new Float32Array(dataLength);
            }
            var dataIndex = 0;
            for (var pixelIndex = 0; pixelIndex < pixelCount; ++pixelIndex) {
                var transparent = addAlpha;
                for (var sourceIndex = 0; sourceIndex < sourceCount; ++sourceIndex) {
                    var source = sourceInfo[sourceIndex];
                    var min = source.min;
                    var max = source.max;
                    var gain = void 0, bias = void 0;
                    if (normalize) {
                        var stats = metadata[sourceIndex][0];
                        if (min === undefined) {
                            if (stats && STATISTICS_MINIMUM in stats) {
                                min = parseFloat(stats[STATISTICS_MINIMUM]);
                            }
                            else {
                                min = getMinForDataType(sourceSamples[sourceIndex][0]);
                            }
                        }
                        if (max === undefined) {
                            if (stats && STATISTICS_MAXIMUM in stats) {
                                max = parseFloat(stats[STATISTICS_MAXIMUM]);
                            }
                            else {
                                max = getMaxForDataType(sourceSamples[sourceIndex][0]);
                            }
                        }
                        gain = 255 / (max - min);
                        bias = -min * gain;
                    }
                    for (var sampleIndex = 0; sampleIndex < samplesPerPixel[sourceIndex]; ++sampleIndex) {
                        var sourceValue = sourceSamples[sourceIndex][sampleIndex][pixelIndex];
                        var value = void 0;
                        if (normalize) {
                            value = clamp(gain * sourceValue + bias, 0, 255);
                        }
                        else {
                            value = sourceValue;
                        }
                        if (!addAlpha) {
                            data[dataIndex] = value;
                        }
                        else {
                            var nodata = source.nodata;
                            if (nodata === undefined) {
                                var bandIndex = void 0;
                                if (source.bands) {
                                    bandIndex = source.bands[sampleIndex] - 1;
                                }
                                else {
                                    bandIndex = sampleIndex;
                                }
                                nodata = nodataValues[sourceIndex][bandIndex];
                            }
                            var nodataIsNaN = isNaN(nodata);
                            if ((!nodataIsNaN && sourceValue !== nodata) ||
                                (nodataIsNaN && !isNaN(sourceValue))) {
                                transparent = false;
                                data[dataIndex] = value;
                            }
                        }
                        dataIndex++;
                    }
                }
                if (addAlpha) {
                    if (!transparent) {
                        data[dataIndex] = 255;
                    }
                    dataIndex++;
                }
            }
            return data;
        })
            .catch(function (error) {
            // output then rethrow
            console.error(error); // eslint-disable-line no-console
            throw error;
        });
    };
    return GeoTIFFSource;
}(DataTile));
/**
 * Get a promise for view properties based on the source.  Use the result of this function
 * as the `view` option in a map constructor.
 *
 *     const source = new GeoTIFF(options);
 *
 *     const map = new Map({
 *       target: 'map',
 *       layers: [
 *         new TileLayer({
 *           source: source,
 *         }),
 *       ],
 *       view: source.getView(),
 *     });
 *
 * @function
 * @return {Promise<import("../View.js").ViewOptions>} A promise for view-related properties.
 * @api
 *
 */
GeoTIFFSource.prototype.getView;
export default GeoTIFFSource;
//# sourceMappingURL=GeoTIFF.js.map