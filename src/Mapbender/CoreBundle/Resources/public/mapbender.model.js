((function($) {

window.Mapbender = Mapbender || {};
    /**
     * @param {Object} mbMap
     * @constructor
     */
    window.Mapbender.MapModelOl2 = function(mbMap) {
    Mapbender.MapModelBase.apply(this, arguments);
    this._initMap(mbMap);
};
Mapbender.MapModelOl2.prototype = Object.create(Mapbender.MapModelBase.prototype);
Object.assign(Mapbender.MapModelOl2.prototype, {
    constructor: Mapbender.MapModelOl2,
    /**
     * @typedef Model~LayerState
     * @property {boolean} visibility
     * @property {boolean} info
     * @property {boolean} outOfScale
     * @property {boolean} outOfBounds
     */
    /**
     * @typedef Model~TreeOptions
     * @property {boolean} selected
     * @property {boolean} info
     * @property {Object} allow
     */
    /**
     * @typedef Model~LayerChangeInfo
     * @property {Model~LayerState} state
     * @property {Object} options
     * @property {Model~TreeOptions} options.treeOptions
     */
    /**
     * @typedef Model~LayerTreeOptionWrapper
     * @property {Object} options
     * @property {Model~TreeOptions} options.treeOptions
     */
    /**
     * @typedef Model~LayerDef
     * @property {Object} options
     * @property {Model~TreeOptions} options.treeOptions
     * @property {Model~LayerState} state
     * @property {Array<Model~LayerDef>} children
     */
    /**
     * @typedef Model~SourceTreeish
     * @property {Object} configuration
     * @property {Array<Model~LayerDef>} configuration.children
     * @property {string} id
     * @property {string} origId
     * @property {string} type
     * @property {string} ollid
     */
    /**
     * @typedef Model~SingleLayerPrintConfig
     * @property {string} type
     * @property {string} sourceId
     * @property {string} url
     * @property {number|null} minResolution
     * @property {number|null} maxResolution
     */
    /**
     * @typedef {Object} Model~CenterOptionsMapQueryish
     * @property {Array<Number>} [box]
     * @property {Array<Number>} [position]
     * @property {Array<Number>} [center] same as position! .position takes precedence if both are set
     * @property {Number} [zoom]
     */

    map: null,
    _highlightLayer: null,
    _initMap: function _initMap() {
        this._patchNavigationControl();
        var self = this;

        var baseLayer = new OpenLayers.Layer('fake', {
            visibility: false,
            isBaseLayer: true,
            maxExtent: this._transformExtent(this.mapMaxExtent, this._configProj, this._startProj).toArray(),
            projection: this._startProj
        });
        var mapOptions = {
            maxExtent: this._transformExtent(this.mapMaxExtent, this._configProj, this._startProj).toArray(),
            maxResolution: 'auto',
            numZoomLevels: this.mbMap.options.scales ? this.mbMap.options.scales.length : this.mbMap.options.numZoomLevels,
            projection: this._startProj,
            displayProjection: this._startProj,
            units: this.getProj(this._startProj).proj.units || 'degrees',
            allOverlays: true,
            fallThrough: true,
            layers: [baseLayer],
            theme: null,
            // tile manager breaks tile WMS layers going out of scale as intended
            tileManager: null
        };
        if (this.mbMap.options.scales) {
            $.extend(mapOptions, {
                scales: this.mbMap.options.scales
            });
        }
        this.olMap = new OpenLayers.Map(this.mbMap.element.get(0), mapOptions);
        // Use a faked, somewhat compatible-ish surrogate for MapQuery Map
        // @todo: eliminate MapQuery method / property access completely
        // * accesses to 'layersList'
        // * layer lookup via 'mqlid' on source definitions

        this.map = new Mapbender.NotMapQueryMap(this.mbMap.element, this.olMap);

        this.setView(true);
        this.processUrlParams();
        if (this.mbMap.options.targetscale) {
            var zoom = this.pickZoomForScale(this.mbMap.options.targetscale, true);
            this.setZoomLevel(zoom, false);
        }
        this._setupHistoryControl();
        this._setupNavigationControl();
        this._initEvents(this.olMap, this.mbMap);
    },
    _initEvents: function(olMap, mbMap) {
        var self = this;
        olMap.events.register('zoomend', this, this._afterZoom);
        var clickHandlerOptions = {
            map: olMap
        };
        var handlerFn = function(event) {
            return self._onMapClick(event);
        };
        var clickHandler = new OpenLayers.Handler.Click({}, {click: handlerFn}, clickHandlerOptions);
        clickHandler.activate();
        olMap.events.register('moveend', null, function() {
            self.sourceTree.map(function(source) {
                self._checkSource(source, true);
            });
        });
    },
    _onMapClick: function(event) {
        var clickLonLat = this.olMap.getLonLatFromViewPortPx(event);
        $(this.mbMap.element).trigger('mbmapclick', {
            mbMap: this.mbMap,
            pixel: [event.x, event.y],
            coordinate: [clickLonLat.lon, clickLonLat.lat],
            event: event
        });
    },
    _setupHistoryControl: function() {
        this.historyControl = new OpenLayers.Control.NavigationHistory();
        this.olMap.addControl(this.historyControl);
    },
    _patchNavigationControl: function() {
        var self = this;
        var zbZoomBoxMethodOriginal = OpenLayers.Control.ZoomBox.prototype.zoomBox;

        function zbZoomBoxMethodPatched(position) {
            console.warn("Monkey-patched zoomBoxControl.zoomBox", this, arguments);
            zbZoomBoxMethodOriginal.apply(this, arguments);
            self._afterZoomBox(this.map);
        }
        OpenLayers.Control.ZoomBox.prototype.zoomBox = zbZoomBoxMethodPatched;
    },
    _setupNavigationControl: function() {
        this._navigationControl = this.map.olMap.getControlsByClass('OpenLayers.Control.Navigation')[0];
        this._navigationDragHandler = this._navigationControl.zoomBox.handler.dragHandler;
        this._initialDragHandlerKeyMask = this._navigationDragHandler.keyMask;
    },
    /**
     * Set map view: extent from URL parameters or configuration and POIs
     * @deprecated, call individual methods
     */
    setView: function(addLayers) {
        var mapOptions = this.mbMap.options;
        var pois = mapOptions.extra && mapOptions.extra.pois;
        var lonlat;

        if (mapOptions.center) {
            lonlat = new OpenLayers.LonLat(mapOptions.center);
            this.map.olMap.setCenter(lonlat);
        } else if (pois && pois.length === 1) {
            var singlePoi = pois[0];
            lonlat = new OpenLayers.LonLat(singlePoi.x, singlePoi.y);
            lonlat = lonlat.transform(this.getProj(singlePoi.srs), this.getProj(this._startProj));
            this.map.olMap.setCenter(lonlat);
        } else {
            this.setExtent(this.mapStartExtent);
        }
        if (addLayers) {
            this.initializeSourceLayers();
        }
        this.initializePois(pois || []);
    },
    initializePois: function(poiOptionsList) {
        var self = this;
        if (!poiOptionsList.length) {
            return;
        }
        var mapProj = this.getProj(this.mbMap.options.targetsrs || this.mbMap.options.srs);
        var pois = poiOptionsList.map(function(poi) {
            var coord = new OpenLayers.LonLat(poi.x, poi.y);
            if (poi.srs) {
                coord = coord.transform(self.getProj(poi.srs), mapProj);
            }
            return {
                position: coord,
                label: poi.label
            };
        });

        var poiMarkerLayer = new OpenLayers.Layer.Markers();
        var poiIcon = new OpenLayers.Icon(
            Mapbender.configuration.application.urls.asset + this.mbMap.options.poiIcon.image,
            {
                w: this.mbMap.options.poiIcon.width,
                h: this.mbMap.options.poiIcon.height
            },
            {
                x: this.mbMap.options.poiIcon.xoffset,
                y: this.mbMap.options.poiIcon.yoffset
            }
        );

        this.map.olMap.addLayer(poiMarkerLayer);

        $.each(pois, function(idx, poi) {
            // Marker
            poiMarkerLayer.addMarker(new OpenLayers.Marker(
                poi.position,
                poiIcon.clone()));

            if (poi.label) {
                self.map.olMap.addPopup(new OpenLayers.Popup.FramedCloud('chicken',
                    poi.position,
                    null,
                    poi.label,
                    null,
                    true,
                    function() {
                        self.mbMap.removePopup(this);
                        this.destroy();
                    }));
            }
        });
    },
    getCurrentProjectionCode: function() {
        if (this.olMap) {
            return this.olMap.getProjection();
        } else {
            return this._startProj;
        }
    },
    getCurrentProjectionUnits: function() {
        var proj;
        if (this.olMap) {
            proj = this.getProj(this.olMap.getProjection());
        } else {
            proj = this.getProj(this._startProj);
        }
        return proj.proj.units || 'degrees';
    },
    getCurrentProj: function() {
        if (this.map && this.map.olMap) {
            return this.map.olMap.getProjectionObject();
        } else {
            return this.getProj(this._startProj);
        }
    },
    /**
     * @param {string} srscode
     * @param {boolean} [strict] to throw errors (legacy default false)
     * @return {OpenLayers.Projection}
     */
    getProj: function(srscode, strict) {
        if (Proj4js.defs[srscode]) {
            var proj = new OpenLayers.Projection(srscode);
            if (!proj.proj.units) {
                proj.proj.units = 'degrees';
            }
            return proj;
        }
        if (strict) {
            throw new Error("Unsupported projection " + srscode.toString());
        }
        return null;
    },
    historyBack: function() {
        this.historyControl.previous.trigger();
    },
    historyForward: function() {
        this.historyControl.next.trigger();
    },
    /**
     * Calculates an extent from a geometry with buffer.
     * @param {OpenLayers.Geometry} geom geometry
     * @param {object} buffer {w: WWW,h: HHH}. WWW- buffer for x (kilometer), HHH- buffer for y (kilometer).
     * @returns {OpenLayers.Bounds}
     */
    calculateExtent: function(geom, buffer) {
        var proj = this.getCurrentProj();
        var centroid = geom.getCentroid();
        var bounds = geom.getBounds() ? geom.getBounds() : geom.calculateBounds();
        var buffer_bounds = {
            w: (bounds.right - bounds.left) / 2,
            h: (bounds.top - bounds.bottom) / 2
        };
        var k;
        var w;
        var h;
        if (proj.proj.units === 'degrees' || proj.proj.units === 'dd') {
            var pnt_ll = new OpenLayers.LonLat(centroid.x, centroid.y);
            var pnt_pxl = this.map.olMap.getViewPortPxFromLonLat(pnt_ll);
            var pnt_geodSz = this.map.olMap.getGeodesicPixelSize(pnt_pxl);
            var lb = new OpenLayers.Pixel(pnt_pxl.x - buffer.w / pnt_geodSz.w, pnt_pxl.y - buffer.h / pnt_geodSz.h);
            var rt = new OpenLayers.Pixel(pnt_pxl.x + buffer.w / pnt_geodSz.w, pnt_pxl.y + buffer.h / pnt_geodSz.h);
            var lb_lonlat = this.map.olMap.getLonLatFromLayerPx(lb);
            var rt_lonlat = this.map.olMap.getLonLatFromLayerPx(rt);
            return new OpenLayers.Bounds(
                lb_lonlat.lon - buffer_bounds.w,
                lb_lonlat.lat - buffer_bounds.h,
                rt_lonlat.lon + buffer_bounds.w,
                rt_lonlat.lat + buffer_bounds.h);
        } else if (proj.proj.units === 'm') {
            w = buffer.w;
            h = buffer.h;
        } else if (proj.proj.units === 'ft') {
            w = buffer.w / 0.3048;
            h = buffer.h / 0.3048;
        } else if (proj.proj.units === 'us-ft') {
            k = 0.3048 * 0.999998; // k === us-ft
            w = buffer.w / k;
            h = buffer.h / k;
        } else {
            w = 0;
            h = 0;
        }
        return new OpenLayers.Bounds(
            centroid.x - 0.5 * w - buffer_bounds.w,
            centroid.y - 0.5 * h - buffer_bounds.h,
            centroid.x + 0.5 * w + buffer_bounds.w,
            centroid.y + 0.5 * h + buffer_bounds.h);
    },
    getMapExtent: function() {
        return this.map.olMap.getExtent();
    },
    getMapState: function() {
        var proj = this.map.olMap.getProjectionObject();
        var ext = this.map.olMap.getExtent();
        var maxExt = this.map.olMap.getMaxExtent();
        var size = this.map.olMap.getSize();
        var state = {
            window: {
                width: size.w,
                height: size.h
            },
            extent: {
                srs: proj.projCode,
                minx: ext.left,
                miny: ext.bottom,
                maxx: ext.right,
                maxy: ext.top
            },
            maxextent: {
                srs: proj.projCode,
                minx: maxExt.left,
                miny: maxExt.bottom,
                maxx: maxExt.right,
                maxy: maxExt.top
            },
            sources: []
        };
        var sources = this.getSources();
        for (var i = 0; i < sources.length; i++) {
            var source = sources[i];
            var sourceState = JSON.parse(JSON.stringify(source));
            state.sources.push(sourceState);
        }
        return state;
    },
    /**
     * Returns a source from a sourceTree
     * @param {Object} idObject in form of:
     * - source id -> {id: MYSOURCEID}
     * - mapqyery id -> {mqlid: MYSOURCEMAPQUERYID}
     * - openlayers id -> {ollid: MYSOURCEOPENLAYERSID}
     * - origin id -> {ollid: MYSOURCEORIGINID}
     * @returns {Model~SourceTreeish|null}
     */
    getSource: function(idObject) {
        var key;
        for (key in idObject) {
            break;
        }
        if (key) {
            for (var i = 0; i < this.sourceTree.length; i++) {
                if (this.sourceTree[i][key] && idObject[key]
                    && this.sourceTree[i][key].toString() === idObject[key].toString()) {
                    return this.sourceTree[i];
                }
            }
        }
        return null;
    },
    /**
     * Enables the zoom selection box immediately without requiring a key combination (default: SHIFT)
     * to be held.
     */
    zoomBoxOn: function() {
        $(this.getViewPort()).css({cursor: 'crosshair'});
        this._navigationDragHandler.keyMask = OpenLayers.Handler.MOD_NONE;
    },
    /**
     * Reenables the keymask for drawing a zoom box
     */
    zoomBoxOff: function() {
        $(this.getViewPort()).css({cursor: ''});
        this._navigationDragHandler.keyMask = this._initialDragHandlerKeyMask;
    },
    _afterZoomBox: function(map) {
        if (map === this.map.olMap) {
            this.zoomBoxOff();
            $(this.mbMap.element).trigger('mbmapafterzoombox', {
                mbMap: this.mbMap
            });
        }
    },
    _afterZoom: function() {
        var scales = this._getScales();
        var zoom = this.getCurrentZoomLevel();
        $(this.mbMap.element).trigger('mbmapzoomchanged', {
            mbMap: this.mbMap,
            zoom: zoom,
            // scale: this.getCurrentScale()
            scale: scales[zoom]
        });
    },
    /**
     * @param {Array|OpenLayers.Bounds|Object} boundsOrCoords
     */
    setExtent: function(boundsOrCoords) {
        var bounds;
        if ($.isArray(boundsOrCoords)) {
            bounds = OpenLayers.Bounds.fromArray(boundsOrCoords);
        } else {
            bounds = new OpenLayers.Bounds(
                boundsOrCoords.left,
                boundsOrCoords.bottom,
                boundsOrCoords.right,
                boundsOrCoords.top);
        }
        this.olMap.zoomToExtent(bounds);
    },
    zoomIn: function() {
        this.olMap.zoomIn();
    },
    zoomOut: function() {
        this.olMap.zoomOut();
    },
    zoomToFullExtent: function() {
        this.olMap.zoomToMaxExtent();
    },
    /**
     * Emulation shim for old-style MapQuery.Map.prototype.center.
     * See https://github.com/mapbender/mapquery/blob/1.0.2/src/jquery.mapquery.core.js#L298
     * @param {Model~CenterOptionsMapQueryish} options
     * @deprecated
     */
    setCenterMapqueryish: function(options) {
        if (!arguments.length) {
            throw new Error("Unsupported getter-style invocation");
        }
        if (options.projection) {
            throw new Error("Unsupported setCenterMapqueryish call with options.projection");
        }
        if (typeof options.box !== 'undefined') {
            console.warn("Deprecated setCenter call, please switch to Mapbender.Model.setExtent");
            this.setExtent(options.box);
        } else if (typeof options.position !== 'undefined' || typeof options.center !== 'undefined') {
            var _center = options.position || options.center;
            var x, y, zoom = options.zoom;
            if (typeof zoom === 'undefined') {
                zoom = null;
            }
            if ($.isArray(_center) && _center.length === 2) {
                x = _center[0];
                y = _center[1];
            } else {
                x = _center.lon;
                y = _center.lat;
            }
            if (typeof x === 'undefined' || typeof y == 'undefined' || x === null || y === null) {
                throw new Error("Invalid position / center option");
            }
            console.warn("Deprecated setCenter call, please switch to Mapbender.Model.centerXy");
            this.centerXy(x, y, {
                zoom: zoom
            });
        }
        throw new Error("Invalid setCenterMapqueryish options");
    },
    /**
     * @param {Model~CenterOptionsMapQueryish} options
     * @deprecated
     */
    center: function(options) {
        this.setCenterMapqueryish(options);
    },
    /**
     * @param {Number} x projected
     * @param {Number} y projected
     * @param {Object} [options]
     * @param {Number} [options.minScale]
     * @param {Number} [options.maxScale]
     * @param {Number|String} [options.zoom]
     */
    centerXy: function(x, y, options) {
        var centerLl = new OpenLayers.LonLat(x, y);
        var zoom = null;
        if (options && (options.zoom || parseInt(options.zoom) === 0)) {
            zoom = this._clampZoomLevel(parseInt(options.zoom));
        }
        zoom = this._adjustZoom(zoom, options);
        this.map.olMap.setCenter(centerLl, zoom);
    },
    /**
     * @param {OpenLayers.Feature.Vector} feature
     * @param {Object} [options]
     * @param {number=} options.buffer in meters
     * @param {number=} options.minScale
     * @param {number=} options.maxScale
     * @param {boolean=} options.center to forcibly recenter map (default: true); otherwise
     *      just keeps feature in view
     */
    zoomToFeature: function(feature, options) {
        if (!feature || !feature.geometry) {
            console.error("Empty feature or empty feature geometry", feature);
            return;
        }
        var center_;
        if (options) {
            center_ = options.center || typeof options.center === 'undefined';
        } else {
            center_ = true;
        }
        var bounds = feature.geometry.getBounds().clone();
        if (options && options.buffer) {
            var engine = Mapbender.mapEngine;
            var unitsPerMeter = engine.getProjectionUnitsPerMeter(this.getCurrentProjectionCode());
            var bufferNative = options.buffer * unitsPerMeter;
            bounds.left -= bufferNative;
            bounds.right += bufferNative;
            bounds.top += bufferNative;
            bounds.bottom -= bufferNative;
        }
        var zoom0 = this.map.olMap.getZoomForExtent(bounds, false);
        var zoom = this._adjustZoom(zoom0, options);
        var zoomNow = this.getCurrentZoomLevel();
        var featureInView = this.olMap.getExtent().containsBounds(bounds);
        if (center_ || zoom !== zoomNow || !featureInView) {
            var centerLl = bounds.getCenterLonLat();
            this.map.olMap.setCenter(centerLl, zoom);
        }
    },
    setZoomLevel: function(level, allowTransitionEffect) {
        var _level = this._clampZoomLevel(level);
        if (_level !== this.getCurrentZoomLevel()) {
            if (allowTransitionEffect) {
                this.map.olMap.zoomTo(_level);
            } else {
                var centerPx = this.map.olMap.getViewPortPxFromLonLat(this.map.olMap.getCenter());
                var zoomCenter = this.map.olMap.getZoomTargetCenter(centerPx, _level);
                this.map.olMap.setCenter(zoomCenter, _level, false, true);
            }
        }
    },
    getCurrentZoomLevel: function() {
        return this.map.olMap.getZoom();
    },
    panByPixels: function(dx, dy) {
        this.map.olMap.pan(dx, dy);
    },
    panByPercent: function(dx, dy) {
        var mapSize = this.map.olMap.getSize();
        var pixelDx = (dx / 100.0) * mapSize.w;
        var pixelDy = (dy / 100.0) * mapSize.h;
        this.panByPixels(pixelDx, pixelDy);
    },
    getViewPort: function() {
        return this.map.olMap.viewPortDiv;
    },
    _getScales: function() {
        // @todo: fractional zoom: method must not be called
        var baseLayer = this.map.olMap.baseLayer;
        if (!(baseLayer && baseLayer.scales && baseLayer.scales.length)) {
            console.error("No base layer, or scales not populated", baseLayer, this.map.olMap);
            throw new Error("No base layer, or scales not populated");
        }
        return baseLayer.scales.map(function(s) {
            return parseInt('' + Math.round(s));
        });
    },

    /**
     * @param {number|null} targetZoom
     * @param {Object} scaleOptions
     * @param {number=} scaleOptions.minScale
     * @param {number=} scaleOptions.maxScale
     * @return {number|null}
     * @private
     */
    _adjustZoom: function(targetZoom, scaleOptions) {
        var zoom = targetZoom;
        var zoomNow = this.map.olMap.getZoom();
        if (scaleOptions && scaleOptions.minScale) {
            var maxZoom = this.pickZoomForScale(scaleOptions.minScale, true);
            if (zoom !== null) {
                zoom = Math.min(zoom, maxZoom);
            } else {
                zoom = Math.min(zoomNow, maxZoom);
            }
        }
        if (scaleOptions && scaleOptions.maxScale) {
            var minZoom = this.pickZoomForScale(scaleOptions.maxScale, false);
            if (zoom !== null) {
                zoom = Math.max(zoom, minZoom);
            } else {
                zoom = Math.max(zoomNow, minZoom);
            }
        }
        return zoom;
    },
    /**
     * @param {Array<OpenLayers.Feature>} features
     * @param {Object} options
     * @property {boolean} [options.clearFirst]
     * @property {boolean} [options.goto]
     */
    highlightOn: function(features, options) {
        if (!this._highlightLayer) {
            this._highlightLayer = new OpenLayers.Layer.Vector('Highlight');
            var self = this;
            var selectControl = new OpenLayers.Control.SelectFeature(this._highlightLayer, {
                hover: true,
                onSelect: function(feature) {
                    // wrong event name, legacy
                    self.mbMap._trigger('highlighthoverin', null, {feature: feature});
                    // correct event name
                    self.mbMap._trigger('highlightselected', null, {feature: feature});
                },
                onUnselect: function(feature) {
                    // wrong event name, legacy
                    self.mbMap._trigger('highlighthoverout', null, {feature: feature});
                    // correct event name
                    self.mbMap._trigger('highlightunselected', null, {feature: feature});
                }
            });
            selectControl.handlers.feature.stopDown = false;
            this.map.olMap.addControl(selectControl);
            selectControl.activate();
        }
        if (!this._highlightLayer.map) {
            this.map.olMap.addLayer(this._highlightLayer);
        }

        // Remove existing features if requested
        if (!options || typeof options.clearFirst === 'undefined' || options.clearFirst) {
            this._highlightLayer.removeAllFeatures();
        }
        // Add new highlight features
        this._highlightLayer.addFeatures(features);
        // Goto features if requested
        if (!options || typeof options.goto === 'undefined' || options.goto) {
            var bounds = this._highlightLayer.getDataExtent();
            if (bounds !== null) {
                this.setExtent(bounds);
            }
        }
    },
    /**
     *
     */
    highlightOff: function(features) {
        if (!features && this._highlightLayer && this._highlightLayer.map) {
            this._highlightLayer.map.removeLayer(this._highlightLayer);
        } else if (features && this.highlightLayer) {
            this._highlightLayer.removeFeatures(features);
        }
    },
    /**
     *
     */
    removeSources: function(keepSources) {
        for (var i = 0; i < this.sourceTree.length; i++) {
            var source = this.sourceTree[i];
            if (!keepSources[source.id]) {
                this.removeSourceById(source.id);
            }
        }
    },
    /**
     * @param {OpenLayers.Layer} olLayer
     * @param {OpenLayers.Projection} newProj
     * @param {OpenLayers.Bounds} [newMaxExtent]
     * @private
     */
    _changeLayerProjection: function(olLayer, newProj, newMaxExtent) {
        var layerOptions = {
            // passing projection as string is preferable to passing the object,
            // because it also auto-initializes units and projection-inherent maxExtent
            projection: newProj.projCode
        };
        if (olLayer.maxExtent) {
            layerOptions.maxExtent = newMaxExtent;
        }
        olLayer.addOptions(layerOptions);
    },
    /*
     * Changes the map's projection.
     */
    changeProjection: function(srsCode) {
        if (srsCode.projection) {
            console.warn("Legacy object-style argument passed to changeProjection");
            return this.changeProjection(srsCode.projection.projCode);
        }
        Mapbender.MapModelBase.prototype.changeProjection.call(this, srsCode);
    },
    _changeProjectionInternal: function(srsNameFrom, srsNameTo) {
        var oldProj = this.getProj(srsNameFrom);
        var newProj = this.getProj(srsNameTo);
        var newMaxExtent = this._transformExtent(this.mapMaxExtent, this._configProj, newProj);
        var i, j, olLayers, dynamicSources = [], source;
        for (i = 0; i < this.sourceTree.length; ++i) {
            source = this.sourceTree[i];
            if (source.checkRecreateOnSrsSwitch(oldProj, newProj)) {
                dynamicSources.push(source);
                source.destroyLayers();
            } else {
                olLayers = source.getNativeLayers();
                for (j = 0; j < olLayers.length; ++ j) {
                    this._changeLayerProjection(olLayers[j], newProj, newMaxExtent);
                }
            }
        }
        var center = this.map.olMap.getCenter().clone().transform(oldProj, newProj);
        var baseLayer = this.map.olMap.baseLayer || this.map.olMap.layers[0];
        if (baseLayer) {
            this._changeLayerProjection(baseLayer, newProj, newMaxExtent);
        }
        this.map.olMap.projection = newProj;
        this.map.olMap.displayProjection = newProj;
        this.map.olMap.units = newProj.proj.units;
        this.map.olMap.maxExtent = newMaxExtent;
        this.map.olMap.setCenter(center, this.map.olMap.getZoom(), false, true);
        for (i = 0; i < dynamicSources.length; ++i) {
            source = dynamicSources[i];
            if (source.checkRecreateOnSrsSwitch(oldProj, newProj)) {
                olLayers = source.initializeLayers(newProj.projCode);
                for (j = 0; j < olLayers.length; ++j) {
                    var olLayer = olLayers[j];
                    olLayer.setVisibility(false);
                }
                this._spliceLayers(source, olLayers);
            }
        }
        var self = this;
        self.sourceTree.map(function(source) {
            self._checkSource(source, false);
        });
    },
    /**
     * Injects native layers into the map at the "natural" position for the source.
     * This supports multiple layers for the same source.
     *
     * @param {Mapbender.Source} source
     * @param {OpenLayers.Layer} olLayers
     * @private
     */
    _spliceLayers: function(source, olLayers) {
        var sourceIndex = this.sourceTree.indexOf(source);
        if (sourceIndex === -1) {
            console.error("Can't splice layers for source with unknown position", source, olLayers);
            throw new Error("Can't splice layers for source with unknown position");
        }
        var olMap = this.map.olMap;
        var afterLayer = olMap.baseLayer || olMap.layers[0];
        for (var s = sourceIndex - 1; s >= 0; --s) {
            var previousSource = this.sourceTree[s];
            var previousLayer = (previousSource.nativeLayers.slice(-1))[0];
            if (previousLayer && previousLayer.map === olMap) {
                afterLayer = previousLayer;
                break;
            }
        }
        var baseIndex = olMap.getLayerIndex(afterLayer) + 1;
        for (var i = 0; i < olLayers.length; ++i) {
            var olLayer = olLayers[i];
            olMap.addLayer(olLayer);
            olMap.setLayerIndex(olLayer, baseIndex + i);
            olLayer.mbConfig = source;
            this._initLayerEvents(olLayer, source, i);
        }
    },
    _initLayerEvents: function(olLayer, source, sourceLayerIndex) {
        var mbMap = this.mbMap;
        var engine = Mapbender.mapEngine;
        olLayer.events.register("loadstart", null, function() {
            mbMap.element.trigger('mbmapsourceloadstart', {
                mbMap: mbMap,
                source: source
            });
        });
        olLayer.events.register("tileerror", null, function() {
            if (engine.getLayerVisibility(olLayer)) {
                mbMap.element.trigger('mbmapsourceloaderror', {
                    mbMap: mbMap,
                    source: source
                });
            }
        });
        olLayer.events.register("loadend", null, function() {
            mbMap.element.trigger('mbmapsourceloadend', {
                mbMap: mbMap,
                source: source
            });
        });
    },
    /**
     * @param {*} anything
     * @return {OpenLayers.Layer|null}
     */
    getNativeLayer: function(anything) {
        if (anything.getNativeLayer) {
            return anything.getNativeLayer(0);
        }
        if (anything.olLayer) {
            // MapQuery layer
            return anything.olLayer;
        }
        if (anything.CLASS_NAME && anything.CLASS_NAME.search('OpenLayers.Layer') === 0) {
            // OpenLayers.Layer (child class) instance
            return anything;
        }
        if (anything.mqlid) {
            // sourceTreeish
            return (this.map.layersList[anything.mqlid] || {}).olLayer || null;
        }
        if (anything.ollid) {
            return _.find(this.map.olMap.layers, _.matches({id: anything.ollid})) || null;
        }
        console.error("Could not find native layer for given obect", anything);
        return null;
    },
    /**
     * Returns individual print / export instructions for each active layer in the source individually.
     * This allows image export / print to respect min / max scale hints on a per-layer basis and print
     * layers at varying resolutions.
     * The multitude of layers will be squashed on the PHP side while considering the actual print
     * resolution (which is not known here), to minimize the total amount of requests.
     *
     * @param sourceOrLayer
     * @param scale
     * @param extent
     * @return {Array<Model~SingleLayerPrintConfig>}
     */
    getPrintConfigEx: function(sourceOrLayer, scale, extent) {
        var source = this.getMbConfig(sourceOrLayer, true, true);
        var extent_ = extent || this.getMapExtent();
        var dataOut = [];
        var commonLayerData = {
            type: source.configuration.type,
            sourceId: source.id,
            opacity: source.configuration.options.opacity
        };
        if (typeof source.getMultiLayerPrintConfig === 'function') {
            var srsName = this.getCurrentProjectionCode();
            var mlPrintConfigs = source.getMultiLayerPrintConfig(extent_, scale, srsName);
            mlPrintConfigs.map(function(pc) {
                dataOut.push($.extend({}, commonLayerData, pc));
            });
        } else {
            console.warn("Unprintable source", sourceOrLayer);
        }
        return dataOut;
    },
    /**
     * @return {Array<Number>}
     */
    getCurrentExtentArray: function() {
        return this.olMap.getExtent().toArray();
    },
    /**
     * @param {OpenLayers.Bounds} extent
     * @param {string|OpenLayers.Projection} fromProj
     * @param {string|OpenLayers.Projection} toProj
     * @returns {OpenLayers.Bounds}
     */
    _transformExtent: function(extent, fromProj, toProj) {
        return Mapbender.mapEngine.transformBounds(extent, fromProj, toProj);
    }
});
})(jQuery));
