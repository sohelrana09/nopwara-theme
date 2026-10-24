/*
 * Nopwara runtime: the jQuery-free replacement for nopCommerce's public.common.js, public.ajaxcart.js,
 * public.countryselect.js, public.filterlevelselect.js, public.catalogproducts.js and jquery.validate(.unobtrusive).
 *
 * Theme code uses window.nw (nw.post, nw.html, nw.validate, nw.dialog, nw.cart, nw.catalog...). The global names core and
 * third-party plugin views still call (setLocation, addAntiForgeryToken, AjaxCart, displayBarNotification...) are defined
 * at the end as thin wrappers, so those views keep working without jQuery.
 *
 * Renders first of the theme scripts (see Views/Shared/Head.cshtml); Alpine renders last.
 */
(function () {
    'use strict';

    var nw = window.nw = window.nw || {};

    /* ---------------------------------------------------------------- requests */

    nw.token = function (root) {
        var input = (root && root.querySelector && root.querySelector('input[name=__RequestVerificationToken]'))
            || document.querySelector('input[name=__RequestVerificationToken]');
        return input ? input.value : '';
    };

    //form fields as URLSearchParams, like jQuery's serialize(): no files, no disabled fields, no unchecked boxes
    nw.serialize = function (form) {
        var params = new URLSearchParams();
        if (!form)
            return params;
        new FormData(form).forEach(function (value, name) {
            if (typeof value === 'string')
                params.append(name, value);
        });
        return params;
    };

    //accepts a form, FormData, URLSearchParams, a query string or a plain object (arrays become repeated names)
    function toParams(data) {
        if (!data)
            return new URLSearchParams();
        if (data instanceof URLSearchParams || data instanceof FormData)
            return data;
        if (data instanceof HTMLFormElement)
            return nw.serialize(data);
        if (typeof data === 'string')
            return new URLSearchParams(data);
        var params = new URLSearchParams();
        Object.keys(data).forEach(function (name) {
            var value = data[name];
            if (value === undefined || value === null)
                return;
            if (Array.isArray(value))
                value.forEach(function (v) { params.append(name, v); });
            else
                params.append(name, value);
        });
        return params;
    }
    nw.params = toParams;

    function parse(response) {
        if (!response.ok)
            throw new Error(response.status + ' ' + response.statusText);
        var type = response.headers.get('content-type') || '';
        return type.indexOf('json') !== -1 ? response.json() : response.text();
    }

    nw.post = function (url, data, options) {
        var body = toParams(data);
        if (!body.has('__RequestVerificationToken') && nw.token())
            body.append('__RequestVerificationToken', nw.token());
        return fetch(url, Object.assign({
            method: 'POST',
            body: body,
            credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }, options || {})).then(parse);
    };

    nw.get = function (url, data, options) {
        var query = toParams(data).toString();
        if (query)
            url += (url.indexOf('?') === -1 ? '?' : '&') + query;
        return fetch(url, Object.assign({
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        }, options || {})).then(parse);
    };

    /* ---------------------------------------------------------------- HTML with scripts */

    /*
     * Puts server HTML into the page and runs its scripts in order, as jQuery's .html() did:
     * mode 'inner' (default) replaces the children, 'outer' replaces the element, 'append' adds to the end.
     * Alpine picks up new x-data on its own (MutationObserver). Resolves with the inserted nodes once scripts ran.
     */
    nw.html = function (el, html, mode) {
        if (typeof el === 'string')
            el = document.querySelector(el);
        if (!el)
            return Promise.resolve([]);
        var template = document.createElement('template');
        template.innerHTML = html == null ? '' : html;
        var scripts = Array.prototype.slice.call(template.content.querySelectorAll('script'));
        var nodes = Array.prototype.slice.call(template.content.childNodes);
        if (mode === 'outer')
            el.replaceWith(template.content);
        else if (mode === 'append')
            el.appendChild(template.content);
        else
            el.replaceChildren(template.content);
        return scripts.reduce(function (chain, old) {
            return chain.then(function () { return runScript(old); });
        }, Promise.resolve()).then(function () { return nodes; });
    };

    function runScript(old) {
        var type = (old.getAttribute('type') || '').toLowerCase();
        if (type && type !== 'text/javascript' && type !== 'module' && type !== 'application/javascript')
            return Promise.resolve();
        return new Promise(function (resolve) {
            var script = document.createElement('script');
            Array.prototype.forEach.call(old.attributes, function (a) { script.setAttribute(a.name, a.value); });
            if (old.src) {
                script.onload = script.onerror = resolve;
                script.async = false;
            } else {
                script.textContent = old.textContent;
            }
            old.replaceWith(script);
            if (!old.src)
                resolve();
        });
    }

    //runs fn when the DOM is ready (replacement for $(fn))
    nw.ready = function (fn) {
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', fn);
        else
            fn();
    };

    nw.on = function (type, selector, handler) {
        document.addEventListener(type, function (e) {
            var target = e.target.closest ? e.target.closest(selector) : null;
            if (target)
                handler.call(target, e, target);
        }, type === 'blur' || type === 'focus');
    };

    nw.encode = function (value) {
        var div = document.createElement('div');
        div.textContent = value == null ? '' : value;
        return div.innerHTML;
    };

    /* ---------------------------------------------------------------- validation */

    /*
     * Client validation from the data-val-* attributes the server renders (what jquery.validate.unobtrusive read):
     * required, email, length/minlength/maxlength, regex, equalto, range, number. Messages go to
     * span[data-valmsg-for] and the [data-valmsg-summary] list with core's CSS classes.
     * Every form is covered through document-level listeners, including HTML injected later.
     * A submit button with formnovalidate or class "cancel" skips validation, as with jquery.validate.
     */
    var EMAIL = /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    function isHidden(field) {
        return field.type === 'hidden' || !(field.offsetWidth || field.offsetHeight || field.getClientRects().length);
    }

    function fieldValue(field) {
        if (field.type === 'checkbox' || field.type === 'radio') {
            var form = field.form || document;
            var checked = form.querySelector('input[name="' + CSS.escape(field.name) + '"]:checked');
            return checked ? checked.value : '';
        }
        return field.value == null ? '' : field.value;
    }

    function otherField(field, other) {
        //"*.Password" refers to a field with the same prefix
        var name = other.indexOf('*.') === 0 ? field.name.replace(/[^.]*$/, '') + other.substring(2) : other;
        var form = field.form || document;
        return form.querySelector('[name="' + CSS.escape(name) + '"]');
    }

    function fieldError(field) {
        var d = field.dataset;
        if (d.val !== 'true' || field.disabled)
            return '';
        var value = fieldValue(field);
        var trimmed = String(value).trim();
        //"required" on a checkbox means "not null" (a bool), never "must be ticked", as in jquery.validate.unobtrusive
        if (d.valRequired !== undefined && field.type !== 'checkbox' && trimmed === '')
            return d.valRequired;
        if (trimmed === '')
            return '';
        if (d.valEmail !== undefined && !EMAIL.test(trimmed))
            return d.valEmail;
        if (d.valLength !== undefined) {
            if ((d.valLengthMax && value.length > +d.valLengthMax) || (d.valLengthMin && value.length < +d.valLengthMin))
                return d.valLength;
        }
        if (d.valMaxlength !== undefined && d.valMaxlengthMax && value.length > +d.valMaxlengthMax)
            return d.valMaxlength;
        if (d.valMinlength !== undefined && d.valMinlengthMin && value.length < +d.valMinlengthMin)
            return d.valMinlength;
        if (d.valRegex !== undefined && d.valRegexPattern) {
            var match = new RegExp(d.valRegexPattern).exec(value);
            if (!match || match.index !== 0 || match[0].length !== value.length)
                return d.valRegex;
        }
        if (d.valNumber !== undefined && isNaN(Number(trimmed.replace(',', '.'))))
            return d.valNumber;
        if (d.valRange !== undefined) {
            var n = Number(trimmed.replace(',', '.'));
            if (isNaN(n) || (d.valRangeMin !== undefined && d.valRangeMin !== '' && n < +d.valRangeMin) || (d.valRangeMax !== undefined && d.valRangeMax !== '' && n > +d.valRangeMax))
                return d.valRange;
        }
        if (d.valEqualto !== undefined && d.valEqualtoOther) {
            var other = otherField(field, d.valEqualtoOther);
            if (other && other.value !== value)
                return d.valEqualto;
        }
        return '';
    }

    function messageFor(field) {
        var form = field.form || document;
        return form.querySelector('[data-valmsg-for="' + CSS.escape(field.name) + '"]');
    }

    function showFieldError(field, message) {
        field.classList.toggle('input-validation-error', !!message);
        field.classList.toggle('input-validation-valid', !message);
        if (message)
            field.setAttribute('aria-invalid', 'true');
        else
            field.removeAttribute('aria-invalid');
        var holder = messageFor(field);
        if (!holder)
            return;
        holder.classList.toggle('field-validation-error', !!message);
        holder.classList.toggle('field-validation-valid', !message);
        if (holder.dataset.valmsgReplace !== 'false')
            holder.textContent = message;
    }

    //hidden fields (display:none, collapsed sections, type=hidden) are skipped, as jquery.validate's default "ignore: :hidden"
    function validateField(field) {
        if (!field.name || isHidden(field))
            return '';
        var message = fieldError(field);
        showFieldError(field, message);
        return message;
    }

    function fields(root) {
        return Array.prototype.slice.call(root.querySelectorAll('[data-val="true"]'));
    }

    function showSummary(form, messages) {
        form.querySelectorAll('[data-valmsg-summary="true"]').forEach(function (summary) {
            summary.classList.toggle('validation-summary-errors', messages.length > 0);
            summary.classList.toggle('validation-summary-valid', messages.length === 0);
            var list = summary.querySelector('ul');
            if (!list)
                return;
            list.replaceChildren();
            messages.forEach(function (m) {
                var li = document.createElement('li');
                li.textContent = m;
                list.appendChild(li);
            });
        });
    }

    //validates a form (or any container); returns true when valid, focuses the first invalid field otherwise
    nw.validate = function (form) {
        if (typeof form === 'string')
            form = document.querySelector(form);
        if (!form)
            return true;
        var messages = [], first = null, seen = {};
        fields(form).forEach(function (field) {
            if (seen[field.name] && (field.type === 'radio' || field.type === 'checkbox'))
                return;
            seen[field.name] = true;
            var message = validateField(field);
            if (message) {
                messages.push(message);
                first = first || field;
            }
        });
        if (form.tagName === 'FORM')
            showSummary(form, messages);
        if (first) {
            first.scrollIntoView({ behavior: 'smooth', block: 'center' });
            first.focus({ preventScroll: true });
        }
        return !first;
    };

    //clears messages (e.g. before re-showing a form)
    nw.resetValidation = function (form) {
        fields(form).forEach(function (field) { showFieldError(field, ''); });
        if (form.tagName === 'FORM')
            showSummary(form, []);
    };

    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!(form instanceof HTMLFormElement) || !form.querySelector('[data-val="true"]'))
            return;
        var submitter = e.submitter;
        if (submitter && (submitter.hasAttribute('formnovalidate') || submitter.classList.contains('cancel')))
            return;
        if (!nw.validate(form)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    //after a field was left once, it is re-checked as the shopper types (like jquery.validate)
    document.addEventListener('focusout', function (e) {
        var field = e.target;
        if (field.dataset && field.dataset.val === 'true' && field.form) {
            field.dataset.nwTouched = 'true';
            validateField(field);
        }
    });
    ['input', 'change'].forEach(function (type) {
        document.addEventListener(type, function (e) {
            var field = e.target;
            if (!field.dataset || field.dataset.val !== 'true')
                return;
            if (field.dataset.nwTouched === 'true' || type === 'change' || field.classList.contains('input-validation-error'))
                validateField(field);
        });
    });

    /* ---------------------------------------------------------------- notifications and dialogs */

    //toast (Views/Shared/_Notifications.cshtml renders them); same arguments as core displayBarNotification
    nw.notify = function (message, type, timeout) {
        var messages = typeof message === 'string' ? [message] : (message || []);
        if (!messages.length)
            return;
        type = ['success', 'error', 'warning'].indexOf(type) !== -1 ? type : 'success';
        window.dispatchEvent(new CustomEvent('nopwara:notify', {
            detail: { messages: messages, type: type, timeout: timeout > 0 ? timeout : 0 }
        }));
    };

    nw.loading = function (show) {
        document.querySelectorAll('.ajax-loading-block-window').forEach(function (el) {
            el.style.display = show ? 'block' : 'none';
        });
    };

    /*
     * Modal dialog (native <dialog>): nw.dialog({ html | url, title, width, className, onClose }) → { el, body, close() }.
     * Replaces jQuery UI .dialog(), displayPopupContentFromUrl and popup notifications. Esc and a click on the backdrop close it.
     */
    nw.dialog = function (options) {
        options = options || {};
        var dialog = document.createElement('dialog');
        dialog.className = 'nw-dialog ' + (options.className || '');
        if (options.width)
            dialog.style.width = typeof options.width === 'number' ? options.width + 'px' : options.width;
        var closeText = (document.getElementById('bar-notification') || { dataset: {} }).dataset.close || 'Close';
        dialog.innerHTML =
            '<div class="nw-dialog-head">' +
            '<h2 class="nw-dialog-title"></h2>' +
            '<button type="button" class="nw-dialog-close" data-nw-close aria-label="' + nw.encode(closeText) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>' +
            '</button></div><div class="nw-dialog-body"></div>';
        dialog.querySelector('.nw-dialog-title').textContent = options.title || '';
        var body = dialog.querySelector('.nw-dialog-body');
        document.body.appendChild(dialog);

        var api = {
            el: dialog,
            body: body,
            close: function () { dialog.close(); }
        };
        dialog.addEventListener('close', function () {
            if (options.onClose)
                options.onClose(api);
            dialog.remove();
        });
        dialog.addEventListener('click', function (e) {
            if (e.target === dialog || e.target.closest('[data-nw-close]'))
                dialog.close();
        });

        dialog.showModal();
        if (options.url) {
            body.classList.add('nw-dialog-loading');
            nw.get(options.url).then(function (html) {
                body.classList.remove('nw-dialog-loading');
                return nw.html(body, html);
            }).catch(function () {
                body.classList.remove('nw-dialog-loading');
                body.textContent = '—';
            });
        } else if (options.html !== undefined) {
            nw.html(body, options.html);
        }
        return api;
    };

    function popupMessages(message) {
        var list = typeof message === 'string' ? [message] : (message || []);
        //messages are server HTML (as in core): not encoded
        return list.map(function (m) { return '<p>' + m + '</p>'; }).join('');
    }

    //server messages as one popup: { success: [...], warning: [...], error: [...] }
    nw.popupNotifications = function (notes) {
        var html = '';
        Object.keys(notes || {}).forEach(function (type) {
            (notes[type] || []).forEach(function (m) { html += '<div class="popup-notification ' + type + '">' + m + '</div>'; });
        });
        if (html)
            nw.dialog({ html: html, width: 380 });
    };

    /* ---------------------------------------------------------------- shopping cart */

    /*
     * Ajax cart (replaces core AjaxCart). nw.cart.init(...) is called by the header links view.
     * Every response goes through success(): header counts, flyout cart, toast/popup, redirect; then
     * "nopwara:cart-updated" (always) and "nopwara:product-added" (on success) are dispatched on window.
     */
    var cart = nw.cart = {
        busy: false,
        popup: false,
        cartSelector: '.header-links .cart-qty',
        wishlistSelector: '.header-links .wishlist-qty',
        flyoutSelector: '#flyout-cart',
        failure: 'Failed to add the product. Please refresh the page and try one more time.',

        init: function (usePopup, cartSelector, wishlistSelector, flyoutSelector, localized) {
            this.busy = false;
            this.popup = !!usePopup;
            this.cartSelector = cartSelector || this.cartSelector;
            this.wishlistSelector = wishlistSelector || this.wishlistSelector;
            this.flyoutSelector = flyoutSelector || this.flyoutSelector;
            if (localized && localized.AjaxCartFailure)
                this.failure = localized.AjaxCartFailure;
        },

        send: function (url, data) {
            if (this.busy)
                return Promise.resolve(null);
            this.busy = true;
            nw.loading(true);
            var self = this;
            return nw.post(url, data)
                .then(function (response) {
                    self.success(response);
                    return response;
                })
                .catch(function () {
                    window.alert(self.failure);
                    return null;
                })
                .finally(function () {
                    self.busy = false;
                    nw.loading(false);
                });
        },

        success: function (response) {
            if (!response || typeof response !== 'object')
                return false;
            if (response.updatetopcartsectionhtml)
                document.querySelectorAll(cart.cartSelector).forEach(function (el) { el.innerHTML = response.updatetopcartsectionhtml; });
            if (response.updatetopwishlistsectionhtml)
                document.querySelectorAll(cart.wishlistSelector).forEach(function (el) { el.innerHTML = response.updatetopwishlistsectionhtml; });
            if (response.updateflyoutcartsectionhtml) {
                var flyout = document.querySelector(cart.flyoutSelector);
                if (flyout)
                    nw.html(flyout, response.updateflyoutcartsectionhtml, 'outer');
            }
            window.dispatchEvent(new CustomEvent('nopwara:cart-updated', { detail: response }));
            if (response.success === true)
                window.dispatchEvent(new CustomEvent('nopwara:product-added', { detail: response }));
            if (response.message) {
                if (cart.popup)
                    nw.dialog({ html: popupMessages(response.message), className: response.success === true ? 'success' : 'error', width: 380 });
                else
                    nw.notify(response.message, response.success === true ? 'success' : 'error', response.success === true ? 3500 : 0);
                return false;
            }
            if (response.redirect) {
                location.href = response.redirect;
                return true;
            }
            return false;
        },

        //catalog "Add to cart" / "Add to wishlist" (no form)
        catalog: function (url) {
            return this.send(url, {});
        },

        //product page: posts the product form after the attribute and field checks
        details: function (url, form) {
            if (typeof form === 'string')
                form = document.querySelector(form);
            if (form && window.nopwaraValidateProductAttributes && !window.nopwaraValidateProductAttributes(form))
                return Promise.resolve(null);
            if (form && !nw.validate(form))
                return Promise.resolve(null);
            return this.send(url, nw.serialize(form));
        },

        compare: function (url) {
            return this.send(url, {});
        },

        moveToCustomWishlist: function (url, itemId, wishlistId) {
            return this.send(url, { shoppingCartItemId: itemId, customWishlistId: wishlistId });
        },

        createCustomWishlist: function (url, name, productId) {
            return this.send(url, { name: name, productId: productId });
        },

        deleteCustomWishlist: function (url) {
            return this.send(url, {});
        },

        moveToWishlist: function (url, wishlistId) {
            return this.send(url, { wishlistId: wishlistId });
        }
    };

    /* ---------------------------------------------------------------- product attributes */

    function show(el, visible) {
        if (el)
            el.style.display = visible ? '' : 'none';
    }

    function setText(id, value, parentClass) {
        var el = document.getElementById(id);
        if (!el)
            return;
        var parent = parentClass && el.parentElement && el.parentElement.classList.contains(parentClass) ? el.parentElement : null;
        if (value) {
            el.textContent = value;
            show(parent, true);
        } else {
            show(parent || (parentClass ? null : el), false);
        }
    }

    /*
     * Product attribute change (core attribute_change_handler_{id}, also used for rental dates): posts the product form,
     * updates price, base price, SKU/MPN/GTIN, stock, conditional attributes and the picture, then dispatches
     * "nopwara:attributes-changed" { productId, data } (and "nopwara:picture" for the gallery).
     * o: { productId, url, form (selector), prefix (attribute id prefix), imagesOnly }
     */
    nw.attributeChange = function (o) {
        var form = document.querySelector(o.form || '#product-details-form');
        return nw.post(o.url, nw.serialize(form)).then(function (data) {
            var id = o.productId;
            if (data.price)
                document.querySelectorAll('.price-value-' + id).forEach(function (el) { el.textContent = data.price; });
            var basePrice = document.getElementById('base-price-pangv-' + id);
            if (basePrice) {
                if (data.basepricepangv)
                    basePrice.textContent = data.basepricepangv;
                else
                    show(basePrice, false);
            }
            setText('sku-' + id, data.sku, 'sku');
            setText('mpn-' + id, data.mpn, 'manufacturer-part-number');
            setText('gtin-' + id, data.gtin, 'gtin');
            if (data.stockAvailability) {
                var stock = document.getElementById('stock-availability-value-' + id);
                if (stock)
                    stock.textContent = data.stockAvailability;
            }
            (data.enabledattributemappingids || []).forEach(function (mappingId) {
                show(document.getElementById(o.prefix + 'label_' + mappingId), true);
                show(document.getElementById(o.prefix + 'input_' + mappingId), true);
            });
            (data.disabledattributemappingids || []).forEach(function (mappingId) {
                show(document.getElementById(o.prefix + 'label_' + mappingId), false);
                show(document.getElementById(o.prefix + 'input_' + mappingId), false);
            });
            if (data.pictureDefaultSizeUrl || data.pictureFullSizeUrl) {
                window.dispatchEvent(new CustomEvent('nopwara:picture', {
                    detail: { productId: id, image: data.pictureDefaultSizeUrl, full: data.pictureFullSizeUrl || data.pictureDefaultSizeUrl }
                }));
                //pages without the Nopwara gallery (e.g. quick view): update the core elements directly
                var img = document.getElementById('main-product-img-' + id);
                if (img && data.pictureDefaultSizeUrl && !img.closest('[data-product-id]'))
                    img.src = data.pictureDefaultSizeUrl;
                var anchor = document.getElementById('main-product-img-lightbox-anchor-' + id);
                if (anchor && data.pictureFullSizeUrl && !anchor.closest('[data-product-id]'))
                    anchor.href = data.pictureFullSizeUrl;
            }
            if (o.imagesOnly && data.pictureIds) {
                document.querySelectorAll('.thumb-item').forEach(function (thumb) {
                    var pictureId = parseInt(thumb.dataset.pictureid, 10);
                    show(thumb, data.pictureIds.length === 0 || data.pictureIds.indexOf(pictureId) !== -1);
                });
            }
            if (data.message)
                window.alert(data.message);
            window.dispatchEvent(new CustomEvent('nopwara:attributes-changed', { detail: { productId: id, data: data } }));
            return data;
        });
    };

    /*
     * "Only existing combinations" with out-of-stock values disabled (core public.combinationsbehavior.js):
     * loads the product's combinations and marks unavailable values (.disabled), then dispatches "processed" on itself.
     * settings: { contentEl (selector), fetchUrl }
     */
    nw.combinations = function (settings) {
        var target = new EventTarget();
        var root = function () { return document.querySelector(settings.contentEl) || document; };
        var all = function (selector, scope) { return Array.prototype.slice.call((scope || root()).querySelectorAll(selector)); };
        var behavior = {
            available: [],
            attributeIds: [],

            on: function (type, handler) { target.addEventListener(type, handler); },

            init: function () {
                var self = this;
                all('[data-attr]').forEach(function (attribute) {
                    self.attributeIds.push(parseInt(attribute.dataset.attr, 10));
                    attribute.addEventListener('change', function () { self.process(); });
                });
                nw.get(settings.fetchUrl).then(function (response) {
                    self.available = response || [];
                    self.getSelected().filter(function (a) { return a.values.length > 0; }).forEach(function (attribute) {
                        var combinations = self.byAttribute(attribute.id, [attribute]);
                        if (!combinations || !combinations.length || !self.isAvailable(combinations, [attribute]))
                            self.unselect(attribute.values);
                    });
                    self.process();
                }).catch(function () { self.available = []; });
            },

            valueIds: function (attributeId) {
                var scope = attributeId ? root().querySelector('[data-attr="' + attributeId + '"]') : root();
                return scope ? all('[data-attr-value]', scope).map(function (v) { return parseInt(v.dataset.attrValue, 10); }) : [];
            },

            toggle: function (valueId, enabled) {
                all('[data-attr-value="' + valueId + '"]').forEach(function (v) { v.classList.toggle('disabled', !enabled); });
            },

            unselect: function (valueIds) {
                valueIds.forEach(function (valueId) {
                    all('[data-attr-value="' + valueId + '"]').forEach(function (v) {
                        if (v.tagName === 'OPTION')
                            v.selected = false;
                        v.querySelectorAll('input').forEach(function (input) { input.checked = false; });
                        v.classList.remove('selected-value');
                    });
                });
            },

            getSelected: function () {
                return this.attributeIds.map(function (attributeId) {
                    var attribute = root().querySelector('[data-attr="' + attributeId + '"]');
                    var values = [];
                    if (attribute) {
                        all('[data-attr-value]', attribute).forEach(function (v) {
                            var input = v.querySelector('input');
                            if (v.selected || (input && input.checked))
                                values.push(parseInt(v.dataset.attrValue, 10));
                        });
                    }
                    return { id: attributeId, values: values };
                });
            },

            byAttribute: function (attributeId, processed) {
                if (!this.available.length)
                    return;
                return this.available.filter(function (combination) {
                    var found = combination.Attributes.some(function (a) { return a.Id === attributeId; });
                    (processed || []).forEach(function (p) {
                        found = found && combination.Attributes.some(function (a) {
                            return a.Id === p.id && p.values.every(function (id) { return a.ValueIds.indexOf(id) !== -1; });
                        });
                    });
                    return found;
                });
            },

            isAvailable: function (combinations, attributes) {
                return combinations.some(function (combination) {
                    var ids = [];
                    combination.Attributes.forEach(function (a) { ids = ids.concat(a.ValueIds); });
                    var matched = attributes.filter(function (attribute) {
                        return attribute.values.some(function (id) { return ids.indexOf(id) !== -1; });
                    });
                    return combination.InStock && matched.length === attributes.length;
                });
            },

            process: function () {
                var self = this;
                if (!this.attributeIds.length)
                    return;
                if (!this.available.length) {
                    this.valueIds().forEach(function (valueId) { self.toggle(valueId, false); });
                    return;
                }
                var selected = this.getSelected();
                this.attributeIds.forEach(function (attributeId, attrIndex) {
                    self.valueIds(attributeId).forEach(function (valueId) {
                        var attributes = selected.filter(function (a, selectedIndex) {
                            return attrIndex > selectedIndex && a.id !== attributeId && a.values.length > 0;
                        });
                        attributes.push({ id: attributeId, values: [valueId] });
                        var combinations = self.byAttribute(attributeId, attributes);
                        self.toggle(valueId, !!(combinations && combinations.length && self.isAvailable(combinations, attributes)));
                    });
                });
                target.dispatchEvent(new CustomEvent('processed'));
            }
        };
        return behavior;
    };

    /* ---------------------------------------------------------------- catalog products */

    function urlBuilder(basePath) {
        return {
            params: { basePath: basePath, query: {} },
            addBasePath: function (url) {
                this.params.basePath = url;
                return this;
            },
            addParameter: function (name, value) {
                this.params.query[name] = value;
                return this;
            },
            build: function () {
                var query = toParams(this.params.query).toString();
                var url = this.params.basePath;
                return url.indexOf('?') !== -1 ? url + '&' + query : url + '?' + query;
            }
        };
    }
    nw.urlBuilder = urlBuilder;

    /*
     * Catalog products (replaces core CatalogProducts): filters, sorting, page size, view mode and paging
     * call nw.catalog.getProducts(page). Listeners: nw.catalog.on('before', e => e.detail.urlBuilder.addParameter(...)),
     * 'loaded' (detail.append for "show more"), 'error'. The theme's nopwara.js adds history and "show more".
     */
    var events = new EventTarget();
    var catalog = nw.catalog = {
        settings: { ajax: false, fetchUrl: false, browserPath: false },
        controller: null,

        init: function (settings) {
            this.settings = Object.assign({}, this.settings, settings);
        },

        on: function (type, handler) {
            events.addEventListener(type, handler);
        },

        off: function (type, handler) {
            events.removeEventListener(type, handler);
        },

        trigger: function (type, detail) {
            events.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
        },

        //builds the URL for a page with all current filters ('before' listeners add their parameters)
        buildUrl: function (pageNumber) {
            var builder = urlBuilder(this.settings.browserPath);
            if (pageNumber)
                builder.addParameter('pagenumber', pageNumber);
            this.trigger('before', { urlBuilder: builder });
            return builder;
        },

        getProducts: function (pageNumber, append) {
            if (this.controller)
                this.controller.abort();
            var builder = this.buildUrl(pageNumber);
            if (!append)
                this.setBrowserHistory(builder.build());
            if (!this.settings.ajax) {
                location.href = builder.build();
                return Promise.resolve();
            }
            this.setLoadWaiting(true);
            var controller = this.controller = new AbortController();
            var self = this;
            return nw.post(this.settings.fetchUrl, builder.params.query, { signal: controller.signal })
                .then(function (html) {
                    var wrapper = document.querySelector('.products-wrapper');
                    if (append)
                        return self.appendProducts(wrapper, html);
                    return nw.html(wrapper, html).then(function () {
                        var page = document.querySelector('.center-2 .page') || wrapper;
                        if (page && page.getBoundingClientRect().top < 0)
                            page.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                })
                .then(function () { self.trigger('loaded', { append: !!append, pageNumber: pageNumber }); })
                .catch(function (err) {
                    if (err && err.name === 'AbortError')
                        return;
                    self.trigger('error', { error: err });
                })
                .finally(function () {
                    if (self.controller === controller) {
                        self.controller = null;
                        self.setLoadWaiting(false);
                    }
                });
        },

        //"show more": the new page's product items go after the current ones, its pager replaces the current pager
        appendProducts: function (wrapper, html) {
            var template = document.createElement('template');
            template.innerHTML = html;
            var grid = wrapper.querySelector('.product-grid .item-grid, .product-list .item-grid, .item-grid');
            var incoming = template.content.querySelector('.item-grid');
            if (!grid || !incoming)
                return nw.html(wrapper, html);
            var chain = nw.html(grid, incoming.innerHTML, 'append');
            var pager = wrapper.querySelector('.pager');
            var newPager = template.content.querySelector('.pager');
            if (pager && newPager)
                pager.replaceWith(newPager);
            else if (pager)
                pager.remove();
            var more = wrapper.querySelector('.load-more');
            var newMore = template.content.querySelector('.load-more');
            if (more && newMore)
                more.replaceWith(newMore);
            else if (more)
                more.remove();
            return chain;
        },

        setLoadWaiting: function (enable) {
            document.querySelectorAll('.ajax-products-busy').forEach(function (el) {
                el.style.display = enable ? 'block' : 'none';
            });
        },

        setBrowserHistory: function (url) {
            window.history.replaceState({ path: url }, '', url);
        }
    };

    /* ---------------------------------------------------------------- dependent selects */

    function fillSelect(select, options) {
        select.replaceChildren();
        options.forEach(function (o) {
            var option = document.createElement('option');
            option.value = o.value;
            option.textContent = o.text;
            select.appendChild(option);
        });
    }

    function toggle(selector, show) {
        if (!selector)
            return;
        document.querySelectorAll(selector).forEach(function (el) { el.style.display = show ? '' : 'none'; });
    }

    //country → state/province (data-trigger="country-select", data-url, data-stateprovince, data-loading)
    nw.on('change', 'select[data-trigger="country-select"]', function (e, select) {
        var state = document.querySelector(select.dataset.stateprovince);
        if (!state)
            return;
        var selected = state.dataset.selectedState || state.value;
        toggle(select.dataset.loading, true);
        nw.get(select.dataset.url, { countryId: select.value, addSelectStateItem: 'true' })
            .then(function (data) {
                fillSelect(state, data.map(function (o) { return { value: o.id, text: o.name }; }));
                if (selected && state.querySelector('option[value="' + CSS.escape(String(selected)) + '"]'))
                    state.value = selected;
                state.dispatchEvent(new Event('change', { bubbles: true }));
            })
            .catch(function () { window.alert('Failed to retrieve states.'); })
            .finally(function () { toggle(select.dataset.loading, false); });
    });

    //filter levels (data-trigger="filter-level1-select" / "filter-level2-select")
    nw.on('change', 'select[data-trigger="filter-level1-select"]', function (e, select) {
        var level2 = document.querySelector(select.dataset.filterlevel2);
        var level3 = document.querySelector(select.dataset.filterlevel3);
        if (!level2)
            return;
        var value = select.value;
        toggle(select.dataset.loading, true);
        nw.get(select.dataset.url, { filterLevel1Value: value, filterLevel2Value: '', filterLevel3Value: '' })
            .then(function (data) {
                var options = value !== '' && data.length ? [{ value: '', text: data[0].defaultItemText }] : [];
                data.forEach(function (item) {
                    if (item.filterLevel1Value === value)
                        options.push({ value: item.filterLevel2Value, text: item.filterLevel2Value });
                });
                fillSelect(level2, options);
                if (level3)
                    fillSelect(level3, [{ value: '0', text: '' }]);
                level2.dispatchEvent(new Event('nw:filled', { bubbles: true }));
            })
            .catch(function () { window.alert('Failed to retrieve filter level 2 values.'); })
            .finally(function () { toggle(select.dataset.loading, false); });
    });

    nw.on('change', 'select[data-trigger="filter-level2-select"]', function (e, select) {
        var level1 = document.querySelector(select.dataset.filterlevel1);
        var level3 = document.querySelector(select.dataset.filterlevel3);
        if (!level3)
            return;
        var value = select.value, first = level1 ? level1.value : '';
        toggle(select.dataset.loading, true);
        nw.get(select.dataset.url, { filterLevel1Value: first, filterLevel2Value: value, filterLevel3Value: '' })
            .then(function (data) {
                var options = data.length ? [{ value: '', text: data[0].defaultItemText }] : [];
                data.forEach(function (item) {
                    if (item.filterLevel1Value === first && item.filterLevel2Value === value)
                        options.push({ value: item.filterLevel3Value, text: item.filterLevel3Value });
                });
                fillSelect(level3, options);
                level3.dispatchEvent(new Event('nw:filled', { bubbles: true }));
            })
            .catch(function () { window.alert('Failed to retrieve filter level 3 values.'); })
            .finally(function () { toggle(select.dataset.loading, false); });
    });

    //Enter in a single-field box (discount code, gift card, newsletter...) clicks its button: data-nw-enter="#button"
    nw.on('keydown', '[data-nw-enter]', function (e, input) {
        if (e.key !== 'Enter')
            return;
        e.preventDefault();
        var button = document.querySelector(input.dataset.nwEnter);
        if (button)
            button.click();
    });

    //select-all checkbox for a list: data-nw-select-all=".selector-of-row-checkboxes"
    nw.on('change', '[data-nw-select-all]', function (e, box) {
        document.querySelectorAll(box.dataset.nwSelectAll).forEach(function (row) { row.checked = box.checked; });
    });
    document.addEventListener('change', function (e) {
        var row = e.target;
        if (row.type !== 'checkbox' || row.matches('[data-nw-select-all]'))
            return;
        document.querySelectorAll('[data-nw-select-all]').forEach(function (all) {
            var rows = document.querySelectorAll(all.dataset.nwSelectAll);
            if (Array.prototype.indexOf.call(rows, row) !== -1)
                all.checked = Array.prototype.every.call(rows, function (r) { return r.checked; });
        });
    });

    //buttons that only navigate: data-nw-href="url" (core used onclick="setLocation(...)")
    nw.on('click', '[data-nw-href]', function (e, el) {
        e.preventDefault();
        location.href = el.dataset.nwHref;
    });

    //confirm before a link/button/form submit: data-nw-confirm="Are you sure?"
    document.addEventListener('click', function (e) {
        var el = e.target.closest && e.target.closest('[data-nw-confirm]');
        if (el && el.tagName !== 'FORM' && !window.confirm(el.dataset.nwConfirm)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    /* ---------------------------------------------------------------- Alpine helpers */

    document.addEventListener('alpine:init', function () {
        /*
         * Tabs: <div x-data="nwTabs"> with [data-nw-tab="id"] buttons and [data-nw-panel="id"] panels
         * (the first tab is active unless one has data-nw-active).
         */
        window.Alpine.data('nwTabs', function () {
            return {
                tab: '',
                init: function () {
                    var active = this.$el.querySelector('[data-nw-tab][data-nw-active]') || this.$el.querySelector('[data-nw-tab]');
                    if (location.hash && this.$el.querySelector('[data-nw-tab="' + CSS.escape(location.hash.substring(1)) + '"]'))
                        active = this.$el.querySelector('[data-nw-tab="' + CSS.escape(location.hash.substring(1)) + '"]');
                    this.tab = active ? active.dataset.nwTab : '';
                }
            };
        });
    });

    /* ---------------------------------------------------------------- core global names (no jQuery) */

    window.setLocation = function (url) { window.location.href = url; };
    window.OpenWindow = function (query, w, h, scroll) {
        var l = (screen.width - w) / 2, t = (screen.height - h) / 2;
        window.open(query, '_blank', 'resizable=0,height=' + h + ',width=' + w + ',top=' + t + ',left=' + l + (scroll ? ',scrollbars=1' : ''));
    };
    window.addAntiForgeryToken = function (data) {
        data = data || {};
        var token = nw.token();
        if (token)
            data.__RequestVerificationToken = token;
        return data;
    };
    window.displayAjaxLoading = nw.loading;
    window.displayBarNotification = nw.notify;
    window.displayPopupNotification = function (message, type) {
        nw.dialog({ html: popupMessages(message), className: type || 'success', width: 380 });
    };
    window.displayJoinedPopupNotifications = nw.popupNotifications;
    window.displayPopupContentFromUrl = function (url, title, modal, width) {
        return nw.dialog({ url: url, title: title, width: width || 550 });
    };
    window.htmlEncode = nw.encode;
    window.htmlDecode = function (value) {
        var div = document.createElement('div');
        div.innerHTML = value;
        return div.textContent;
    };
    window.createProductsURLBuilder = urlBuilder;
    window.CatalogProducts = catalog;
    window.AjaxCart = {
        init: function () { cart.init.apply(cart, arguments); },
        setLoadWaiting: function (display) { nw.loading(display); },
        resetLoadWaiting: function () { nw.loading(false); },
        addproducttocart_catalog: function (url) { return cart.catalog(url); },
        addproducttocart_details: function (url, formselector) { return cart.details(url, formselector); },
        addproducttocomparelist: function (url) { return cart.compare(url); },
        moveToCustomWishlist: function (url, itemId, wishlistId) { return cart.moveToCustomWishlist(url, itemId, wishlistId); },
        createCustomWishlist: function (url, name, productId) { return cart.createCustomWishlist(url, name, productId); },
        deleteCustomWishlist: function (url) { return cart.deleteCustomWishlist(url); },
        moveproducttowishlist: function (url, wishlistId) { return cart.moveToWishlist(url, wishlistId); },
        success_process: function (response) { return cart.success(response); }
    };
})();
