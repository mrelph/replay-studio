declare module 'fabric' {
  export interface Point {
    x: number
    y: number
  }

  export class Canvas {
    constructor(el: HTMLCanvasElement | string, options?: any)
    isDrawingMode: boolean
    selection: boolean
    freeDrawingBrush: any
    width: number | undefined
    height: number | undefined
    add(...objects: Object[]): Canvas
    remove(...objects: Object[]): Canvas
    renderAll(): Canvas
    requestRenderAll(): void
    getPointer(e: Event): Point
    setActiveObject(object: Object): Canvas
    getActiveObject(): Object | null
    getActiveObjects(): Object[]
    discardActiveObject(): Canvas
    on(event: string, handler: (e?: any) => void): void
    off(event: string, handler?: (e?: any) => void): void
    dispose(): void
    clear(): Canvas
    toJSON(propertiesToInclude?: string[]): any
    loadFromJSON(json: any, callback?: () => void, reviver?: (o: any, object: Object) => void): Canvas
    getObjects(type?: string): Object[]
    sendToBack(object: Object): Canvas
    bringToFront(object: Object): Canvas
    sendBackwards(object: Object): Canvas
    bringForward(object: Object): Canvas
    moveTo(object: Object, index: number): Canvas
    setZoom(value: number): Canvas
    getZoom(): number
    absolutePan(point: Point): Canvas
    relativePan(point: Point): Canvas
    setViewportTransform(vpt: number[]): Canvas
    viewportTransform: number[]
  }

  export class PencilBrush {
    constructor(canvas: Canvas)
    color: string
    width: number
    strokeLineCap: string
    strokeLineJoin: string
  }

  export class Object {
    constructor(options?: any)
    set(options: any): Object
    set(key: string, value: any): Object
    get(property: string): any
    setCoords(): Object
    getCenterPoint(): Point
    getBoundingRect(): { left: number; top: number; width: number; height: number }
    clone(callback?: (clone: Object) => void): void
    toObject(propertiesToInclude?: string[]): any
    toJSON(propertiesToInclude?: string[]): any
    on(event: string, handler: (e?: any) => void): void
    off(event: string, handler?: (e?: any) => void): void
    animate(property: string, value: number | string, options?: any): Object

    // Properties
    type: string
    left: number
    top: number
    width: number
    height: number
    scaleX: number
    scaleY: number
    angle: number
    opacity: number
    fill: string | null
    stroke: string | null
    strokeWidth: number
    strokeDashArray: number[] | null
    strokeLineCap: string
    strokeLineJoin: string
    originX: string
    originY: string
    selectable: boolean
    evented: boolean
    visible: boolean
    clipPath: Object | null
    shadow: any
    absolutePositioned: boolean
    inverted: boolean
    excludeFromExport: boolean
  }

  export class Line extends Object {
    constructor(points: number[], options?: any)
    x1: number | undefined
    y1: number | undefined
    x2: number | undefined
    y2: number | undefined
  }

  export class Circle extends Object {
    constructor(options?: any)
    radius: number
  }

  export class Ellipse extends Object {
    constructor(options?: any)
    rx: number
    ry: number
  }

  export class Rect extends Object {
    constructor(options?: any)
    rx: number
    ry: number
  }

  export class Triangle extends Object {
    constructor(options?: any)
  }

  export class Polygon extends Object {
    constructor(points: Point[], options?: any)
    points: Point[]
  }

  export class Polyline extends Object {
    constructor(points: Point[], options?: any)
    points: Point[]
  }

  export class IText extends Object {
    constructor(text: string, options?: any)
    text: string
    fontSize: number
    fontFamily: string
    fontWeight: string | number
    fontStyle: string
    textAlign: string
    lineHeight: number
    enterEditing(): void
    exitEditing(): void
    selectAll(): IText
    getSelectedText(): string
    insertChars(text: string): void
  }

  export class Textbox extends IText {
    constructor(text: string, options?: any)
    minWidth: number
    splitByGrapheme: boolean
  }

  export class Path extends Object {
    constructor(path: string | any[], options?: any)
    path: any[]
  }

  export class Group extends Object {
    constructor(objects: Object[], options?: any)
    addWithUpdate(object: Object): Group
    removeWithUpdate(object: Object): Group
    getObjects(type?: string): Object[]
    item(index: number): Object
    size(): number
    contains(object: Object): boolean
    toActiveSelection(): void
  }

  export class ActiveSelection extends Group {
    constructor(objects: Object[], options?: any)
  }

  export class Image extends Object {
    constructor(element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, options?: any)
    static fromURL(url: string, callback: (img: Image) => void, options?: any): void
    static fromElement(element: HTMLImageElement, callback: (img: Image) => void, options?: any): void
    setSrc(src: string, callback?: () => void, options?: any): Image
    getElement(): HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
    filters: any[]
    applyFilters(): Image
  }

  export namespace util {
    export function loadImage(url: string, callback: (img: HTMLImageElement) => void, context?: any, crossOrigin?: string): void
    export function createClass(parent: any, properties?: any): any
    export function degreesToRadians(degrees: number): number
    export function radiansToDegrees(radians: number): number
    export function rotatePoint(point: Point, origin: Point, radians: number): Point
    export function transformPoint(point: Point, transform: number[]): Point
    export function invertTransform(transform: number[]): number[]
    export function multiplyTransformMatrices(a: number[], b: number[]): number[]
  }

  export namespace filters {
    export class BaseFilter {
      constructor(options?: any)
      applyTo(options: any): void
    }
    export class Brightness extends BaseFilter {}
    export class Contrast extends BaseFilter {}
    export class Saturation extends BaseFilter {}
    export class Blur extends BaseFilter {}
    export class Grayscale extends BaseFilter {}
    export class Invert extends BaseFilter {}
  }
}
