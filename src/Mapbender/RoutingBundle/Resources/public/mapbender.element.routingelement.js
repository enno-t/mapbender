(function($) {
    'use strict';
    /**
     * @author Christian Kuntzsch <christian.kuntzsch@wheregroup.com>
     * @author Robert Klemm <robert.klemm@wheregroup.com>
     * @namespace mapbender.mbRoutingElement
     */
    $.widget('mapbender.mbRoutingElement', {
        options: {
            styleLinearDistance: {
                pointRadius: 0,
                strokeLinecap : 'square',
                strokeDashstyle: 'dash'
            }
        },
        map: null,
        olMap: null,
        routingLayer: null,
        markerLayer: null,
        mapClickHandlerCoordinate: null,
        elementUrl: null,
        pointsSet: {
            start: false,
            destination: false
        },
        snappedWayPoint: null,
        popup: null,
        routeData: null,

        _create: function() {
            const self = this;
            Mapbender.elementRegistry.waitReady('.mb-element-map').then(function (mbMap) {
                self._setup(mbMap);
            }, function () {
                Mapbender.checkTarget('mbRoutingElement');
            });
            this.elementUrl = Mapbender.configuration.application.urls.element + '/' + this.element.attr('id') + '/';
            const searchDriver = this.options.searchConfig.driver;
            this.searchConfig = this.options.searchConfig[searchDriver];
            console.log('options', this.options)
        },

        _setup: function(mbMap) {
            var self = this;
            this.map = mbMap;
            this.olMap = mbMap.map.olMap;

            if (!this.options.allowContextMenu) {
                this._initializeContextMenu();
            }

            if (this.options.autoSubmit) {
                self._autoSubmit();
            }

            this._initializeEventListeners();
            this._trigger('ready');
        },

        defaultAction: function (callback) {
            this.open(callback);
        },

        /**
         * open popoup dialog
         * @param callback
         * @returns {boolean}
         */
        open: function(callback) {
            this.callback = callback ? callback : null;
            const element = $(this.element);

            if (this.options.type !== 'dialog') {
                return false;
            }

            if (!this.popup || !this.popup.$element) {
                this.popup = new Mapbender.Popup2({
                    title: Mapbender.trans('mb.routing.backend.title'),
                    draggable: true,
                    header: true,
                    modal: false,
                    closeButton: false,
                    closeOnESC: false,
                    content: this.element,
                    width: 350,
                    height: 490,
                    buttons: {}
                });
                this.popup.$element.on('close', $.proxy(this.close, this));
                this.activate();
                element.show();
            }
        },

        close: function() {
            if (this.popup) {
                this.element.hide().appendTo($('body'));
                if (this.popup.$element) {
                    this.popup.destroy();
                }
                this.popup = null;
            }
            this.deactivate();
            this.callback ? this.callback.call() : this.callback = null;
        },

        activate: function() {
            if (!this.options.allowContextMenu) {
                this._initializeContextMenu();
            }
            this.markerLayer && this.markerLayer.setVisibility(true);
            this.routingLayer && this.routingLayer.setVisibility(true);
        },

        deactivate: function() {
            $(this.olMap.div).off('contextmenu');
            this.markerLayer && this.markerLayer.setVisibility(false);
            this.routingLayer && this.routingLayer.setVisibility(false);
        },

        _initializeEventListeners: function() {
            var self = this;
            this.olMap.on('singleclick', $.proxy(this._mapClickHandler, this));

            // flush points when srs is changed
            $(document).on('mbmapsrschanged', () => {
                self._emptyPoints();
            });

            // add point on click
            $('#addPoint', this.element).click(() => {
                self._addInputField();
            });

            // remove input on click
            $('.mb-routing-location-points', this.element).on('click', '.clearField', (e) => {
                self._removeInputWrapper(e.target);
            });

            // reset route and input on click
            $('#resetRoute', this.element).click(() => {
                self._clearRoute();
            });

            // swap points on click
            $('#swapPoints', this.element).click(() => {
                self._flipPoints();
            });

            // calculate route button click
            $('#calculateRoute', this.element).click(() => {
                self._getRoute();
            });

            this._findLocationInputFields().each((e) => {
                $(e.target).on('focusout', self._handleInputFocusOut.bind(self));
            });

            if (this.options.useSearch) {
                $('.mb-routing-location-points', this.element).on('focus', 'input[type="text"]', (e) => {
                    $(e.target).autocomplete({
                        minLength: 3,
                        source: self._handleAutocompleteSource.bind(self),
                        focus: (event, ui) => {
                            $(this).val(ui.item.label);
                            return false;
                        },
                        select: self._handleAutocompleteSelect.bind(self)
                    }).autocomplete('instance')._renderItem = (ul, item) => {
                        return $('<li>')
                            .append('<a>' + item.label + '</a>')
                            .appendTo(ul);
                    };
                });
            }

            $('.mb-routing-location-points', this.element).sortable({
                start: (e, ui) => {
                    $(e.target).attr('data-previndex', ui.item.index());
                },
                update: (e) => {
                    $(e.target).removeAttr('data-previndex');
                    self._reorderInputFields();
                }
            }).disableSelection();

            $('.mb-element-map canvas').on('contextmenu', (e) => {
                e.preventDefault();
                // built right mouseclick context menu here
            });

            if (self.element.closest('.tabContainer,.accordionContainer')) {
                // set up marker layer visibility switching depending on "active" vs "inactive"
                console.log(MapbenderContainerInfo);
                /*
                var _ = new MapbenderContainerInfo(self, {
                    onactive: $.proxy(self.activate, self),
                    oninactive: $.proxy(self.deactivate, self)
                });
                */
            }
        },

        /**
         * On right click on map, coordinate needs to be extracted so the context menu can access it
         * @todo: We store the click coords in the instance so the context menu can get them. This is pretty ugly.
         *        Unfortunately, there doesn't seem to be a way to access the click event directly in the context menu
         *        event handler. See docs at https://swisnl.github.io/jQuery-contextMenu/docs.html#events
         *        Maybe we should open an issue to ask for access to the event in a future release.
         */
        _mapClickHandler: function(event) {
            // TODO ugly!!
            this.mapClickHandlerCoordinate = event.coordinate;
        },

        _findLocationInputFields: function() {
            return $('.mb-routing-location-points .input-group input', this.element);
        },

        _initializeContextMenu: function() {
            /*
            var self = this;
            $(this.olMap.div).contextMenu({
                selector: 'div',
                events: {
                    'show': function(options) {
                        // suppress context menu, if dialog is currently not open.
                        if (self.options.type === 'dialog' && !self.popup) {
                            return false;

                        // suppress context menu, if element is currently not activated
                        } else if (self.options.type === 'element' && !self._isActive()) {
                            return false;
                        }
                    }
                },
                items: this._createContextMenuItems()
            });
            */
        },

        _createContextMenuItems: function() {
            var items = {},
                self = this;
            var start = {
                name: Mapbender.trans('mb.routing.frontend.context.btn.start'),
                callback: function(){
                    var inputEl = $('.input-wrapper.start input', self.element);
                    self._addPointToInput(inputEl, self.mapClickHandlerCoordinate);
                }
            };
            var intermediate = {
                name: Mapbender.trans('mb.routing.frontend.context.btn.intermediate'),
                callback: function(){
                    var inputEl = self._addInputField();
                    self._addPointToInput(inputEl, self.mapClickHandlerCoordinate);
                },
                disabled: function (){
                    return ($(".start > input", self.element).val() === '' ||
                        $(".destination > input", self.element).val() === '');
                }
            };
            var destination = {
                name: Mapbender.trans('mb.routing.frontend.context.btn.destination'),
                callback: function(){
                    var inputEl = $('.input-wrapper.destination input', self.element);
                    self._addPointToInput(inputEl, self.mapClickHandlerCoordinate);
                }
            };
            if (this.options.allowIntermediatePoints) {
                items = {
                    'start': start,
                    'sep1': '---------',
                    'intermediate': intermediate,
                    'sep2': '---------',
                    'destination': destination
                };
                return items;
            }
            items = {
                'start': start,
                'sep1': '---------',
                'destination': destination
            };
            return items;
        },

        _handleInputFocusOut: function () {
            var inputVal = $(this).val();
            var coordArray = null;
            var coordinates = null;
            var $inputEl = null;
            var patt = new RegExp(/^(\-?\d+(\.\d+)?)(?:,|;|\s)+(\-?\d+(\.\d+)?)$/);
            var extent = this.olMap.getView().calculateExtent();
            // var extent = self.olMap.getMaxExtent().clone();

            if (this._isValidGPSCoordinates(inputVal)) {
                coordArray = $(this).val().split(/[\s,;]+/);
                var x = coordArray[0].trim();
                var y = coordArray[1].trim();
                var destProj = this.olMap.getProjectionObject();
                var sourceProj = new OpenLayers.Projection('EPSG:4326');
                coordinates = new OpenLayers.LonLat(y,x);
                coordinates.transform(sourceProj, destProj);
                extent = extent.transform(destProj, sourceProj);
                // check if coordinates are inside max extent
                if (x > extent['top'] || x < extent['bottom'] || y > extent['right'] || y < extent['left']) {
                    console.warn('Input: Coordinates out of bounds');
                    return false;
                }

                $inputEl = $(this); // current Status
                this._addPointToInput($inputEl, coordinates);

                if(this.markerLayer.features.length > 1) {
                    this.olMap.zoomToExtent(this.markerLayer.getDataExtent());
                    return true;
                }

                this.olMap.setCenter(coordArray);
            } else if (patt.test(inputVal)) {
                coordArray = $(this).val().split(',');
                coordinates = {
                    lon: parseFloat(coordArray[0].trim()),
                    lat: parseFloat(coordArray[1].trim())
                };

                // check if coordinates are inside max extent
                if (coordinates.lat > extent['top'] || coordinates.lat < extent['bottom'] || coordinates.lon > extent['right'] || coordinates.lon < extent['left']) {
                    console.warn('Input: Coordinates out of bounds');
                    return false;
                }

                $inputEl = $(this); // current Status
                this._addPointToInput($inputEl, coordinates);

                if(this.markerLayer.features.length > 1) {
                    this.olMap.zoomToExtent(this.markerLayer.getDataExtent());
                    return true;
                }

                this.olMap.setCenter(coordArray);
            }
        },

        _handleAutocompleteSource: function (request, _response) {
            const self = this;
            return $.ajax({
                type: 'GET',
                url: this.elementUrl + 'search',
                data: {
                    terms: encodeURI(request.term),
                    srsId: this.olMap.getView().getProjection().getCode()
                }
            }).then(function(response) {
                if (response.error) {
                    Mapbender.error(Mapbender.trans('mb.routing.exception.main.general'));
                } else {
                    _response($.map(response, function (value) {
                        return {
                            label: value[self.searchConfig.label_attribute],
                            geom: value[self.searchConfig.geom_attribute],
                            srid: (self.searchConfig.geom_proj) ? self.searchConfig.geom_proj : self.olMap.getView().getProjection().getCode()
                        };
                    }));
                }
            });
        },

        _handleAutocompleteSelect: function (e, ui) {
            $(e.target).val(ui.item.label);
            let format;
            switch (this.searchConfig.geom_format) {
                case 'WKT':
                    format = new ol.format.WKT();
                    break;
                case 'GeoJSON':
                    format = new ol.format.GeoJSON();
                    break;
                default:
                    const msg = Mapbender.trans('mb.routing.exception.main.format') + ': ' + this.searchConfig.geom_format;
                    Mapbender.error(msg);
                    throw new Error(msg);
            }
            const feature = format.readFeature(ui.item.geom, {
                dataProjection: ui.item.srid,
                featureProjection: this.olMap.getView().getProjection().getCode(),
            });
            this._createMarker(e.target, feature);
            const featureGeom = feature.getGeometry();
            $(e.target).data('coords', featureGeom.getCoordinates());
            const source = this.markerLayer.getSource();
            let geometryOrExtent = source.getExtent();

            if (source.getFeatures().length === 1) {
                geometryOrExtent = featureGeom;
            }

            this.olMap.getView().fit(geometryOrExtent, {
                padding: new Array(4).fill(this.options.buffer)
            });

            if (this.options.autoSubmit) {
                this._getRoute();
                e.target.blur();
            }

            return false;
        },

        _isActive: function() {
            var $sidebarContainer = $(this.element).closest('.container-accordion,.container');
            if ($sidebarContainer) {
                return $sidebarContainer.hasClass('active');
            } else {
                console.warn("Warning: _mapbender.mbRoutingElement._isActive not implemented for current container; only supports 'accordion' or 'tabs' style sidebar");
                return true;
            }
        },

        _addPointToInput: function(inputEl, coordinates) {
            var self = this;

            if (self.options.useReverseGeocoding) {
                var p = {
                    name: "point",
                    value: [coordinates.lon,coordinates.lat]
                };

                self._getRevGeocode([p]).then(function(response) {
                    var resultLabel = self._checkResultLabel(coordinates,response);
                    $(inputEl).val(resultLabel).data('coords', [coordinates.lon,coordinates.lat]).change();
                });

                self._createMarker(inputEl, coordinates);

            } else {

                $(inputEl).val(Number((coordinates.lon).toFixed(2)) + "," + Number((coordinates.lat).toFixed(2))).data('coords', [coordinates.lon, coordinates.lat]).change();
                self._createMarker(inputEl, coordinates);
            }
        },

        _createMarker: function(inputElement, feature) {
            this._createMarkerLayer();
            const inputIndex = $(inputElement).parent().index();
            const inputLength = this._findLocationInputFields().length;
            let style = {};

            if (inputIndex === 0) {
                style = this._getMarkerStyle('startIcon');
            } else if (inputIndex === inputLength - 1) {
                style = this._getMarkerStyle('destinationIcon');
            } else {
                style = this._getMarkerStyle('intermediateIcon');
            }

            feature.setStyle(style);
            let previousMarker = $(inputElement).data('marker');

            if (previousMarker) {
                this.markerLayer.getSource().removeFeature(previousMarker);
            }

            $(inputElement).data('marker', feature);
            this.markerLayer.getSource().addFeature(feature);
        },

        _createMarkerLayer: function() {
            if (!this.markerLayer) {
                this.markerLayer = new ol.layer.Vector({
                    source: new ol.source.Vector(),
                });
                this.olMap.addLayer(this.markerLayer);
                // Make features draggable
                /*
                self.olMap.addControl(new OpenLayers.Control.DragFeature(self.markerLayer, {
                    autoActivate: true,
                    onComplete: function (feature) {
                        // Check ReversGeocode and change features attribute
                        if (self._revGeocode(feature) === false) {
                            $(feature.attributes.input)
                                .val(Number(feature.geometry.x).toFixed(2) + "," + Number(feature.geometry.y).toFixed(2))
                                .data('coords', [feature.geometry.x, feature.geometry.y])
                                .change();
                        }
                    }
                }));
                */
            }
        },

        _transformCoordinates: function(coordinatePair, srcProj, destinationProj) {
            return ol.proj.transform(coordinatePair, srcProj, destinationProj);
        },

        _getRoutingPoints: function() {
            let isValid = true;
            let routingPoints = [];
            this._findLocationInputFields().each((idx, element) => {
                let coords = $(element).data('coords');
                if ($.trim(coords) === '') {
                    isValid = false;
                    $(element).addClass('empty');
                } else {
                    if (coords === undefined) {
                        isValid = false;
                        $(element).addClass('empty');
                    } else {
                        routingPoints.push(coords);
                        $(element).removeClass('empty');
                    }
                }
            });
            if (!isValid) {
                return false;
            } else {
                return routingPoints;
            }
        },

        _getRouteStyle: function() {
            return this.options.styleMap.route;
        },

        _getRoute: function() {
            const self = this;
            const requestProj = 'EPSG:4326';
            const mapProj = this.olMap.getView().getProjection().getCode();
            let points = this._getRoutingPoints();

            if (!points) {
                console.warn('No valid points for routing.');
                return false;
            }

            if (requestProj !== mapProj) {
                points = points.map(function(point) {
                    return self._transformCoordinates(point, mapProj, requestProj);
                });
            }

            this.setSpinnerVisible(true);
            $.ajax({
                type: 'POST',
                url: this.elementUrl + 'getRoute',
                data: {
                    'vehicle': $('input[name=vehicle]:checked', this.element).val(),
                    'points': points,
                    'srs': mapProj
                }
            }).fail(function () {
                Mapbender.error('route service is not available');
                self.setSpinnerVisible(false);
            }).done(function (response) {
                if (response.error) {
                    Mapbender.error(response.error.message);
                } else {
                    self._renderRoute(response);
                    self.setSpinnerVisible(false);
                    return;

                    var routeData = response.routeData;
                    self.routeData = routeData;
                    var srs = parseInt(routeData.crs.properties.name.split("::")[1]);
                    var respProj =  srs > 0 ? new OpenLayers.Projection('EPSG:'+srs) : requestProj.projCode;

                    // Check requestProj and Transform LineGeometry array
                    // ol2 can not transform whole geometry objects therefore this way.
                    if (mapProj.projCode !== respProj.projCode) {
                        self._transformFeatures(routeData,respProj,mapProj);
                    }

                    var routeStyle = self._getRouteStyle();
                    self._renderRoute(routeData, routeStyle);
                    if (routeData.features[0].properties.instructions) {
                        self._parseRouteInstructions(routeData.features[0].properties.instructions);
                    }
                    var routeInfo = self._parseRouteData(routeData.features[0].properties);
                    self._displayRouteInfo(routeInfo);
                }
                self.setSpinnerVisible(false);
            });
        },

        _renderRoute: function(response) {
            if (!this.routingLayer) {
                const hex2rgba = function (hex, opacity) {
                    const r = parseInt(hex.substring(1, 3), 16);
                    const g = parseInt(hex.substring(3, 5), 16);
                    const b = parseInt(hex.substring(5, 7), 16);
                    return 'rgba(' + r + ',' + g + ',' + b + ',' + opacity + ')';
                };
                const styleConfig = this.options.routingStyles;
                const lineColor = styleConfig.lineColor;
                const lineWidth = styleConfig.lineWidth;
                const lineOpacity = styleConfig.lineOpacity;
                const fill = new ol.style.Fill({
                    color: hex2rgba(lineColor, lineOpacity),
                });
                const stroke = new ol.style.Stroke({
                    color: lineColor,
                    width: lineWidth,
                });
                this.routingLayer = new ol.layer.Vector({
                    source: new ol.source.Vector(),
                    style: new ol.style.Style({
                        image: new ol.style.Circle({
                            fill: fill,
                            stroke: stroke,
                            radius: 5,
                        }),
                        fill: fill,
                        stroke: stroke,
                    })
                });
                this.olMap.addLayer(this.routingLayer);
            }

            const format = new ol.format.GeoJSON();
            const feature = format.readFeature(response);
            const mapProj = this.olMap.getView().getProjection().getCode();
            const featureProj = feature.get('srs');

            if (mapProj !== featureProj) {
                feature.getGeometry().transform(featureProj, mapProj);
            }

            this.routingLayer.getSource().clear();
            this.routingLayer.getSource().addFeature(feature);

            // create and add result or airline Features
            // var air_line = self._getAirLineFeature(response, style);
            // self.routingLayer.addFeatures(air_line);

            const extent = this.routingLayer.getSource().getExtent();
            this.olMap.getView().fit(extent, {
                padding: new Array(4).fill(this.options.buffer)
            });
        },

        _transformFeatures: function(routeData,respProj,mapProj) {
            var lineGeometry = routeData.features;
            var self = this;
            lineGeometry.forEach(function (feature, index) {
                var geomCoordinates = feature.geometry.coordinates;
                var propWayPoints = feature.properties.waypoints || null;

                routeData.features[index].geometry.coordinates = self._transformLineGeometry(
                    geomCoordinates,
                    respProj,
                    mapProj
                );

                // transform snapped WayPoints
                if (propWayPoints){
                    propWayPoints.forEach(function (element) {
                        element.coordinates = self._transformCoordinates(
                            element.coordinates,
                            respProj,
                            mapProj
                        );
                        element.srid = mapProj.projCode;
                    });
                }
            });
        },

        _parseRouteInstructions: function(instructions) {
            var $t = $('<table/>');
            $t.addClass('instructions');
            instructions.forEach(function(inst) {
                var $icon;
                var $tr = $('<tr/>');
                var $td = $('<td/>');
                if (inst.icon) {
                    $icon = $('<img/>');
                    $icon.attr('src', inst.icon);
                    $td.addClass('inst-marker').append($icon);
                    $tr.append($td);
                    $td = $('<td/>');
                } else {
                    $icon = $('<span/>');
                    $td.addClass('inst-marker').append($icon);
                    $tr.append($td);
                    $td = $('<td/>');
                }
                if (inst.text) {
                    $td.text(inst.text).addClass('inst-text');
                    $tr.append($td);
                    $td = $('<td/>');
                }
                if (inst.metersOnLeg && inst.secondsOnLeg) {
                    var span = '<span>' + inst.metersOnLeg + '<br>' + inst.secondsOnLeg + '</span>';
                    $td.addClass('inst-dist').append(span);
                    $tr.append($td);
                }
                $t.append($tr);
            });
            var $instructionsDiv = $('.mb-routing-instructions', this.element);
            var $instructionsTable = $instructionsDiv.children(':first');
            var maxHeight = ($instructionsDiv.offset().top - $('.mb-routing-info').offset().top);
            $instructionsTable.remove();
            if (!$instructionsTable.length) {
                $instructionsDiv.css('max-height', maxHeight)
            }
            $instructionsDiv.append($t);
        },

        _parseRouteData: function(properties) {
            // passes parameters to _get Snapped WayPoint otherwise no parameter
            if (properties.waypoints){
                this._setSnappedWayPoint(properties.waypoints);
            }else{
                this._setSnappedWayPoint();
            }

            var routeInfo = {
                    length: properties.length,
                    lengthUnit: properties.lengthUnit,
                    time: properties.graphTime,
                    timeUnit: properties.graphTimeFormat,
                    instructions: [],
                    start: this.snappedWayPoint.startValue,
                    destination: this.snappedWayPoint.destinationValue
                };

            if (routeInfo.timeUnit === "ms" ) {
                routeInfo.time = this.__msToTime(routeInfo.time);
            }
            routeInfo.length = (routeInfo.length < 1000) ? Math.round(routeInfo.length * 100) / 100 + 'm' :  Math.round(routeInfo.length/1000*100) /100 + 'km';

            return routeInfo;
        },

        _setSnappedWayPoint: function(responseWayPoints){
            var inputStartEle = $('.input-wrapper.start input', this.element);
            var inputDestEle  = $('.input-wrapper.destination input', this.element);
            var resultValue;

            var inputContainsCoords = (input) => {
                return input.val() === input.data('coords').join(',');
            }

            if (responseWayPoints){
                var responseWayPointLength = responseWayPoints.length;
                var responseStartName = responseWayPoints[0].name;
                var responseDestinationName = responseWayPoints[responseWayPointLength - 1].name;
            }

            if (this.options.useSearch || this.options.useReverseGeocoding){


                var start = (responseStartName && inputContainsCoords(inputStartEle)) ? responseStartName : inputStartEle.val();
                var dest = (responseDestinationName && inputContainsCoords(inputDestEle)) ? responseDestinationName : inputDestEle.val();

                console.log(start,responseStartName,inputStartEle.val());
                console.log(dest,responseDestinationName,inputDestEle.val());
                resultValue ={
                    startValue: start,
                    destinationValue: dest
                };
            } else {
                resultValue = {
                    startValue:  responseStartName || inputStartEle.val(),
                    destinationValue: responseDestinationName || inputDestEle.val()
                };
            }
            this.snappedWayPoint = resultValue;
        },

        __msToTime: function(s) {
            var ms = s % 1000;
            s = (s - ms) / 1000;
            var secs = s % 60;
            s = (s - secs) / 60;
            var mins = s % 60;
            var hrs = (s - mins) / 60;

            return hrs === 0 ? mins + ' min' : hrs + ' h ' + mins + ' min ';
        },

        _displayRouteInfo: function(routeInfo) {
            var $routeInfoDiv = $(".mb-routing-info", this.element),
                infoText = this.options.infoText;
            infoText = infoText.replace(/{start}|{destination}|{time}|{length}/g,
                function(matched) {
                    matched = matched.replace(/{|}/gi, '');
                    return routeInfo[matched];
                });
            $routeInfoDiv.html("<p>" + infoText + "<p/>").show();
            return true;
        },

        _transformLineGeometry: function(lineGeometry, inputProj, mapProj) {
            var transformedLineGeometry = [];
            var self = this;
            lineGeometry.forEach(function(pt) {
                var p = self._transformCoordinates(pt, inputProj, mapProj);
                transformedLineGeometry.push([p[0], p[1]]);
            });
            return transformedLineGeometry;
        },

        _transformMultiLineGeometry: function(multilineGeometry, requestProj, mapProj) {
            var self = this;
            var transformedLineGeometry = [];
            multilineGeometry.forEach(function(line) {
                var l = self._transformLineGeometry(line, requestProj, mapProj);
                transformedLineGeometry.push(l);
            });
            return transformedLineGeometry;
        },

        _addInputField: function() {
            const htmlIntermediatePoint = $($('#tplIntermediatePoint').html());
            const lastInputElement = $('.mb-routing-location-points div:last-child', this.element);
            htmlIntermediatePoint.insertBefore(lastInputElement);
        },

        _removeInputWrapper: function(btn) {
            const self = this;
            const inputGroup = $(btn).parent();
            let inputField = $('input', inputGroup);
            inputField.val('');
            this._removeMarker(inputField);
            if (this._findLocationInputFields().length > 2) {
                inputGroup.remove();
                self._reorderInputFields();
            }
        },

        _removeMarker: function(inputEl) {
            const marker = $(inputEl).data('marker');
            if (marker && this.markerLayer) {
                this.markerLayer.getSource().removeFeature(marker);
            }
            $(inputEl).data('marker', null);
        },

        /**
         * TODO implement coordinate AND geometry transformation
         */
        _emptyPoints: function() {
            const self = this;
            const $inputs = this._findLocationInputFields();
            $.each($inputs, (idx, input) => {
                self._removeMarker(input);
                $(input).val('').data('coords', null);
            });
        },

        _flipPoints: function() {
            const form = $('.mb-routing-location-points', this.element);
            const inputFields = form.children('div');
            form.append(inputFields.get().reverse());
            this._reorderInputFields();
        },

        _reorderInputFields: function() {
            const self = this;
            let inputFields = $('.mb-routing-location-points > div', this.element);
            inputFields.removeClass('intermediatePoints');
            inputFields.first().find('.fa-location-dot').removeClass('text-success text-danger text-primary').addClass('text-success');
            inputFields.last().find('.fa-location-dot').removeClass('text-success text-danger text-primary').addClass('text-danger');
            $('input', inputFields.first()).attr('placeholder', Mapbender.trans('mb.routing.frontend.dialog.label.start'));
            $('input', inputFields.last()).attr('placeholder', Mapbender.trans('mb.routing.frontend.dialog.label.destination'));
            // update intermediate points, if any
            inputFields.slice(1, -1).each((idx, inputField) => {
                const $el = $(inputField);
                const $input = $('input', $el);
                $el.addClass('intermediatePoints');
                $el.find('.fa-location-dot').removeClass('text-success text-danger').addClass('text-primary');
                $input.attr('placeholder', Mapbender.trans('mb.routing.frontend.dialog.label.intermediate'));
                let marker = $input.data('marker');
                if (marker) {
                    marker.setStyle(self._getMarkerStyle('intermediateIcon'));
                }
            });
            // intermediate markers can keep their styling, but start end destination markers have to switch
            const startMarker = $('input', inputFields.first()).data('marker');
            const destMarker = $('input', inputFields.last()).data('marker');
            if (startMarker) {
                startMarker.setStyle(self._getMarkerStyle('startIcon'));
            }
            if (destMarker) {
                destMarker.setStyle(self._getMarkerStyle('destinationIcon'));
            }
            if (this.options.autoSubmit) {
                self._getRoute();
            }
        },

        _getMarkerStyle: function(marker) {
            const styleConfig = this.options.routingStyles[marker];
            if (!styleConfig.imagePath) {
                const msg = Mapbender.trans('mb.routing.exception.main.icon');
                Mapbender.error(msg);
                return null;
            }
            let options = {
                src: styleConfig.imagePath,
            };
            if (styleConfig.imageSize) {
                const size = styleConfig.imageSize.split(',');
                options['width'] = Number(size[0]);
                options['height'] = Number(size[1]);
            }
            if (styleConfig.imageOffset) {
                const offset = styleConfig.imageOffset.split(',');
                // options['anchor'] = [Number(offset[0]), Number(offset[1])];
            }
            return new ol.style.Style({
                image: new ol.style.Icon(options),
            });
        },

        _clearRoute: function() {
            if (this.markerLayer !== null) {
                this.markerLayer.getSource().clear();
            }
            if (this.routingLayer !== null) {
                this.routingLayer.getSource().clear();
            }
            this._emptyPoints();
            $('.mb-routing-location-points > .intermediatePoints', this.element).remove();
            $('.mb-routing-info', this.element).hide().html('');
            return true;
        },

        _isInputValid: function() {
            var isValid = true;
            $.each($(this).find('input.input'), function(index, element){
                isValid = isValid && ($(element).val() !== '');
                console.log(isValid);
            });
            return isValid;
        },

        _autoSubmit: function() {
            var self = this;
            $('.mb-routing-location-points', this.element).change(function() {
                if (self._isInputValid()) {
                    self._getRoute();
                }
            });
        },

        // TODO implement "drag marker on map to define start point"-feature
        _dragStartMarker: function(){
            console.log('drag started');
        },

        _revGeocode: function (feature){
            var self = this;

            if (self.options.useReverseGeocoding) {
                var p = {
                    name: "point",
                    value: [feature.geometry.x,feature.geometry.y]
                };

                self._getRevGeocode([p]).then(function(response) {
                    var resultLabel = self._checkResultLabel(feature,response);
                    $(feature.attributes.input)
                        .val(resultLabel)
                        .data('coords', [feature.geometry.x, feature.geometry.y])
                        .change();
                });

                return true;

            }else{
                return false;
            }
        },

        _getRevGeocode: function(coordinate) {
            var self = this;
            return $.ajax({
                type: "GET",
                url: self.elementUrl + 'revGeocode',
                data: {
                    coordinate: coordinate,
                    srsId: self.olMap.getProjectionObject().projCode
                }
            });
        },

        _isValidGPSCoordinates:function(coordinates){
            // Breite, Länge = latitude, longitude = lat, lon
            var args = coordinates.split(/[\s,;]+/);
            var lat = new RegExp(/^(-?[1-8]?\d(?:\.\d{1,18})?|90(?:\.0{1,18})?)$/);
            var lon = new RegExp(/^(-?(?:1[0-7]|[1-9])?\d(?:\.\d{1,18})?|180(?:\.0{1,18})?)$/);

            if (isNaN(args[0]) || isNaN(args[1])) {
                return false;
            }

            return lat.test(args[0].trim()) === true && lon.test(args[1].trim()) === true;
        },

        _getAirLineFeature: function (response, style) {
            var self = this;
            var points = self._getRoutingPoints();
            var airLineFeatures = [];
            var waypoints = response.features[0].properties.waypoints;
            //IE doesn't support Object.assign()
            //https://stackoverflow.com/questions/42091600/how-to-merge-objects-in-ie-11
            var styleLinearDistance = self.options.styleLinearDistance;
            var stylesToCombine = [styleLinearDistance, style];
            var styleLinearDistance = stylesToCombine.reduce(function (r, o) {
                Object.keys(o).forEach(function (k) {
                    r[k] = o[k];
                });
                return r;
            }, {});

            // Loop inputPoints of Frontend
            points.forEach(function (element, index) {
                var coordPoints = element; // coordinatePair (Input)
                var inputPoint =  new OpenLayers.Geometry.Point (coordPoints[0],coordPoints[1]); // geomety of points
                var wayCoord = waypoints[index].coordinates; // wayPoints of Response
                var wayPoint = new OpenLayers.Geometry.Point (wayCoord[0],wayCoord[1]);

                var lineGeometry = new OpenLayers.Geometry.LineString([inputPoint, wayPoint]);
                airLineFeatures.push(new OpenLayers.Feature.Vector(lineGeometry, null, styleLinearDistance));
            });
            return airLineFeatures;
        },

        _checkResultLabel: function (feature,response) {
            var resultLabel = "", x, y;

            if (feature instanceof OpenLayers.Feature.Vector) {

                x = feature.geometry.x;
                y = feature.geometry.y;
            } else {

                x = feature.lon;
                y = feature.lat;
            }

            resultLabel = x + "," + y;

            if (Array.isArray(response)) {
                response.forEach(function (element, index) {
                    resultLabel = element.label || resultLabel ;
                    if (element.hasOwnProperty('messages')){
                        console.log('ReversGeocoding: '+element.messages);
                    }
                });
            }

            return resultLabel;
        },

        setSpinnerVisible: function(setVisible){
            let calculateRouteBtn = $('#calculateRoute i');
            if (setVisible) {
                calculateRouteBtn.attr('class', 'fa-solid fa-sync fa-spin').parent().prop('disabled', true);
            } else {
                calculateRouteBtn.attr('class', 'fa-regular fa-paper-plane').parent().prop('disabled', false);
            }
        }
    });
})(jQuery);
