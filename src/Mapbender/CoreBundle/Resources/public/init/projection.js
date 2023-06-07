// static method collection for dealing with Proj4js setup in a version-independent manner
window.Mapbender = Mapbender || {};
Mapbender.Projection = $.extend(window.Mapbender.Projection || {}, {
    /**
     * Extend proj4js srs definitions with given list.
     *
     * @param {Object.<string, string>[]} defs should have keys 'code' (legacy alternative: 'name') and 'definition'
     * @param {boolean} [keep=false] keep to avoid replacing already existing projection definitions
     * @param {boolean} [warn=false] warn to warn on console when replacing existing SRS
     */
    extendSrsDefintions: function(defs, keep, warn) {
        var old;
        for (var i = 0; i < defs.length; ++i) {
            var def = defs[i];
            if (!(def.code || def.name) || !def.definition) {
                console.error("Unsupported SRS definition format", defs);
                throw new Error("Unsupported SRS definition format");
            }
            var code = def.code || def.name;
            var definition = def.definition;
            if (!/\+axis=\w+/.test(definition) && Mapbender.Projection.projectionHasNeuAxis(code)) {
                console.warn("Amending missing +axis=neu on srs definition", code, definition);
                definition = ['+axis=neu', definition].join(' ');
            }

            old = proj4.defs(code);
            if (!old || !keep) {
                if (old && warn) {
                    // projection object; no good way to check equality to new defintion => warn always
                    console.warn("Replacing existing proj4 2.x SRS definition", code, {old: old, new: definition});
                }
                proj4.defs(code, definition);
            }
        }
        if (window.proj4 && (((window.ol || {}).proj || {}).proj4 || {}).register) {
            // OpenLayers 6 special
            // https://github.com/openlayers/openlayers/blob/v6.3.1/changelog/upgrade-notes.md#changes-in-proj4-integration
            ol.proj.proj4.register(window.proj4);
        }
    },
    isDefined: function(name) {
        return !!proj4.defs(name);
    },

    /**
     * Transform coordinates between srs
     *
     * @param fromSrs
     * @param toSrs
     * @param coordinates
     * @return {*}
     */
    transform: function (fromSrs, toSrs, coordinates) {
        this.checkIfSrsIsDefined(fromSrs);
        this.checkIfSrsIsDefined(toSrs);

        return proj4.transform(proj4.Proj(fromSrs), proj4.Proj(toSrs), coordinates);
    },

    /**
     * Check if a srs is valid
     *
     * @param srs
     */
    checkIfSrsIsDefined: function (srs) {
        if (!proj4.defs(srs)) {
            throw new Error("SRS + " + srs + ' is not supported!');
        }
    }
});
