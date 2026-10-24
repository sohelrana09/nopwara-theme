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
        /*
         * Header search box (Views/Shared/Components/SearchBox/Default.cshtml): submit (minimum length, category → advanced
         * search) and core's autocomplete as a fallback when the Nopwara instant search plugin isn't active.
         */
        window.Alpine.data('nopwaraSearchBox', function (o) {
            var cache = new Map();
            var timer = null;
            return {
                open: false,
                items: [],
                showLink: false,
                active: -1,
                showImages: o.showImages,
                thumbSize: o.thumbSize,
                searchUrl: o.searchUrl,

                submit: function (form) {
                    var term = this.$refs.term;
                    if (o.minLength > 0 && !term.value) {
                        window.alert(o.emptyMessage);
                        term.focus();
                        return;
                    }
                    var data = new FormData(form);
                    if (o.categories) {
                        var category = data.get('cid');
                        if (category && category !== '0') {
                            data.append('advs', 'true');
                            data.append('isc', 'true');
                        }
                    }
                    location.href = o.searchUrl + '?' + new URLSearchParams(data).toString();
                },

                query: function () {
                    if (!o.autocomplete && !o.historyUrl)
                        return;
                    var self = this;
                    clearTimeout(timer);
                    timer = setTimeout(function () { self.load(); }, 500);
                },

                load: function () {
                    var term = this.$refs.term.value.trim().toLowerCase();
                    var self = this;
                    var show = function (data) {
                        self.items = data || [];
                        self.showLink = self.items.some(function (i) { return i.showlinktoresultsearch; });
                        self.active = -1;
                        self.open = self.items.length > 0;
                    };
                    //nopCommerce 5.00: the shopper's recent search terms while the box is empty
                    if (!term && o.historyUrl) {
                        window.nw.get(o.historyUrl).then(function (data) {
                            if (!self.$refs.term.value.trim())
                                show(data);
                        });
                        return;
                    }
                    if (term.length < o.minLength || !term) {
                        this.open = false;
                        return;
                    }
                    var query = { term: term, categoryId: this.$refs.category ? this.$refs.category.value : 0 };
                    var key = JSON.stringify(query);
                    if (cache.has(key)) {
                        show(cache.get(key));
                        return;
                    }
                    window.nw.get(o.autocompleteUrl, query).then(function (data) {
                        cache.set(key, data);
                        if (self.$refs.term.value.trim().toLowerCase() === term)
                            show(data);
                    });
                },

                move: function (delta) {
                    if (!this.open || !this.items.length)
                        return;
                    this.active = (this.active + delta + this.items.length) % this.items.length;
                },

                itemUrl: function (item) {
                    return item.IsKeyword ? o.searchUrl + '?q=' + encodeURIComponent(item.label) : item.producturl;
                },

                removeTerm: function (item) {
                    var self = this;
                    window.nw.post(o.deleteHistoryUrl, { term: item.label }).then(function () { self.load(); });
                },

                pick: function (e) {
                    var item = this.open && this.items[this.active];
                    if (!item)
                        return;
                    e.preventDefault();
                    this.$refs.term.value = item.label;
                    location.href = this.itemUrl(item);
                }
            };
        });

        window.Alpine.data('nopwaraGallery', function (dataElementId, zoomEnabled) {
            var ZOOM = 2.5, MAX_ZOOM = 4;
            return {
                pictures: [],
                active: 0,
                show3d: false,
                lightbox: false,
                lightboxIndex: 0,
                lightboxSrc: '',
                //desktop hover magnifier
                hover: false,
                hoverSrc: '',
                hoverPos: '50% 50%',
                //lightbox pinch / pan state
                scale: 1,
                x: 0,
                y: 0,
                pointers: {},
                gesture: null,
                lastTap: 0,

                init: function () {
                    var dataEl = document.getElementById(dataElementId);
                    this.pictures = dataEl ? JSON.parse(dataEl.textContent) : [];
                    var self = this;
                    //attribute combinations swap the picture (rewritten _ProductAttributes sends nopwara:picture)
                    window.addEventListener('nopwara:picture', function (e) {
                        if (!e.detail || String(e.detail.productId) !== self.$el.dataset.productId)
                            return;
                        self.show(e.detail.image, e.detail.full, e.detail.title, e.detail.alt);
                        var index = self.pictures.findIndex(function (p) { return p.image === e.detail.image; });
                        if (index >= 0)
                            self.active = index;
                    });
                },

                show: function (image, full, title, alt) {
                    var img = this.$refs.main;
                    img.src = image;
                    if (alt !== undefined) img.alt = alt || '';
                    if (title !== undefined) img.title = title || '';
                    if (this.$refs.anchor) {
                        this.$refs.anchor.href = full;
                        this.$refs.anchor.title = title || '';
                    }
                    this.hover = false;
                },

                select: function (index) {
                    var picture = this.pictures[index];
                    if (!picture)
                        return;
                    this.active = index;
                    this.show3d = false;
                    this.show(picture.image, picture.full, picture.title, picture.alt);
                },

                select3d: function () {
                    this.show3d = true;
                },

                fullUrl: function () {
                    return this.$refs.anchor ? this.$refs.anchor.href : (this.pictures[this.active] || {}).full;
                },

                /*
                 * Hover zoom (mouse only): the full-size picture is a background of an overlay, positioned under the cursor.
                 * It loads on first hover and is skipped when it isn't meaningfully larger than the box.
                 */
                hoverStart: function (e) {
                    if (!zoomEnabled || e.pointerType !== 'mouse')
                        return;
                    var src = this.fullUrl(), self = this, box = this.$refs.box;
                    if (!src)
                        return;
                    var probe = new Image();
                    probe.onload = function () {
                        if (src !== self.fullUrl() || probe.naturalWidth < box.clientWidth * 1.3)
                            return;
                        self.hoverSrc = src;
                        self.hover = true;
                    };
                    probe.src = src;
                    this.hoverMove(e);
                },

                hoverMove: function (e) {
                    var r = this.$refs.box.getBoundingClientRect();
                    var px = Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100));
                    var py = Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100));
                    this.hoverPos = px + '% ' + py + '%';
                },

                openLightbox: function () {
                    if (!zoomEnabled)
                        return;
                    // the anchor href may have been swapped by an attribute combination picture
                    this.lightboxIndex = this.active;
                    this.lightboxSrc = this.fullUrl();
                    this.resetZoom();
                    this.hover = false;
                    this.lightbox = true;
                },

                step: function (delta) {
                    if (this.pictures.length < 2)
                        return;
                    this.lightboxIndex = (this.lightboxIndex + delta + this.pictures.length) % this.pictures.length;
                    this.lightboxSrc = this.pictures[this.lightboxIndex].full;
                    this.resetZoom();
                },

                resetZoom: function () {
                    this.scale = 1;
                    this.x = 0;
                    this.y = 0;
                    this.pointers = {};
                    this.gesture = null;
                },

                transform: function () {
                    return 'translate(' + this.x + 'px,' + this.y + 'px) scale(' + this.scale + ')';
                },

                //zoom to a scale keeping the point (cx, cy, relative to the stage centre) under the finger
                zoomTo: function (scale, cx, cy) {
                    scale = Math.min(MAX_ZOOM, Math.max(1, scale));
                    var k = scale / this.scale;
                    this.x = cx - (cx - this.x) * k;
                    this.y = cy - (cy - this.y) * k;
                    this.scale = scale;
                    if (scale === 1) {
                        this.x = 0;
                        this.y = 0;
                    }
                    this.clamp();
                },

                clamp: function () {
                    var img = this.$refs.zoomImg;
                    if (!img)
                        return;
                    var maxX = Math.max(0, (img.offsetWidth * this.scale - window.innerWidth) / 2);
                    var maxY = Math.max(0, (img.offsetHeight * this.scale - window.innerHeight) / 2);
                    this.x = Math.min(maxX, Math.max(-maxX, this.x));
                    this.y = Math.min(maxY, Math.max(-maxY, this.y));
                },

                centre: function (e) {
                    var r = this.$refs.stage.getBoundingClientRect();
                    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
                },

                pointerDown: function (e) {
                    try { this.$refs.stage.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
                    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
                    var ids = Object.keys(this.pointers);
                    if (ids.length === 2) {
                        var a = this.pointers[ids[0]], b = this.pointers[ids[1]];
                        var mid = this.centre({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
                        this.gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale, mid: mid };
                    } else {
                        this.gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, x: this.x, y: this.y, moved: false };
                    }
                },

                pointerMove: function (e) {
                    if (!this.pointers[e.pointerId] || !this.gesture)
                        return;
                    this.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
                    var g = this.gesture;
                    if (g.type === 'pinch') {
                        var ids = Object.keys(this.pointers);
                        if (ids.length < 2)
                            return;
                        var a = this.pointers[ids[0]], b = this.pointers[ids[1]];
                        this.zoomTo(g.scale * Math.hypot(a.x - b.x, a.y - b.y) / g.dist, g.mid.x, g.mid.y);
                        return;
                    }
                    var dx = e.clientX - g.sx, dy = e.clientY - g.sy;
                    if (Math.abs(dx) + Math.abs(dy) > 6)
                        g.moved = true;
                    if (this.scale > 1) {
                        this.x = g.x + dx;
                        this.y = g.y + dy;
                        this.clamp();
                    }
                },

                pointerUp: function (e) {
                    var g = this.gesture;
                    delete this.pointers[e.pointerId];
                    if (Object.keys(this.pointers).length) {
                        //one finger left after a pinch: continue as a pan
                        var id = Object.keys(this.pointers)[0], p = this.pointers[id];
                        this.gesture = { type: 'pan', sx: p.x, sy: p.y, x: this.x, y: this.y, moved: true };
                        return;
                    }
                    this.gesture = null;
                    if (!g || g.type !== 'pan')
                        return;
                    var dx = e.clientX - g.sx;
                    //swipe changes the picture when not zoomed
                    if (this.scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - g.sy)) {
                        this.step(dx < 0 ? 1 : -1);
                        return;
                    }
                    if (g.moved)
                        return;
                    //a tap beside the picture closes the lightbox
                    var r = this.$refs.zoomImg.getBoundingClientRect();
                    if (this.scale === 1 && r.width && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) {
                        this.lightbox = false;
                        return;
                    }
                    //double tap / double click toggles zoom at that point
                    var now = Date.now();
                    if (now - this.lastTap < 300) {
                        var c = this.centre(e);
                        this.zoomTo(this.scale > 1 ? 1 : ZOOM, c.x, c.y);
                        this.lastTap = 0;
                    } else {
                        this.lastTap = now;
                    }
                },

                wheel: function (e) {
                    var c = this.centre(e);
                    this.zoomTo(this.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), c.x, c.y);
                }
            };
        });

        /*
         * Menu panels cost nothing until they open: heavy markup sits in <template data-nw-lazy>, pictures use data-src, and the
         * mega menu's featured products are a placeholder with data-megamenu-products (their URL). This builds and loads them
         * the first time a panel (or the mobile drawer) opens.
         */
        window.nopwaraLoadPanel = function (el) {
            if (!el)
                return;
            //lazy markup (dropdown extras, the mobile menu): Alpine initialises it as it is added
            el.querySelectorAll('template[data-nw-lazy]').forEach(function (template) {
                template.replaceWith(template.content.cloneNode(true));
            });
            el.querySelectorAll('img[data-src]').forEach(function (img) {
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
            });
            el.querySelectorAll('[data-megamenu-products]').forEach(function (box) {
                var url = box.getAttribute('data-megamenu-products');
                box.removeAttribute('data-megamenu-products');
                fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                    .then(function (response) { return response.ok ? response.text() : ''; })
                    .then(function (html) {
                        //nothing visible (e.g. all products unpublished): drop the column
                        if (html.trim())
                            box.innerHTML = html;
                        else
                            box.closest('.nopwara-megamenu-products').remove();
                    })
                    .catch(function () { });
            });
        };

        /*
         * Mobile menu, built from the desktop menu the first time the drawer opens, so pages don't ship the menu twice.
         * Reads the desktop bar (Views/Shared/Components/MainMenu/Default.cshtml): top links, dropdown lists or grid groups,
         * "View all" links and the mega menu promo (inside the dropdown's lazy template). Writes the slide-in levels
         * driven by nopwaraMobileMenu. The container carries the sprite URL and the texts (data-icons, data-back, data-view-all).
         */
        window.nopwaraBuildMobileMenu = function (box) {
            if (!box || box.hasAttribute('data-built'))
                return;
            box.setAttribute('data-built', '');

            var bar = document.querySelector('ul[role="menubar"]');
            if (!bar)
                return;

            var icon = function (id, css) {
                return '<svg class="' + css + '" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">'
                    + '<use href="' + box.getAttribute('data-icons') + '#' + id + '" /></svg>';
            };
            var escape = function (text) {
                var span = document.createElement('span');
                span.textContent = text;
                return span.innerHTML;
            };

            //desktop markup -> { label (html), title, url, picture, children, viewAll, promo }
            var parseList = function (ul) {
                return Array.prototype.filter.call(ul.children, function (li) { return li.tagName === 'LI'; }).map(function (li) {
                    var link = li.querySelector(':scope > .nw-menu-link');
                    var nested = li.querySelector(':scope > .pl-3 > ul');
                    return {
                        label: link ? link.innerHTML : '',
                        title: link ? link.textContent.trim() : '',
                        url: link ? link.getAttribute('href') : null,
                        children: nested ? parseList(nested) : []
                    };
                });
            };
            var items = Array.prototype.map.call(bar.children, function (li) {
                var link = li.querySelector('.nw-menu-top');
                var panel = li.querySelector(':scope > [role="menu"]');
                var item = {
                    label: link ? link.innerHTML : '',
                    title: link ? (link.querySelector('.menu__title') || link).textContent.trim() : '',
                    url: link ? link.getAttribute('href') : null,
                    children: []
                };
                if (!panel)
                    return item;

                var groups = panel.querySelectorAll('.menu__group');
                if (groups.length) {
                    item.children = Array.prototype.map.call(groups, function (group) {
                        var a = group.querySelector('.menu__image-link');
                        var img = a && a.querySelector('img');
                        var sub = group.querySelector(':scope > ul');
                        var title = a ? a.textContent.trim() : '';
                        return {
                            label: '<span class="menu__title">' + escape(title) + '</span>',
                            title: title,
                            url: a ? a.getAttribute('href') : null,
                            picture: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null,
                            children: sub ? parseList(sub) : []
                        };
                    });
                } else {
                    var list = panel.querySelector('ul[role="menu"]');
                    item.children = list ? parseList(list) : [];
                }

                var viewAll = panel.querySelector('.menu__view-all');
                if (viewAll)
                    item.viewAll = { url: viewAll.getAttribute('href'), text: viewAll.textContent.trim() };

                panel.querySelectorAll('template[data-nw-lazy]').forEach(function (template) {
                    var promo = template.content.querySelector('.nopwara-megamenu-promo');
                    if (promo && !item.promo) {
                        promo = promo.cloneNode(true);
                        promo.className = 'nopwara-megamenu-promo px-4 pb-4 pt-2';
                        item.promo = promo.outerHTML;
                    }
                });
                return item;
            });

            //levels: the root list, then one panel per item with children (siblings, so they slide in the same container)
            var panels = [];
            var renderPanel = function (item, id, depth) {
                var viewAll = item.viewAll || (item.url ? { url: item.url, text: (box.getAttribute('data-view-all') || '{0}').replace('{0}', item.title) } : null);
                var html = '<div class="absolute inset-0 overflow-y-auto bg-white transition duration-300 ease-out" x-cloak data-panel="' + id + '" role="menu" aria-label="' + escape(item.title) + '"'
                    + ' :class="panelClass(\'' + id + '\')" :inert="!isTop(\'' + id + '\')">'
                    + '<div class="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-2 py-2">'
                    + '<button type="button" class="flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" @click="back()">'
                    + icon('i-34104a', 'size-5') + escape(box.getAttribute('data-back') || 'Back') + '</button>'
                    + '<span class="truncate text-base font-semibold text-slate-900">' + escape(item.title) + '</span></div>';
                if (viewAll)
                    html += '<a href="' + viewAll.url + '" role="menuitem" class="flex items-center justify-between px-4 py-3.5 text-sm font-semibold text-primary-700 hover:bg-slate-50">'
                        + escape(viewAll.text) + icon('i-b06737', 'size-4') + '</a>';
                html += '<ul class="divide-y divide-slate-100 border-t border-slate-100">';
                item.children.forEach(function (child, i) {
                    var picture = child.picture ? '<img data-src="' + child.picture + '" alt="" class="size-9 shrink-0 rounded object-contain" />' : '';
                    var label = '<span class="flex min-w-0 items-center gap-1.5">' + child.label + '</span>';
                    if (child.children.length) {
                        html += '<li role="none"><button type="button" role="menuitem" aria-haspopup="menu" class="nw-mlink nw-mlink-parent" @click="open(\'' + id + '-' + i + '\', $el)">'
                            + picture + label + icon('i-ae0c6e', 'ml-auto size-5 shrink-0 text-slate-400') + '</button></li>';
                        panels.push(function () { return renderPanel(child, id + '-' + i, depth + 1); });
                    } else {
                        html += '<li role="none"><a' + (child.url ? ' href="' + child.url + '"' : '') + ' role="menuitem" class="nw-mlink">' + picture + label + '</a></li>';
                    }
                });
                html += '</ul>' + (depth === 1 && item.promo ? item.promo : '') + '</div>';
                return html;
            };

            var root = '<ul role="menu" class="divide-y divide-slate-100 py-1">';
            items.forEach(function (item, i) {
                if (item.children.length) {
                    root += '<li role="none"><button type="button" role="menuitem" aria-haspopup="menu" class="nw-mtop" @click="open(\'m' + i + '\', $el)">'
                        + item.label + icon('i-ae0c6e', 'ml-auto size-5 shrink-0 text-slate-400') + '</button></li>';
                    panels.push(function () { return renderPanel(item, 'm' + i, 1); });
                } else if (item.url) {
                    root += '<li role="none"><a href="' + item.url + '" role="menuitem" class="nw-mtop">' + item.label + '</a></li>';
                } else {
                    root += '<li role="none"><span role="menuitem" class="nw-mtop text-slate-500">' + item.label + '</span></li>';
                }
            });
            root += '</ul>';

            var levels = '';
            for (var p = 0; p < panels.length; p++)
                levels += panels[p]();

            //Alpine initialises the component as it is added
            box.innerHTML = '<div class="nopwara-mobile-menu relative h-full overflow-hidden" x-data="nopwaraMobileMenu()">'
                + '<div class="absolute inset-0 overflow-y-auto transition duration-300 ease-out" :class="stack.length ? \'-translate-x-1/4 opacity-0\' : \'translate-x-0 opacity-100\'" :inert="stack.length > 0">'
                + root + '</div>' + levels + '</div>';
        };

        /*
         * Desktop main menu bar (Views/Shared/Components/MainMenu/Default.cshtml): when the top-level items need more
         * than one row, "compact" drops their icons and tightens the spacing (see _NopwaraMenuLink.cshtml)
         */
        window.Alpine.data('nopwaraMenuFit', function () {
            return {
                //the first decision is made inline right after the bar (MainMenu/Default.cshtml); this follows window resizes
                init: function () {
                    var bar = this.$el;
                    var fit = function () {
                        bar.classList.remove('menu--compact');
                        var tops = Array.prototype.map.call(bar.children, function (li) { return li.offsetTop; });
                        if (new Set(tops).size > 1)
                            bar.classList.add('menu--compact');
                    };
                    var timer;
                    window.addEventListener('resize', function () {
                        clearTimeout(timer);
                        timer = setTimeout(fit, 150);
                    });
                }
            };
        });

        /*
         * Mobile main menu (built by nopwaraBuildMobileMenu): a stack of open levels.
         * Each level is a panel that slides in from the right; the header drawer's "mobileOpen" closes it all.
         */
        window.Alpine.data('nopwaraMobileMenu', function () {
            return {
                stack: [],
                openers: [],

                init: function () {
                    //back to the root level once the drawer has closed (after its slide-out)
                    if (this.mobileOpen !== undefined) {
                        this.$watch('mobileOpen', (open) => {
                            if (!open)
                                setTimeout(() => { this.stack = []; this.openers = []; }, 250);
                        });
                    }
                },

                open: function (id, opener) {
                    this.stack = this.stack.concat(id);
                    this.openers = this.openers.concat(opener || null);
                    this.$nextTick(() => {
                        var panel = this.$root.querySelector('[data-panel="' + id + '"]');
                        window.nopwaraLoadPanel(panel);
                        var first = panel && panel.querySelector('button, a[href]');
                        if (first)
                            first.focus({ preventScroll: true });
                    });
                },

                back: function () {
                    var opener = this.openers[this.openers.length - 1];
                    this.stack = this.stack.slice(0, -1);
                    this.openers = this.openers.slice(0, -1);
                    if (opener)
                        this.$nextTick(() => opener.focus({ preventScroll: true }));
                },

                isTop: function (id) {
                    return this.stack[this.stack.length - 1] === id;
                },

                panelClass: function (id) {
                    var index = this.stack.indexOf(id);
                    if (index === -1)
                        return 'translate-x-full';
                    //a level under the open one slides a bit to the left and fades
                    return index === this.stack.length - 1 ? 'translate-x-0' : '-translate-x-1/4 opacity-0';
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
