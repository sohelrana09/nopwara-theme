/*
 * Nopwara theme scripts.
 * Must load before alpine.min.js (for "alpine:init") and before jQuery (so our DOMContentLoaded
 * handler runs before jQuery ready callbacks); see Views/Shared/Head.cshtml.
 */
(function () {
    'use strict';

    var MAX_TOASTS = 3;

    // Drop-in replacement for core displayBarNotification(message, messagetype, timeout)
    function nopwaraBarNotification(message, messagetype, timeout) {
        var messages = typeof message === 'string' ? [message] : (message || []);
        if (messages.length === 0)
            return;

        var type = ['success', 'error', 'warning'].indexOf(messagetype) !== -1 ? messagetype : 'success';
        window.dispatchEvent(new CustomEvent('nopwara:notify', {
            detail: { messages: messages, type: type, timeout: timeout > 0 ? timeout : 0 }
        }));
    }

    /*
     * Required product attributes are checked in the browser before "Add to cart" / "Add to wishlist" posts
     * (product page, quick view, sticky bar): the missing ones get an inline message, the first is scrolled into view
     * and focused. The server still validates everything (and its messages still show as toasts).
     * Markup from core Views/Product/_ProductAttributes.cshtml: dt#product_attribute_label_{id} (.required when required)
     * + dd#product_attribute_input_{id}; attributes hidden by conditions are skipped.
     */
    var ATTRIBUTE_ERROR_CLASS = 'nopwara-attribute-error';

    function isVisible(element) {
        return !!element && element.offsetParent !== null;
    }

    function attributeIsFilled(input) {
        var controls = Array.prototype.filter.call(input.querySelectorAll('input, select, textarea'), function (control) {
            //quantity boxes of "customer enters qty" values are not the attribute value
            return /^product_attribute_/.test(control.name || '') && !/_qty$/.test(control.name);
        });
        if (!controls.length)
            return true;

        var choices = controls.filter(function (control) { return control.type === 'radio' || control.type === 'checkbox'; });
        if (choices.length)
            return choices.some(function (control) { return control.checked; });

        //dropdowns ("0" = Please select), date parts, text boxes, file upload (hidden download guid)
        return controls.every(function (control) {
            var value = (control.value || '').trim();
            return value !== '' && !(control.tagName === 'SELECT' && value === '0');
        });
    }

    function clearAttributeError(input) {
        input.querySelectorAll('.' + ATTRIBUTE_ERROR_CLASS).forEach(function (error) { error.remove(); });
        input.removeAttribute('data-invalid');
        var label = document.getElementById(input.id.replace('_input_', '_label_'));
        if (label)
            label.removeAttribute('data-invalid');
    }

    function validateAttributes(form) {
        if (!form)
            return true;

        var template = (form.querySelector('[data-select-attribute]') || {}).dataset;
        var messageFormat = (template && template.selectAttribute) || 'Please select {0}';
        var messages = [];
        var first = null;

        form.querySelectorAll('dd[id^="product_attribute_input_"]').forEach(function (input) {
            clearAttributeError(input);

            var label = document.getElementById(input.id.replace('_input_', '_label_'));
            if (!label || !label.querySelector('.required') || !isVisible(label) || !isVisible(input) || attributeIsFilled(input))
                return;

            var name = ((label.querySelector('.text-prompt') || label).textContent || '').trim();
            var message = messageFormat.replace('{0}', name);
            messages.push(message);

            var error = document.createElement('p');
            error.className = ATTRIBUTE_ERROR_CLASS + ' mt-1.5 text-sm font-medium text-red-600';
            error.setAttribute('role', 'alert');
            error.textContent = message;
            input.appendChild(error);
            input.setAttribute('data-invalid', 'true');
            label.setAttribute('data-invalid', 'true');

            //the message goes away as soon as the customer chooses a value (listeners added once per attribute)
            if (!input.hasAttribute('data-nopwara-watch')) {
                input.setAttribute('data-nopwara-watch', '');
                var clear = function () {
                    if (input.hasAttribute('data-invalid') && attributeIsFilled(input))
                        clearAttributeError(input);
                };
                input.addEventListener('change', clear);
                input.addEventListener('input', clear);
                input.addEventListener('click', function () { setTimeout(clear, 0); });
            }

            first = first || input;
        });

        if (!first)
            return true;

        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var control = first.querySelector('select, input:not([type=hidden]), textarea');
        if (control)
            control.focus({ preventScroll: true });
        nopwaraBarNotification(messages, 'error', 0);

        return false;
    }

    function guardAddToCart() {
        var cart = window.AjaxCart;
        if (!cart || cart.nopwaraAttributeCheck)
            return;
        cart.nopwaraAttributeCheck = true;

        var addFromDetails = cart.addproducttocart_details;
        cart.addproducttocart_details = function (url, formselector) {
            var form = window.jQuery ? window.jQuery(formselector)[0] : document.querySelector(formselector);
            if (!validateAttributes(form))
                return;

            return addFromDetails.apply(this, arguments);
        };
    }

    //used by plugins that post the product form themselves (Misc.NopwaraCheckout "Buy now")
    window.nopwaraValidateProductAttributes = validateAttributes;

    // public.common.js / public.ajaxcart.js (loaded after this file) define displayBarNotification and AjaxCart; adjust them once all scripts ran
    document.addEventListener('DOMContentLoaded', function () {
        window.displayBarNotification = nopwaraBarNotification;
        guardAddToCart();
    });

    document.addEventListener('alpine:init', function () {
        /*
         * Product details gallery (Views/Product/_ProductDetailsPictures.cshtml).
         * The main <img> and lightbox anchor keep their core ids because the core attribute-change
         * handler (_ProductAttributes.cshtml) rewrites their src/href directly with jQuery,
         * so this component updates the DOM imperatively instead of binding :src.
         */
        window.Alpine.data('nopwaraGallery', function (dataElementId, zoomEnabled) {
            return {
                pictures: [],
                active: 0,
                show3d: false,
                lightbox: false,
                lightboxIndex: 0,
                lightboxSrc: '',

                init: function () {
                    var dataEl = document.getElementById(dataElementId);
                    this.pictures = dataEl ? JSON.parse(dataEl.textContent) : [];
                },

                select: function (index) {
                    var picture = this.pictures[index];
                    if (!picture)
                        return;
                    this.active = index;
                    this.show3d = false;
                    var img = this.$refs.main;
                    img.src = picture.image;
                    img.alt = picture.alt || '';
                    img.title = picture.title || '';
                    if (this.$refs.anchor) {
                        this.$refs.anchor.href = picture.full;
                        this.$refs.anchor.title = picture.title || '';
                    }
                },

                select3d: function () {
                    this.show3d = true;
                },

                openLightbox: function () {
                    if (!zoomEnabled)
                        return;
                    // the anchor href may have been swapped by an attribute combination picture
                    this.lightboxIndex = this.active;
                    this.lightboxSrc = this.$refs.anchor ? this.$refs.anchor.href : (this.pictures[this.active] || {}).full;
                    this.lightbox = true;
                },

                step: function (delta) {
                    if (this.pictures.length < 2)
                        return;
                    this.lightboxIndex = (this.lightboxIndex + delta + this.pictures.length) % this.pictures.length;
                    this.lightboxSrc = this.pictures[this.lightboxIndex].full;
                }
            };
        });

        window.Alpine.data('nopwaraToasts', function () {
            return {
                toasts: [],
                nextId: 1,
                timers: {},

                add: function (detail) {
                    var toast = { id: this.nextId++, type: detail.type, messages: detail.messages };
                    this.toasts = this.toasts.concat(toast).slice(-MAX_TOASTS);
                    if (detail.timeout)
                        this.timers[toast.id] = setTimeout(this.remove.bind(this, toast.id), detail.timeout);
                },

                // like core: hovering a notification keeps it open
                pause: function (toast) {
                    clearTimeout(this.timers[toast.id]);
                    delete this.timers[toast.id];
                },

                remove: function (id) {
                    clearTimeout(this.timers[id]);
                    delete this.timers[id];
                    this.toasts = this.toasts.filter(function (t) { return t.id !== id; });
                }
            };
        });
    });
})();
