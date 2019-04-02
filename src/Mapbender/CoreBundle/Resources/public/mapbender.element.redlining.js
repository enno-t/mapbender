(function($){

    $.widget("mapbender.mbRedlining", $.mapbender.mbBaseElement, {
        options: {
            target: null,
            display_type: 'dialog',
            auto_activate: false,
            deactivate_on_close: true,
            geometrytypes: ['point', 'line', 'polygon', 'rectangle', 'text'],
            paintstyles: {
                'strokeColor': '#ff0000',
                'fillColor': '#ff0000',
                'strokeWidth': '3'
            },
            defaultStyle: {
                fill : {
                    color : 'rgba(255,0,0,0.3)'
                },
                stroke: {
                    color: 'rgba(255,0,0,1)',
                    width: 2
                },
                circle: {
                    radius: 5,
                    color: 'rgba(255,0,0,0.3)',
                    stroke: {
                        color: 'rgba(255,0,0,1)',
                        width: 2
                    }
                },
                text: {
                    font: '13px Calibri,sans-serif',
                    fill: {
                        color: 'rgba(255,0,0,1)'
                    },
                    stroke: {
                        color: 'rgba(255,255,255,1)',
                        width: 1
                    },
                    offsetY: -15,

                }
            },
            selectStyle: {
                fill : {
                    color : 'rgba(255,170,0,0.3)'
                },
                stroke: {
                    color: 'rgba(255,170,0,1)',
                    width: 2
                },
                circle: {
                    radius: 5,
                    color: 'rgba(255,170,0,0.3)',
                    stroke: {
                        color: 'rgba(255,170,0,1)',
                        width: 2
                    }
                },
                text: {
                    font: '12px Calibri,sans-serif',
                    fill: {
                        color: 'rgba(255,170,0,1)'
                    },
                    stroke: {
                        color: 'rgba(255,255,255,1)',
                        width: 2
                    },
                    offsetY: -15
                }
            }

        },
        mbMap: null,
        map: null,
        model: null,
        layer: null,
        activeControl: null,
        selectedFeature: null,
        geomCounter: 0,
        rowTemplate: null,
        _create: function() {
            var self = this;
            Mapbender.elementRegistry.waitReady(this.options.target).then(function(mbMap) {
                self.mbMap = mbMap;
                self._setup();
            }, function() {
                Mapbender.checkTarget("mbRedlining", self.options.target);
            });
        },
        _setup: function(){
            var $geomTable = $('.geometry-table', this.element);
            // @todo: remove direct access to OpenLayers 2 map
            this.map = this.mbMap.map.olMap;
            this.rowTemplate = $('tr', $geomTable).remove();
            if(this.options.auto_activate || this.options.display_type === 'element'){
                this.activate();
            }
            $geomTable.on('click', '.geometry-remove', $.proxy(this._removeFromGeomList, this));
            $geomTable.on('click', '.geometry-edit', $.proxy(this._modifyFeature, this));
            $geomTable.on('click', '.geometry-zoom', $.proxy(this._zoomToFeature, this));
            var self = this;
            $('.redlining-tool', this.element).on('click', function() {
                return self._onToolButtonClick($(this));
            });

            this.setupMapEventListeners();

            this._trigger('ready');
        },
        setupMapEventListeners: function() {
            $(document).on('mbmapsourceadded', this._moveLayerToLayerStackTop.bind(this));
            $(document).on('mbmapsrschanged', this._onSrsChange.bind(this));
        },
        defaultAction: function(callback){
            this.activate(callback);
        },
        activate: function(callback){
            this.callback = callback ? callback : null;
            if (!this.layer) {
                //var defaultStyle = new OpenLayers.Style($.extend({}, OpenLayers.Feature.Vector.style['default'], this.options.paintstyles));
                //var styleMap = new OpenLayers.StyleMap({'default': defaultStyle}, {extendDefault: true});
                // this.layer = new OpenLayers.Layer.Vector('Redlining', {styleMap: styleMap});
                this.defaultStyle = this.model.createStyle(this.options.defaultStyle);
                this.selectStyle = this.model.createStyle(this.options.selectStyle);
                // this.layerStyle = this.model.createVectorLayerStyle();
                //var drawLayerId = this.model.createVectorLayer({}, this.layerStyle, this.element.attr('id'));
                //this.map.addLayer(this.layer);
            }
            if (this.options.display_type === 'dialog'){
                this._open();
            } else {
                this.element.removeClass('hidden');
            }
        },
        deactivate: function(){
            this._deactivateControl();
            this._endEdit(null);
            // end popup, if any
            this._close();
            if (this.options.deactivate_on_close) {
                this._removeAllFeatures();
            }
            this.callback ? this.callback.call() : this.callback = null;
            $('.redlining-tool', this.element).off('click');
        },
        // sidepane interaction, safe to use activate / deactivate unchanged
        reveal: function() {
            this.activate();
        },
        hide: function() {
            this.deactivate();
        },
        /**
         * deprecated
         * @param {array} callback
         */
        open: function(callback){
            this.activate(callback);
        },
        /**
         * deprecated
         */
        close: function(){
            this.deactivate();
        },
        _open: function(){
            var self = this;
            if(!this.popup || !this.popup.$element) {
                this.popup = new Mapbender.Popup2({
                    title: self.element.attr('data-title'),
                    draggable: true,
                    header: true,
                    modal: false,
                    closeOnESC: false,
                    content: self.element,
                    width: 500,
                    height: 380,
                    buttons: {
                        'cancel': {
                            label: Mapbender.trans('mb.core.redlining.dialog.btn.cancel'),
                            cssClass: 'button buttonCancel critical right',
                            callback: function(){
                                self.deactivate();
                            }
                        }
                    }
                });
                this.popup.$element.on('close', $.proxy(this.deactivate, this));
            } else {
                    this.popup.open(self.element);
            }
            this.element.removeClass('hidden');
        },
        _close: function(){
            if (this.popup) {
                this.element.addClass('hidden').appendTo($('body'));
                if(this.popup.$element) {
                    this.popup.destroy();
                }
                this.popup = null;
            }
        },
        _onToolButtonClick: function($button) {
            this._endEdit();
            if ($button.hasClass('active')) {
                this._deactivateControl();
            } else {
                if (this.activeControl) {
                    this._deactivateControl();
                }
                var toolName = $button.attr('name');
                var control = this._controlFactory(toolName);
                this.map.addControl(control);
                control.activate();
                this.activeControl = control;
                $button.addClass('active');
            }
            return false;
        },
        _controlFactory: function(toolName){
            var self = this;
            switch(toolName) {
                case 'point':
                    return this.model.createDrawControl('Point', this.element.attr('id'), {
                        style: this.defaultStyle,
                        events: {
                            'drawend': function(event) {
                                this.model.eventFeatureWrapper(event, function(f) {
                                    this._addToGeomList(f, Mapbender.trans('mb.core.redlining.geometrytype.point'));
                                }.bind(this));
                            }.bind(this)
                        }
                    });
                case 'line':
                    return this.model.createDrawControl('LineString', this.element.attr('id'), {
                        style: this.defaultStyle,
                        events: {
                            'drawend': function(event) {
                                this.model.eventFeatureWrapper(event, function(f) {
                                    this._addToGeomList(f, Mapbender.trans('mb.core.redlining.geometrytype.line'));
                                }.bind(this));
                            }.bind(this)
                        }
                    });
                case 'polygon':
                    return this.model.createDrawControl('Polygon', this.element.attr('id'), {
                        style: this.defaultStyle,
                        events: {
                            'drawend': function(event) {
                                this.model.eventFeatureWrapper(event, function(f) {
                                    this._addToGeomList(f, Mapbender.trans('mb.core.redlining.geometrytype.polygon'));
                                }.bind(this));
                            }.bind(this)
                        }
                    });
                case 'rectangle':
                    return this.model.createDrawControl('Box', this.element.attr('id'), {
                        style: this.defaultStyle,
                        events: {
                            'drawend': function(event) {
                                this.model.eventFeatureWrapper(event, function(f) {
                                    this._addToGeomList(f, Mapbender.trans('mb.core.redlining.geometrytype.rectangle'));
                                }.bind(this));
                            }.bind(this)
                        }
                    });
                case 'text':
                    $('input[name=label-text]', this.element).val('');
                    $('#redlining-text-wrapper', this.element).removeClass('hidden');
                    return this.model.createDrawControl('Point', this.element.attr('id'), {
                        style: this.defaultStyle,
                        events: {
                            'drawend': function(event) {
                                this.model.eventFeatureWrapper(event, function(f) {
                                    f.setId(Mapbender.UUID());
                                    f.setStyle(this.defaultStyle);
                                    f.getStyle().getText().setText($('input[name=label-text]', this.element).val());
                                    if ($('input[name=label-text]', self.element).val().trim() === '') {
                                        Mapbender.info(Mapbender.trans('mb.core.redlining.geometrytype.text.error.notext'));
                                        this._removeFeature(f);
                                    } else {
                                        this._addToGeomList(f, Mapbender.trans('mb.core.redlining.geometrytype.point'));
                                        $('input[name=label-text]', this.element).val('');
                                    }
                                }.bind(this));
                            }.bind(this)
                        }
                    });
            }
        },
        _removeFeature: function(feature){
            // TODO This is ol4 stuff and needs to be replaced
            this.model.vectorLayer[this.element.attr('id')][this.activeControlId].getSource().once('addfeature', function() {
                this.model.removeFeatureById(this.element.attr('id'), this.activeControlId, feature.getId());
            }.bind(this));

        },
        _removeAllFeatures: function(){
            $('.geometry-table tr', this.element).remove();
            this.layer.removeAllFeatures();
        },
        _endEdit: function(nextControl) {
            var editFeature = (this.editControl || {}).feature;
            if (this.editControl && nextControl !== this.editControl) {
                this.editControl.deactivate();
            }
            if (editFeature && editFeature.style && editFeature.style.label) {
                editFeature.style = this._setTextDefault(editFeature.style);
                editFeature.layer.redraw();
            }
        },
        _deactivateControl: function(){
            // if(this.selectedFeature) {
                // this.activeControl.unselectFeature(this.selectedFeature);
                // if (this.selectedFeature.style && this.selectedFeature.style.label) {
                //     $('input[name=label-text]', this.element).off('keyup', $.proxy(this._writeText, this));
                //     this.selectedFeature.style = this._setTextDefault(this.selectedFeature.style);
                //     this.layer.redraw();
                // }
                // this.selectedFeature = null;
            // }
            if(this.selectedFeature) {
                this.model.deselectFeatureById(this.element.attr('id'), this.activeControlId);
            }
            // if(this.activeControl !== null) {
            //     this.activeControl.deactivate();
            //     this.activeControl.destroy();
            //     this.map.removeControl(this.activeControl);
            //     this.activeControl = null;
            // }
            if(this.activeControlId){
                this.model.removeInteractions(this.model.vectorLayer[this.element.attr('id')][this.activeControlId].interactions);
            }
            $('#redlining-text-wrapper', this.element).addClass('hidden');
            this._deactivateButton();
        },
        _deactivateButton: function(){
            $('.redlining-tool', this.element).removeClass('active');
        },
        
        _getGeomLabel: function(feature, typeLabel, featureType){
            if(featureType === 'text') {
                return typeLabel + (feature.style && feature.style.label ? ' (' + feature.style.label + ')' : '');
            } else {
                return typeLabel + ' ' + (++this.geomCounter);
            }
        },
        _addToGeomList: function(feature, typeLabel){
            var activeTool = $('.redlining-tool.active', this.element).attr('name');
            var row = this.rowTemplate.clone();
            row.attr('data-id', function(){
                feature.setId(Mapbender.UUID());
                return feature.getId();
            });
            row.attr('data-layer-id', this.activeControlId);
            $('.geometry-name', row).text(this._getGeomLabel(feature, typeLabel, activeTool));
            var $geomtable = $('.geometry-table', this.element);
            $geomtable.append(row);
        },
        _removeFromGeomList: function(e){
            this._deactivateControl();
            var $tr = $(e.target).parents('tr:first');
            this.selectedFeature = this.model.getFeatureById(this.element.attr('id'), $tr.attr('data-layer-id'), $tr.attr('data-id'));
            var eventFeature = this.layer.getFeatureById($tr.attr('data-id'));
            if (this.editControl && this.editControl.active && this.editControl.feature === eventFeature) {
                this._endEdit(null);
            }
            this.model.removeFeatureById(this.element.attr('id'), $tr.attr('data-layer-id'), $tr.attr('data-id'));
            this._removeFeature(eventFeature);
            $tr.remove();
            this.selectedFeature = null;
        },
        _modifyFeature: function(e){
            this._deactivateControl();
            var $tr = $(e.target).parents('tr:first');
            this.selectedFeature = this.model.getFeatureById(this.element.attr('id'), $tr.attr('data-layer-id'), $tr.attr('data-id'));
            this.activeControlId = this.model.createModifyInteraction(this.element.attr('id'), this.selectStyle, $tr.attr('data-layer-id'), $tr.attr('data-id'));
            // this.selectedFeature = this.layer.getFeatureById($(e.target).parents('tr:first').attr('data-id'));
            // if(this.selectedFeature.style && this.selectedFeature.style.label) {
            //     this.selectedFeature.style = this._setTextEdit(this.selectedFeature.style);
            //     $('input[name=label-text]', this.element).val(this.selectedFeature.style.label);
            //     $('#redlining-text-wrapper', this.element).removeClass('hidden');
            //     $('input[name=label-text]', this.element).on('keyup', $.proxy(this._writeText, this));
            // }
            // this.activeControl = new OpenLayers.Control.ModifyFeature(this.layer, {standalone: true});
            // this.map.addControl(this.activeControl);
            // this.activeControl.selectFeature(this.selectedFeature);
            // this.activeControl.activate();
        },
        _zoomToFeature: function(e){
            this._deactivateControl();
            var $tr = $(e.target).parents('tr:first');
            var feature = this.model.getFeatureById(this.element.attr('id'), $tr.attr('data-layer-id'), $tr.attr('data-id'));
            this.mbMap.getModel().zoomToFeature(feature);
        },
        _generateTextStyle: function(label){
            var style = OpenLayers.Util.applyDefaults(null, OpenLayers.Feature.Vector.style['default']);
            if (label) {
                style.label = label;
            }
            style.labelAlign = 'lm';
            style.labelXOffset = 10;
            style.pointRadius = 6;
            style.fillOpacity = 0.4;
            style.strokeOpacity = 1;
            style.strokeWidth = 2;
            return this._setTextDefault(style);
        },
        _setTextDefault: function(style){
            style.fillColor = style.strokeColor = style.fontColor = 'red';
            return style;
        },
        _setTextEdit: function(style){
            style.fillColor = style.strokeColor = style.fontColor = 'blue';
            return style;
        },
        
        _writeText: function(e) {
            if (this.selectedFeature && this.selectedFeature.style && this.selectedFeature.style.label) {
                var value;
                if ((value = $('input[name=label-text]', this.element).val().trim()) === '') {
                    Mapbender.info(Mapbender.trans('mb.core.redlining.geometrytype.text.error.notext'));
                } else {
                    this.selectedFeature.style.label = value;
                    var label = this._getGeomLabel(this.selectedFeature, Mapbender.trans('mb.core.redlining.geometrytype.text.label'), 'text');
                    $('.geometry-table tr[data-id="'+this.selectedFeature.id+'"] .geometry-name', this.element).text(label);
                    this.layer.redraw();
                }
            }
        },
        /**
         * Move redlining layer on top of layer stack if a source is added, i.e. by wms loader
         * @private
         */
        _moveLayerToLayerStackTop: function(event, params) {
            this._endEdit(null);
            if (this.layer) {
                this.map.raiseLayer(this.layer, this.map.getNumLayers());
                this.map.resetLayersZIndex();
            }
        },
        _onSrsChange: function(event, data) {
            this._endEdit(null);
            this._deactivateControl();
            if (this.layer) {
                (this.layer.features || []).map(function(feature) {
                    if (feature.geometry && feature.geometry.transform) {
                        feature.geometry.transform(data.from, data.to);
                    }
                });
                this.layer.redraw();
            }
        }
    });

})(jQuery);
