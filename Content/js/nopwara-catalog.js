/*
 * Nopwara catalog navigation on nw.catalog (Content/js/nopwara-core.js), no jQuery:
 *  - the standard controls (view mode, sort, page size, pager, specification and manufacturer filters) are wired here
 *    from their markup, so the views carry no scripts
 *  - filter changes push browser history, Back/Forward restore filters + products
 *  - "show more" appends the next page
 *  - Alpine components: nopwaraPriceRange (filter), nopwaraActiveFilters (chips)
 * Starts on pages that render .products-container[data-catalog] (Views/Catalog/_CatalogProducts.cshtml).
 */
(function () {
  const nw = window.nw;
  const all = (selector) => Array.from(document.querySelectorAll(selector));
  let started = false;

  function currentUrl() {
    return location.pathname + location.search;
  }

  function normalize(url) {
    return url.replace(/\?$/, '');
  }

  //---------- standard controls

  function selected(selector, attribute) {
    return all(selector + ':checked').map((el) => el.getAttribute(attribute));
  }

  function wireControls(catalog) {
    catalog.on('before', (e) => {
      const builder = e.detail.urlBuilder;
      const viewMode = document.querySelector('[data-viewmode].selected');
      if (viewMode) builder.addParameter('viewmode', viewMode.dataset.viewmode);
      const orderBy = document.getElementById('products-orderby');
      if (orderBy) builder.addParameter('orderby', orderBy.value);
      const pageSize = document.getElementById('products-pagesize');
      if (pageSize) builder.addParameter('pagesize', pageSize.value);
      const specs = selected('[data-option-id]', 'data-option-id');
      if (specs.length) builder.addParameter('specs', specs.join(','));
      const ms = selected('[data-manufacturer-id]', 'data-manufacturer-id');
      if (ms.length) builder.addParameter('ms', ms.join(','));
    });

    nw.on('click', '[data-viewmode]', (e, el) => {
      e.preventDefault();
      if (el.classList.contains('selected')) return;
      all('[data-viewmode]').forEach((mode) => mode.classList.toggle('selected', mode === el));
      catalog.getProducts();
    });
    nw.on('change', '#products-orderby, #products-pagesize, [data-option-id], [data-manufacturer-id]', () => catalog.getProducts());
    nw.on('click', '[data-page]', (e, el) => {
      e.preventDefault();
      catalog.getProducts(el.dataset.page);
    });
  }

  //---------- history

  //state of every control that feeds the products request; saved with each history entry,
  //because a URL alone can't restore defaults (e.g. the original URL has no orderby/pagesize)
  function snapshot() {
    const priceEl = document.querySelector('[data-price-filter]');
    const price = priceEl && window.Alpine ? Alpine.$data(priceEl) : null;
    const viewMode = document.querySelector('[data-viewmode].selected');
    return {
      specs: selected('[data-option-id]', 'data-option-id'),
      ms: selected('[data-manufacturer-id]', 'data-manufacturer-id'),
      price: price ? { from: price.from, to: price.to } : null,
      orderby: document.getElementById('products-orderby')?.value ?? null,
      pagesize: document.getElementById('products-pagesize')?.value ?? null,
      viewmode: viewMode ? viewMode.dataset.viewmode : null
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

  function restore(catalog, state) {
    all('[data-option-id]').forEach((el) => { el.checked = state.specs.includes(el.getAttribute('data-option-id')); });
    all('[data-manufacturer-id]').forEach((el) => { el.checked = state.ms.includes(el.getAttribute('data-manufacturer-id')); });
    //the price component may not have been initialized when the first entry was saved: fall back to the entry's URL
    window.dispatchEvent(new CustomEvent('nopwara:price-set', { detail: state.price || stateFromUrl().price }));

    const orderBy = document.getElementById('products-orderby');
    if (orderBy && state.orderby != null) orderBy.value = state.orderby;
    const pageSize = document.getElementById('products-pagesize');
    if (pageSize && state.pagesize != null) pageSize.value = state.pagesize;
    if (state.viewmode != null) all('[data-viewmode]').forEach((el) => el.classList.toggle('selected', el.dataset.viewmode === state.viewmode));

    catalog.nopwaraRestoring = true;
    try {
      catalog.getProducts(new URLSearchParams(location.search).get('pagenumber') || undefined);
    } finally {
      catalog.nopwaraRestoring = false;
    }
  }

  function extendHistory(catalog) {
    catalog.setBrowserHistory = function (url) {
      url = normalize(url);
      //called by getProducts after the "before" hooks, so the controls already hold the new state
      const state = { nopwaraCatalog: true, controls: snapshot() };
      if (this.nopwaraRestoring || url === currentUrl()) window.history.replaceState(state, '', url);
      else window.history.pushState(state, '', url);
    };

    //the server rendered the controls for the current URL: remember them for Back
    window.history.replaceState({ nopwaraCatalog: true, controls: snapshot() }, '', currentUrl());
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.nopwaraCatalog) restore(catalog, e.state.controls || stateFromUrl());
    });
  }

  //---------- show more

  function initLoadMore(catalog) {
    const label = document.querySelector('.products-container')?.dataset.loadMoreText || 'Show more';
    const setLabels = () => all('[data-load-more-label]').forEach((el) => { el.textContent = label; });
    setLabels();
    catalog.on('loaded', setLabels);

    nw.on('click', '[data-load-more]', (e, button) => {
      if (button.disabled) return;
      button.disabled = true;
      button.querySelector('[data-load-more-spinner]')?.removeAttribute('hidden');
      //a failed request leaves the button usable again; a successful one replaces it
      catalog.getProducts(button.dataset.loadMore, true).finally(() => {
        if (button.isConnected) {
          button.disabled = false;
          button.querySelector('[data-load-more-spinner]')?.setAttribute('hidden', '');
        }
      });
    });
  }

  function start() {
    const container = document.querySelector('.products-container[data-catalog]');
    if (started || !container || !nw) return;
    started = true;
    const catalog = nw.catalog;
    catalog.init(JSON.parse(container.dataset.catalog));
    wireControls(catalog);
    extendHistory(catalog);
    initLoadMore(catalog);
    window.dispatchEvent(new CustomEvent('nopwara:catalog-ready'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

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
        nw.catalog.on('before', (e) => {
          if (this.isNarrowed()) e.detail.urlBuilder.addParameter('price', this.from + '-' + this.to);
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
        nw.catalog.getProducts();
      }
    }));

    //chips for the selected filters (built from the filter inputs, so any filter markup works)
    Alpine.data('nopwaraActiveFilters', () => ({
      chips: [],

      init() {
        this.refresh();
        nw.catalog.on('before', () => this.refresh());
        nw.catalog.on('loaded', () => this.refresh());
      },

      labelFor(input) {
        return (document.querySelector(`label[for="${input.id}"]`)?.textContent || '').trim();
      },

      refresh() {
        const chips = [];

        all('[data-option-id]:checked').forEach((input) => {
          const group = input.closest('.product-spec-group')?.querySelector('.name')?.textContent.trim();
          chips.push({ key: 'spec-' + input.dataset.optionId, label: (group ? group + ': ' : '') + this.labelFor(input), input });
        });

        all('[data-manufacturer-id]:checked').forEach((input) => {
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
        nw.catalog.getProducts();
      },

      clear() {
        this.chips.forEach((chip) => {
          if (chip.price) window.dispatchEvent(new CustomEvent('nopwara:price-reset'));
          else chip.input.checked = false;
        });
        nw.catalog.getProducts();
      }
    }));
  });
})();
