/*
 * Estimate shipping popup (product page and cart) without jQuery or magnific-popup: a port of core
 * wwwroot/js/public.estimateshipping.popup.js with the same settings, handlers and methods.
 * The popup content (#estimate-shipping-popup...) moves into a native <dialog> when the opener is clicked.
 * Loaded by Views/Shared/_EstimateShippingPopUp.cshtml.
 */
window.nwEstimateShipping = function (settings) {
  'use strict';

  const defaults = {
    opener: false,
    form: false,
    requestDelay: 300,
    urlFactory: false,
    handlers: {},
    localizedData: {},
    contentEl: false,
    countryEl: false,
    stateProvinceEl: false,
    zipPostalCodeEl: false,
    useCity: false,
    cityEl: false,
    errorMessageBoxClass: 'message-failure'
  };

  const div = (className, text) => {
    const el = document.createElement('div');
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  return {
    settings: Object.assign({}, defaults, settings),
    params: {
      controller: null,
      displayErrors: false,
      delayTimer: false,
      selectedShippingOption: false
    },
    dialog: null,

    content() {
      return document.querySelector(this.settings.contentEl);
    },

    find(selector) {
      const content = this.content();
      return content ? content.querySelector(selector) : null;
    },

    init() {
      const content = this.content();
      if (!content) return;

      content.querySelector('.apply-shipping-button')?.addEventListener('click', () => {
        const option = this.getActiveShippingOption();
        if (option && option.provider && option.price) {
          this.selectShippingOption(option);
          this.closePopup();
        }
      });

      document.querySelector(this.settings.opener)?.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPopup();
      });

      const addressChanged = () => {
        this.clearShippingOptions();
        this.getShippingOptions(this.getShippingAddress());
      };
      this.find(this.settings.countryEl)?.addEventListener('change', () => {
        const state = this.find(this.settings.stateProvinceEl);
        if (state) state.value = '0';
        addressChanged();
      });
      this.find(this.settings.stateProvinceEl)?.addEventListener('change', addressChanged);
      this.find(this.settings.useCity ? this.settings.cityEl : this.settings.zipPostalCodeEl)?.addEventListener('input', addressChanged);
    },

    isOpen() {
      return !!(this.dialog && this.dialog.open);
    },

    openPopup() {
      if (!this.dialog) {
        const content = this.content();
        const dialog = this.dialog = document.createElement('dialog');
        dialog.className = 'nw-dialog estimate-shipping-dialog';
        const head = div('nw-dialog-head');
        head.innerHTML = '<span></span><button type="button" class="nw-dialog-close" data-nw-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg></button>';
        const body = div('nw-dialog-body');
        content.classList.remove('mfp-hide');
        body.appendChild(content);
        dialog.append(head, body);
        dialog.addEventListener('click', (e) => {
          if (e.target === dialog || e.target.closest('[data-nw-close]')) dialog.close();
        });
        document.body.appendChild(dialog);
      }
      this.dialog.showModal();
      if (this.settings.handlers.openPopUp) this.settings.handlers.openPopUp();
      this.params.displayErrors = true;
    },

    closePopup() {
      if (this.dialog) this.dialog.close();
    },

    getShippingOptions(address) {
      if (!this.validateAddress(address)) return;

      this.setLoadWaiting();
      if (this.settings.handlers.load) this.settings.handlers.load();

      clearTimeout(this.params.delayTimer);
      this.params.delayTimer = setTimeout(() => {
        if (this.params.controller) this.params.controller.abort();
        const url = this.settings.urlFactory(address);
        if (!url) return;
        const controller = this.params.controller = new AbortController();
        const form = document.querySelector(this.settings.form);
        nw.post(url, nw.serialize(form), { signal: controller.signal })
          .then((response) => this.successHandler(address, response))
          .catch((error) => this.errorHandler(error))
          .finally(() => {
            if (this.settings.handlers.complete) this.settings.handlers.complete();
          });
      }, this.settings.requestDelay);
    },

    setLoadWaiting() {
      this.clearErrorMessage();
      this.find('.shipping-options-body')?.replaceChildren(div('shipping-options-loading'));
    },

    successHandler(address, response) {
      this.find('.shipping-options-body')?.replaceChildren();

      if (response.Success) {
        let activeOption;
        const options = response.ShippingOptions;
        if (options && options.length > 0) {
          const selected = this.params.selectedShippingOption;
          options.forEach((option) => {
            //try to select the shipping option with the same provider and address
            if (option.Selected || (selected && selected.provider === option.Name && this.addressesAreEqual(selected.address, address))) {
              activeOption = { provider: option.Name, price: option.Price, address: address, deliveryDate: option.DeliveryDateFormat };
            }
            this.addShippingOption(option.Name, option.DeliveryDateFormat, option.Price);
          });

          if (!activeOption) {
            activeOption = { provider: options[0].Name, price: options[0].Price, deliveryDate: options[0].DeliveryDateFormat, address: address };
          }

          //an option was already selected for this address: reload it
          if (!this.isOpen() && selected && this.addressesAreEqual(selected.address, address))
            this.selectShippingOption(activeOption);

          this.setActiveShippingOption(activeOption);
        } else {
          this.clearShippingOptions();
        }
      } else {
        this.params.displayErrors = true;
        this.clearErrorMessage();
        this.clearShippingOptions();
        this.showErrorMessage(response.Errors);
      }

      if (this.settings.handlers.success) this.settings.handlers.success(address, response);
    },

    errorHandler(error) {
      if (error && error.name === 'AbortError') return;
      this.clearShippingOptions();
      if (this.settings.handlers.error) this.settings.handlers.error(error);
    },

    clearErrorMessage() {
      this.find('.' + this.settings.errorMessageBoxClass)?.replaceChildren();
    },

    showErrorMessage(errors) {
      if (!this.params.displayErrors) return;
      const box = this.find('.' + this.settings.errorMessageBoxClass);
      (errors || []).forEach((error) => box?.appendChild(div('', error)));
    },

    selectShippingOption(option) {
      if (option && option.provider && option.price && this.validateAddress(option.address))
        this.params.selectedShippingOption = option;
      if (this.settings.handlers.selectedOption) this.settings.handlers.selectedOption(option);
    },

    addShippingOption(name, deliveryDate, price) {
      if (!name || !price) return;
      const row = div('estimate-shipping-row shipping-option');
      const radioCell = div('estimate-shipping-row-item-radio');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.className = 'estimate-shipping-radio';
      radio.name = 'shipping-option-' + this.settings.contentEl;
      radioCell.append(radio, document.createElement('label'));
      row.append(radioCell,
        div('estimate-shipping-row-item shipping-item', name),
        div('estimate-shipping-row-item shipping-item', deliveryDate || '-'),
        div('estimate-shipping-row-item shipping-item', price));
      row.addEventListener('click', () => {
        radio.checked = true;
        this.content().querySelectorAll('.shipping-option.active').forEach((el) => el.classList.remove('active'));
        row.classList.add('active');
      });
      this.find('.shipping-options-body')?.appendChild(row);
    },

    clearShippingOptions() {
      this.find('.shipping-options-body')?.replaceChildren(div('no-shipping-options', this.settings.localizedData.noShippingOptionsMessage));
    },

    setActiveShippingOption(option) {
      const rows = Array.from(this.content().querySelectorAll('.shipping-option'));
      const row = rows.find((r) => {
        const items = r.querySelectorAll('.shipping-item');
        return items[0].textContent.trim() === option.provider && items[2].textContent.trim() === option.price;
      });
      if (row) row.click();
    },

    getActiveShippingOption() {
      const items = this.content().querySelectorAll('.shipping-option.active .shipping-item');
      const text = (i) => (items[i] ? items[i].textContent.trim() : '');
      return { provider: text(0), deliveryDate: text(1), price: text(2), address: this.getShippingAddress() };
    },

    getShippingAddress() {
      const address = {};
      const country = this.find(this.settings.countryEl);
      const state = this.find(this.settings.stateProvinceEl);
      const zip = this.find(this.settings.zipPostalCodeEl);
      const city = this.find(this.settings.cityEl);
      if (country && country.value > 0) {
        address.countryId = country.value;
        address.countryName = country.options[country.selectedIndex].text;
      }
      if (state && state.value > 0) {
        address.stateProvinceId = state.value;
        address.stateProvinceName = state.options[state.selectedIndex].text;
      }
      if (zip && zip.value) address.zipPostalCode = zip.value;
      if (city && city.value) address.city = city.value;
      return address;
    },

    addressesAreEqual(a, b) {
      return a.countryId === b.countryId &&
        a.stateProvinceId === b.stateProvinceId &&
        (this.settings.useCity || a.zipPostalCode === b.zipPostalCode) &&
        (!this.settings.useCity || a.city === b.city);
    },

    validateAddress(address) {
      this.clearErrorMessage();
      const errors = [];
      const text = this.settings.localizedData;
      if (!(address && address.countryName && address.countryId > 0)) errors.push(text.countryErrorMessage);
      if (this.settings.useCity && !(address && address.city)) errors.push(text.cityErrorMessage);
      if (!this.settings.useCity && !(address && address.zipPostalCode)) errors.push(text.zipPostalCodeErrorMessage);
      if (errors.length > 0) this.showErrorMessage(errors);
      return errors.length === 0;
    }
  };
};
