/**
 * @module ol/geom/flat/inflate
 */
/**
 * @param {Array<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {number} end End.
 * @param {number} stride Stride.
 * @param {Array<import("../../coordinate.js").Coordinate>} [opt_coordinates] Coordinates.
 * @return {Array<import("../../coordinate.js").Coordinate>} Coordinates.
 */
export function inflateCoordinates(flatCoordinates: Array<number>, offset: number, end: number, stride: number, opt_coordinates?: import("../../coordinate.js").Coordinate[] | undefined): Array<import("../../coordinate.js").Coordinate>;
/**
 * @param {Array<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {Array<number>} ends Ends.
 * @param {number} stride Stride.
 * @param {Array<Array<import("../../coordinate.js").Coordinate>>} [opt_coordinatess] Coordinatess.
 * @return {Array<Array<import("../../coordinate.js").Coordinate>>} Coordinatess.
 */
export function inflateCoordinatesArray(flatCoordinates: Array<number>, offset: number, ends: Array<number>, stride: number, opt_coordinatess?: import("../../coordinate.js").Coordinate[][] | undefined): Array<Array<import("../../coordinate.js").Coordinate>>;
/**
 * @param {Array<number>} flatCoordinates Flat coordinates.
 * @param {number} offset Offset.
 * @param {Array<Array<number>>} endss Endss.
 * @param {number} stride Stride.
 * @param {Array<Array<Array<import("../../coordinate.js").Coordinate>>>} [opt_coordinatesss]
 *     Coordinatesss.
 * @return {Array<Array<Array<import("../../coordinate.js").Coordinate>>>} Coordinatesss.
 */
export function inflateMultiCoordinatesArray(flatCoordinates: Array<number>, offset: number, endss: Array<Array<number>>, stride: number, opt_coordinatesss?: import("../../coordinate.js").Coordinate[][][] | undefined): Array<Array<Array<import("../../coordinate.js").Coordinate>>>;
//# sourceMappingURL=inflate.d.ts.map