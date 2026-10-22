/*
 * Nopwara catalog navigation: extends core CatalogProducts (wwwroot/js/public.catalogproducts.js).
 *  - filter changes push browser history, Back/Forward restore filters + products
 *  - "load more" appends the next page
 *  - Alpine components: nopwaraPriceRange (filter), nopwaraActiveFilters (chips)
 * Loaded globally from Head.cshtml (before Alpine); does nothing on pages without CatalogProducts.
 */
(function () {
  //run after every footer script (jQuery, CatalogProducts and the filter hooks) is loaded
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function catalog() {
    return window.jQuery && window.CatalogProducts ? window.CatalogProducts : null;
  }

  function currentUrl() {
    return location.pathname + location.search;
  }

  function normalize(url) {
    return url.replace(/\?$/, '');
  }

  //---------- history

  //state of every control that feeds the products request; saved with each history entry,
  //because a URL alone can't restore defaults (e.g. the original URL has no orderby/pagesize)
  function snapshot() {
    const $ = window.jQuery;
    const priceEl = document.querySelector('[data-price-filter]');
    const price = priceEl && window.Alpine ? Alpine.$data(priceEl) : null;
    return {
      specs: $('[data-option-id]:checked').map(function () { return String($(this).data('option-id')); }).get(),
      ms: $('[data-manufacturer-id]:checked').map(function () { return String($(this).data('manufacturer-id')); }).get(),
      price: price ? { from: price.from, to: price.to } : null,
      orderby: $('#products-orderby').val() ?? null,
      pagesize: $('#products-pagesize').val() ?? null,
      viewmode: $('[data-viewmode].selected').data('viewmode') ?? null
    };
  }

  //state from the URL, for history entries created before this script (no saved state)
  function stateFromUrl() {
    const params = new URLSearchParams(location.search);
    const list = (name) => (params.get(name) || '').split(',').filter(Boolean);
    const price = (params.get('price') || '').split('-');
    return {
      specs: list('specs'),
      ms: list('ms'),
      price: { from: parseFloat(price[0]), to: parseFloat(price[1]) },
      orderby: params.get('orderby'),
      pagesize: params.get('pagesize'),
      viewmode: params.get('viewmode')
    };
  }

  function restore(state) {
    const products = catalog();
    if (!products) return;
    const $ = window.jQuery;

    $('[data-option-id]').each(function () { this.checked = state.specs.includes(String($(this).data('option-id'))); });
    $('[data-manufacturer-id]').each(function () { this.checked = state.ms.includes(String($(this).data('manufacturer-id'))); });
    //the price component may not have been initialized when the first entry was saved: fall back to the entry's URL
    window.dispatchEvent(new CustomEvent('nopwara:price-set', { detail: state.price || stateFromUrl().price }));

    if (state.orderby != null) $('#products-orderby').val(state.orderby);
    if (state.pagesize != null) $('#products-pagesize').val(state.pagesize);
    if (state.viewmode != null) {
      $('[data-viewmode]').each(function () { $(this).toggleClass('selected', $(this).data('viewmode') === state.viewmode); });
    }

    products.nopwaraRestoring = true;
    try {
      products.getProducts(new URLSearchParams(location.search).get('pagenumber') || undefined);
    } finally {
      products.nopwaraRestoring = false;
    }
  }

  function extendHistory(products) {
    products.setBrowserHistory = function (url) {
      url = normalize(url);
      //called by getProducts after the "before" hooks, so the controls already hold the new state
      const state = { nopwaraCatalog: true, controls: snapshot() };
      if (this.nopwaraRestoring || url === currentUrl()) window.history.replaceState(state, '', url);
      else window.history.pushState(state, '', url);
    };

    //the server rendered the controls for the current URL: remember them for Back
    window.history.replaceState({ nopwaraCatalog: true, controls: snapshot() }, '', currentUrl());
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.nopwaraCatalog) restore(e.state.controls || stateFromUrl());
    });
  }

  //---------- load more

  function initLoadMore(products) {
    const $ = window.jQuery;
    const label = document.querySelector('.products-container')?.dataset.loadMoreText || 'Show more';
    const setLabels = () => $('[data-load-more-label]').text(label);
    setLabels();
    $(products).on('loaded', setLabels);

    //a filter / sort / Back reload replaces the list: a "load more" still running must not append its stale page
    const getProducts = products.getProducts;
    products.getProducts = function () {
      products.nopwaraLoadMore?.abort();
      return getProducts.apply(this, arguments);
    };

    $(document).on('click', '[data-load-more]', function () {
      const $button = $(this);
      if ($button.prop('disabled')) return;

      //same request as CatalogProducts.getProducts, without touching history or scrolling
      const urlBuilder = createProductsURLBuilder(products.settings.browserPath);
      urlBuilder.addParameter('pagenumber', $button.data('load-more'));
      const payload = { urlBuilder };
      $(products).trigger({ type: 'before', payload });
      const postData = { ...payload.urlBuilder.params.query };
      addAntiForgeryToken(postData);

      $button.prop('disabled', true).find('[data-load-more-spinner]').prop('hidden', false);

      products.nopwaraLoadMore?.abort();
      products.nopwaraLoadMore = $.ajax({ cache: false, url: products.settings.fetchUrl, type: 'POST', data: postData });
      products.nopwaraLoadMore
        .done((response) => {
          const $response = $('<div>').append($.parseHTML(response, document, true));
          const $wrapper = $('.products-wrapper');
          //appending through jQuery runs the inline scripts of the new product boxes (e.g. picture sliders)
          $wrapper.find('.item-grid').append($response.find('.item-grid').children());
          $wrapper.find('.load-more').replaceWith($response.find('.load-more'));
          if (!$response.find('.load-more').length) $wrapper.find('.load-more').remove();
          $wrapper.find('.pager').replaceWith($response.find('.pager'));
          $(products).trigger({ type: 'loaded' });
        })
        .fail(() => $button.prop('disabled', false).find('[data-load-more-spinner]').prop('hidden', true))
        .always(() => { products.nopwaraLoadMore = null; });
    });
  }

  onReady(() => {
    const products = catalog();
    if (!products) return;
    extendHistory(products);
    initLoadMore(products);
  });

  //---------- Alpine components

  document.addEventListener('alpine:init', () => {
    //two-handle price range; adds "price" to the request only when narrowed
    Alpine.data('nopwaraPriceRange', (min, max, from, to) => ({
      min: Math.floor(min),
      max: Math.ceil(max),
      from: Math.floor(from),
      to: Math.ceil(to),

      init() {
        window.addEventListener('nopwara:price-set', (e) => {
          this.from = Number.isFinite(e.detail.from) ? e.detail.from : this.min;
          this.to = Number.isFinite(e.detail.to) ? e.detail.to : this.max;
        });
        window.addEventListener('nopwara:price-reset', () => {
          this.from = this.min;
          this.to = this.max;
        });

        onReady(() => {
          const products = catalog();
          if (!products) return;
          window.jQuery(products).on('before', (e) => {
            if (this.isNarrowed()) e.payload.urlBuilder.addParameter('price', this.from + '-' + this.to);
          });
        });
      },

      isNarrowed() {
        return this.from > this.min || this.to < this.max;
      },

      get trackStyle() {
        const span = this.max - this.min || 1;
        return `--from:${((this.from - this.min) / span) * 100}%;--to:${((this.to - this.min) / span) * 100}%`;
      },

      clampFrom() {
        this.from = Math.min(Math.max(this.min, this.from || this.min), this.to);
      },

      clampTo() {
        this.to = Math.max(Math.min(this.max, this.to || this.max), this.from);
      },

      apply() {
        catalog()?.getProducts();
      }
    }));

    //chips for the selected filters (built from the filter inputs, so any filter markup works)
    Alpine.data('nopwaraActiveFilters', () => ({
      chips: [],

      init() {
        onReady(() => {
          const products = catalog();
          if (!products) return;
          this.refresh();
          window.jQuery(products).on('before loaded', () => this.refresh());
        });
      },

      labelFor(input) {
        return (document.querySelector(`label[for="${input.id}"]`)?.textContent || '').trim();
      },

      refresh() {
        const chips = [];

        document.querySelectorAll('[data-option-id]:checked').forEach((input) => {
          const group = input.closest('.product-spec-group')?.querySelector('.name')?.textContent.trim();
          chips.push({ key: 'spec-' + input.dataset.optionId, label: (group ? group + ': ' : '') + this.labelFor(input), input });
        });

        document.querySelectorAll('[data-manufacturer-id]:checked').forEach((input) => {
          chips.push({ key: 'ms-' + input.dataset.manufacturerId, label: this.labelFor(input), input });
        });

        const priceEl = document.querySelector('[data-price-filter]');
        const price = priceEl && Alpine.$data(priceEl);
        if (price && price.isNarrowed()) chips.push({ key: 'price', label: price.from + ' – ' + price.to, price: true });

        this.chips = chips;
      },

      remove(chip) {
        if (chip.price) window.dispatchEvent(new CustomEvent('nopwara:price-reset'));
        else chip.input.checked = false;
        catalog()?.getProducts();
      },

      clear() {
        this.chips.forEach((chip) => {
          if (chip.price) window.dispatchEvent(new CustomEvent('nopwara:price-reset'));
          else chip.input.checked = false;
        });
        catalog()?.getProducts();
      }
    }));
  });
})();
