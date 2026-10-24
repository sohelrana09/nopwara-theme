/*
 * Nopwara: jQuery UI on demand.
 * Core loads jQuery UI (~250 KB) on every page, but only a few views use it (popups, date pickers, the price slider,
 * profile tabs). The theme's _Root.Head leaves it out; this stub loads it (script + CSS) the first time a widget is
 * called, then replays the call. Views that need jQuery UI synchronously (e.g. .data("ui-autocomplete") right after
 * .autocomplete()) register it themselves and this file does nothing.
 * Runs right after jQuery; window.nopwaraJqueryUi (Views/Shared/Head.cshtml) holds the file URLs.
 */
//leading ";": the nopCommerce bundler joins files as they are, so this must not continue the previous file's expression
;(function ($) {
    'use strict';

    if (!$ || $.ui || !window.nopwaraJqueryUi)
        return;

    var loading = null;
    var load = function () {
        if (loading)
            return loading;

        loading = new Promise(function (resolve, reject) {
            var css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = window.nopwaraJqueryUi.css;
            document.head.appendChild(css);

            var script = document.createElement('script');
            script.src = window.nopwaraJqueryUi.js;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return loading;
    };

    ['accordion', 'autocomplete', 'button', 'datepicker', 'dialog', 'draggable', 'droppable', 'menu', 'progressbar',
        'resizable', 'selectable', 'selectmenu', 'slider', 'sortable', 'spinner', 'tabs', 'tooltip'].forEach(function (name) {
        var stub = $.fn[name] = function () {
            var elements = this;
            var args = arguments;
            load().then(function () {
                //jQuery UI has replaced the stub by now
                if ($.fn[name] !== stub)
                    $.fn[name].apply(elements, args);
            });
            return this;
        };
    });

    window.nopwaraLoadJqueryUi = load;
})(window.jQuery);
