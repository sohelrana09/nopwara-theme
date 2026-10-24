/*
 * nopCommerce one-page checkout without jQuery: a port of core wwwroot/js/public.accordion.js and
 * public.onepagecheckout.js with the same global objects and methods (Accordion, Checkout, Billing, Shipping,
 * ShippingMethod, PaymentMethod, PaymentInfo, ConfirmOrder), so the core step partials (Opc*.cshtml) and payment
 * plugins that call them keep working. Core's document events are dispatched as DOM CustomEvents with the same names.
 * Loaded by Views/Checkout/OnePageCheckout.cshtml.
 */
(function () {
  'use strict';

  const $id = (id) => document.getElementById(id);
  const el = (x) => (typeof x === 'string' ? document.querySelector(x) : x);
  const show = (x, visible, display) => {
    const e = el(x);
    if (e) e.style.display = visible ? (display || '') : 'none';
  };
  const fire = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
  const alertMessage = (response) => window.alert(typeof response.message === 'string' ? response.message : (response.message || []).join('\n'));
  const post = (url, form) => nw.post(url, nw.serialize(el(form)));

  //"#id" values of a GET address response go into the prefixed fields (Billing/Shipping.editAddress)
  function fillAddress(prefix, data) {
    Object.keys(data).forEach((id) => {
      const value = data[id];
      if (value === null) return;
      if (id.indexOf('CustomAddressAttributes') >= 0 && Array.isArray(value)) {
        value.forEach((attribute) => {
          const control = $id(attribute.ControlId);
          if (attribute.DefaultValue) {
            if (control) control.value = attribute.DefaultValue;
          } else {
            (attribute.Values || []).forEach((v) => {
              if (!v.IsPreSelected) return;
              if (control) control.value = v.Id;
              const option = $id(attribute.ControlId + '_' + v.Id);
              if (option) option.checked = true;
            });
          }
        });
        return;
      }
      if (id.indexOf('StateProvinceId') >= 0) Billing.setSelectedStateId(value);
      const field = $id(prefix + id);
      if (!field) return;
      field.value = value;
      if (id.indexOf('CountryId') >= 0) field.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function resetForm(container) {
    const box = $id(container);
    if (!box) return;
    box.querySelectorAll('input, select, textarea').forEach((input) => {
      if (['button', 'submit', 'reset', 'hidden'].indexOf(input.type) !== -1) return;
      if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
      else if (input.tagName !== 'SELECT') input.value = '';
    });
    box.querySelectorAll('.address-id').forEach((input) => { input.value = '0'; });
    box.querySelectorAll('select').forEach((select) => {
      if (select.querySelector('option[value="0"]')) select.value = '0';
    });
  }

  const Accordion = window.Accordion = {
    checkAllow: false,
    disallowAccessToNextSections: false,
    sections: [],
    currentSectionId: false,

    init(elem, clickableEntity, checkAllow) {
      this.checkAllow = checkAllow || false;
      this.disallowAccessToNextSections = false;
      this.sections = Array.from(document.querySelectorAll('#' + elem + ' .tab-section'));
      this.currentSectionId = false;
      document.querySelectorAll('#' + elem + ' .tab-section ' + clickableEntity).forEach((header) => {
        header.addEventListener('click', () => Accordion.openSection(header.closest('.tab-section')));
      });
    },

    openSection(section) {
      section = el(section);
      if (!section || (this.checkAllow && !section.classList.contains('allow'))) return;
      if (section.id === this.currentSectionId) return;
      const previousSectionId = this.currentSectionId;
      this.closeExistingSection();
      this.currentSectionId = section.id;
      section.classList.add('active');
      const content = section.querySelector(':scope > .a-item');
      if (content) content.style.display = '';
      location.hash = section.id;
      fire('accordion_section_opened', { previousSectionId: previousSectionId, currentSectionId: this.currentSectionId });

      if (this.disallowAccessToNextSections) {
        let past = false;
        this.sections.forEach((s) => {
          if (past) s.classList.remove('allow');
          if (s.id === section.id) past = true;
        });
      }
    },

    closeSection(section) {
      section = el(section);
      if (!section) return;
      section.classList.remove('active');
      const content = section.querySelector(':scope > .a-item');
      if (content) content.style.display = 'none';
      fire('accordion_section_closed', { sectionId: section.id });
    },

    hideSection(section) {
      section = el(section);
      if (!section) return;
      section.style.display = 'none';
      fire('accordion_section_hidden', { sectionId: section.id });
    },

    showSection(section) {
      section = el(section);
      if (!section) return;
      section.style.display = '';
      location.hash = section.id;
      fire('accordion_section_shown', { sectionId: section.id });
    },

    openNextSection(setAllow) {
      const index = this.sections.findIndex((s) => s.id === this.currentSectionId);
      const next = this.sections[index + 1];
      if (index === -1 || !next) return;
      if (setAllow) next.classList.add('allow');
      this.openSection(next);
    },

    openPrevSection(setAllow, onlyAllowed) {
      const index = this.sections.findIndex((s) => s.id === this.currentSectionId);
      if (index <= 0) return;
      let prev = index - 1;
      if (onlyAllowed) {
        while (prev > 0 && !this.sections[prev].classList.contains('allow')) prev--;
      }
      const section = this.sections[prev];
      if (!section) return;
      if (setAllow) section.classList.add('allow');
      this.openSection(section);
    },

    closeExistingSection() {
      if (this.currentSectionId) this.closeSection($id(this.currentSectionId));
    }
  };

  const Checkout = window.Checkout = {
    loadWaiting: false,
    failureUrl: false,

    init(failureUrl) {
      this.loadWaiting = false;
      this.failureUrl = failureUrl;
      Accordion.disallowAccessToNextSections = true;
    },

    ajaxFailure() {
      location.href = Checkout.failureUrl;
    },

    _disableEnableAll(container, isDisabled) {
      container.querySelectorAll('*').forEach((e) => { e.disabled = isDisabled; });
      if (isDisabled) container.disabled = true;
    },

    setLoadWaiting(step, keepDisabled) {
      if (step) {
        if (this.loadWaiting) this.setLoadWaiting(false);
        const container = $id(step + '-buttons-container');
        if (container) {
          container.classList.add('disabled');
          container.style.opacity = '.5';
          this._disableEnableAll(container, true);
        }
        show('#' + step + '-please-wait', true);
      } else if (this.loadWaiting) {
        const container = $id(this.loadWaiting + '-buttons-container');
        if (container) {
          if (!keepDisabled) {
            container.classList.remove('disabled');
            container.style.opacity = '1';
          }
          this._disableEnableAll(container, !!keepDisabled);
        }
        show('#' + this.loadWaiting + '-please-wait', false);
      }
      this.loadWaiting = step;
    },

    gotoSection(section) {
      const s = $id('opc-' + section);
      if (!s) return;
      s.classList.add('allow');
      Accordion.openSection(s);
    },

    back() {
      if (this.loadWaiting) return;
      Accordion.openPrevSection(true, true);
    },

    setStepResponse(response) {
      if (response.update_section) {
        nw.html($id('checkout-' + response.update_section.name + '-load'), response.update_section.html);
      }
      (response.allow_sections || []).forEach((e) => $id('opc-' + e)?.classList.add('allow'));

      const billingSelect = $id('billing-address-select');
      Billing.newAddress(billingSelect ? !billingSelect.value : true);

      const shippingSelect = $id('shipping-address-select');
      if (shippingSelect) {
        Shipping.newAddress(response.selected_id === undefined ? shippingSelect.value : response.selected_id, billingSelect ? billingSelect.value : undefined);
      }

      if (response.goto_section) {
        Checkout.gotoSection(response.goto_section);
        return true;
      }
      if (response.redirect) {
        location.href = response.redirect;
        return true;
      }
      return false;
    }
  };

  //a step's POST: wait state, JSON response handler, failure redirect
  function saveStep(step, url, form, handler, keepDisabled) {
    Checkout.setLoadWaiting(step);
    return post(url, form)
      .then(handler, Checkout.ajaxFailure)
      .finally(() => Checkout.setLoadWaiting(false, keepDisabled && keepDisabled()));
  }

  function stepResponse(response) {
    if (response.error) {
      alertMessage(response);
      return false;
    }
    Checkout.setStepResponse(response);
  }

  const Billing = window.Billing = {
    form: false,
    getAddressUrl: '',
    saveUrl: '',
    disableBillingAddressCheckoutStep: false,
    guest: false,
    selectedStateId: 0,

    init(form, getAddressUrl, saveUrl, disableBillingAddressCheckoutStep, guest) {
      this.form = form;
      this.getAddressUrl = getAddressUrl;
      this.saveUrl = saveUrl;
      this.disableBillingAddressCheckoutStep = disableBillingAddressCheckoutStep;
      this.guest = guest;
    },

    newAddress(isNew) {
      show('#save-billing-address-button', false);
      show('#billing-new-address-form', isNew);
      show('#edit-billing-address-button', !isNew);
      show('#delete-billing-address-button', !isNew);
      fire('onepagecheckout_billing_address_new');
      if (isNew) Billing.editAddress();
    },

    setDefaultCountry(defaultCountry) {
      const select = document.querySelector('#opc-billing select[data-trigger="country-select"]');
      if (!select) return;
      select.value = defaultCountry;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },

    resetSelectedAddress() {
      const select = $id('billing-address-select');
      if (select) select.value = '';
      fire('onepagecheckout_billing_address_reset');
    },

    save() {
      if (Checkout.loadWaiting !== false) return;
      saveStep('billing', this.saveUrl, this.form, Billing.nextStep);
    },

    resetLoadWaiting() {
      Checkout.setLoadWaiting(false);
    },

    nextStep(response) {
      if (typeof response.wrong_billing_address === 'undefined') response.wrong_billing_address = false;
      if (Billing.disableBillingAddressCheckoutStep) {
        if (response.wrong_billing_address) Accordion.showSection('#opc-billing');
        else Accordion.hideSection('#opc-billing');
      }
      return stepResponse(response);
    },

    //country → state is handled for every select[data-trigger=country-select] by nopwara-core.js
    initializeCountrySelect() { },

    editAddress() {
      Billing.resetBillingForm();
      const select = $id('billing-address-select');
      const selectedItem = select ? select.value : undefined;
      nw.get(this.getAddressUrl, { addressId: selectedItem })
        .then((data) => fillAddress('BillingNewAddress_', data || {}), Checkout.ajaxFailure)
        .finally(() => {
          show('#billing-new-address-form', true);
          show('#edit-billing-address-button', false);
          show('#delete-billing-address-button', false);
          if (selectedItem && selectedItem != 0) show('#save-billing-address-button', true);
        });
    },

    saveEditAddress(url) {
      let selectedId;
      nw.post(url + '?opc=true', nw.serialize(el(this.form)))
        .then((response) => {
          if (response.error) {
            window.alert(response.message);
            return;
          }
          selectedId = response.selected_id;
          Checkout.setStepResponse(response);
          Billing.resetBillingForm();
        }, Checkout.ajaxFailure)
        .finally(() => {
          const select = $id('billing-address-select');
          if (select && selectedId) select.value = selectedId;
        });
    },

    deleteAddress(url) {
      const select = $id('billing-address-select');
      nw.get(url, { addressId: select ? select.value : '', opc: 'true' })
        .then((response) => Checkout.setStepResponse(response), Checkout.ajaxFailure);
    },

    setSelectedStateId(id) {
      this.selectedStateId = id;
      //picked by nopwara-core.js when the states for the new country arrive
      document.querySelectorAll('#BillingNewAddress_StateProvinceId, #ShippingNewAddress_StateProvinceId').forEach((s) => { s.dataset.selectedState = id; });
    },

    resetBillingForm() {
      resetForm('billing-new-address-form');
    }
  };

  const Shipping = window.Shipping = {
    form: false,
    saveUrl: false,

    init(form, saveUrl) {
      this.form = form;
      this.saveUrl = saveUrl;
    },

    newAddress(id, billingAddressId) {
      const isNew = !id;
      if (isNew) {
        this.resetSelectedAddress();
        show('#shipping-new-address-form', true);
        show('#edit-shipping-address-button', false);
        show('#delete-shipping-address-button', false);
      } else {
        show('#shipping-new-address-form', false);
        show('#save-shipping-address-button', false);
        const own = id == billingAddressId || (id !== undefined && billingAddressId === undefined);
        show('#edit-shipping-address-button', !own);
        show('#delete-shipping-address-button', !own);
      }
      fire('onepagecheckout_shipping_address_new');
    },

    resetSelectedAddress() {
      const select = $id('shipping-address-select');
      if (select) select.value = '';
      fire('onepagecheckout_shipping_address_reset');
    },

    editAddress(url) {
      Shipping.resetShippingForm();
      const select = $id('shipping-address-select');
      nw.get(url, { addressId: select ? select.value : undefined })
        .then((data) => fillAddress('ShippingNewAddress_', data || {}), Checkout.ajaxFailure)
        .finally(() => {
          show('#shipping-new-address-form', true);
          show('#edit-shipping-address-button', false);
          show('#delete-shipping-address-button', false);
          show('#save-shipping-address-button', true);
        });
    },

    saveEditAddress(url) {
      let selectedId;
      nw.post(url + '?opc=true', nw.serialize(el(this.form)))
        .then((response) => {
          if (response.error) {
            window.alert(response.message);
            return;
          }
          selectedId = response.selected_id;
          Checkout.setStepResponse(response);
          Shipping.resetShippingForm();
        }, Checkout.ajaxFailure)
        .finally(() => {
          const select = $id('shipping-address-select');
          if (select && selectedId) select.value = selectedId;
        });
    },

    deleteAddress(url) {
      const select = $id('shipping-address-select');
      nw.get(url, { addressId: select ? select.value : '', opc: 'true' })
        .then((response) => Checkout.setStepResponse(response), Checkout.ajaxFailure);
    },

    save() {
      if (Checkout.loadWaiting !== false) return;
      saveStep('shipping', this.saveUrl, this.form, Shipping.nextStep);
    },

    resetLoadWaiting() {
      Checkout.setLoadWaiting(false);
    },

    nextStep: stepResponse,

    initializeCountrySelect() { },

    resetShippingForm() {
      resetForm('shipping-new-address-form');
    }
  };

  //shipping and payment method steps share validation: a method must exist and be selected
  function methodStep(step, inputName) {
    return {
      form: false,
      saveUrl: false,
      localized_data: false,

      init(form, saveUrl, localized_data) {
        this.form = form;
        this.saveUrl = saveUrl;
        this.localized_data = localized_data;
      },

      validate() {
        const methods = document.getElementsByName(inputName);
        if (methods.length === 0) {
          window.alert(this.localized_data.NotAvailableMethodsError);
          return false;
        }
        if (Array.prototype.some.call(methods, (m) => m.checked)) return true;
        window.alert(this.localized_data.SpecifyMethodError);
        return false;
      },

      save() {
        if (Checkout.loadWaiting !== false) return;
        if (this.validate()) saveStep(step, this.saveUrl, this.form, stepResponse);
      },

      resetLoadWaiting() {
        Checkout.setLoadWaiting(false);
      },

      nextStep: stepResponse
    };
  }

  window.ShippingMethod = methodStep('shipping-method', 'shippingoption');

  window.PaymentMethod = Object.assign(methodStep('payment-method', 'paymentmethod'), {
    toggleUseRewardPoints(input) {
      show('#payment-method-block', !input.checked);
    }
  });

  window.PaymentInfo = {
    form: false,
    saveUrl: false,

    init(form, saveUrl) {
      this.form = form;
      this.saveUrl = saveUrl;
    },

    save() {
      if (Checkout.loadWaiting !== false) return;
      saveStep('payment-info', this.saveUrl, this.form, stepResponse);
    },

    resetLoadWaiting() {
      Checkout.setLoadWaiting(false);
    },

    nextStep: stepResponse
  };

  const ConfirmOrder = window.ConfirmOrder = {
    form: false,
    saveUrl: false,
    successUrl: false,
    isSuccess: false,
    isCaptchaEnabled: false,
    isReCaptchaV3: false,
    recaptchaPublicKey: '',
    div: false,

    init(saveUrl, successUrl, isCaptchaEnabled, isReCaptchaV3, recaptchaPublicKey, div) {
      this.div = div;
      this.saveUrl = saveUrl;
      this.successUrl = successUrl;
      this.isCaptchaEnabled = isCaptchaEnabled;
      this.isReCaptchaV3 = isReCaptchaV3;
      this.recaptchaPublicKey = recaptchaPublicKey;
    },

    async save() {
      if (Checkout.loadWaiting !== false) return;

      const terms = $id('termsofservice');
      if (terms && !terms.checked) {
        const warning = $id('terms-of-service-warning-box');
        nw.dialog({ html: warning ? warning.innerHTML : '', title: warning ? warning.title : '', className: 'warning', width: 380 });
        return false;
      }

      Checkout.setLoadWaiting('confirm-order');
      const data = {};
      if (ConfirmOrder.isCaptchaEnabled) data['g-recaptcha-response'] = await ConfirmOrder.getCaptchaToken('OpcConfirmOrder');
      nw.post(this.saveUrl, data)
        .then(ConfirmOrder.nextStep, Checkout.ajaxFailure)
        .finally(() => Checkout.setLoadWaiting(false, ConfirmOrder.isSuccess));
    },

    getCaptchaToken(action) {
      if (ConfirmOrder.isReCaptchaV3) {
        return new Promise((resolve) => grecaptcha.ready(() => grecaptcha.execute(this.recaptchaPublicKey, { action: action }).then(resolve)));
      }
      const box = document.querySelector(this.div + ' .captcha-box textarea[name="g-recaptcha-response"]');
      return Promise.resolve(box ? box.value : '');
    },

    resetLoadWaiting() {
      Checkout.setLoadWaiting(false, ConfirmOrder.isSuccess);
    },

    nextStep(response) {
      if (response.error) {
        alertMessage(response);
        return false;
      }
      if (response.redirect) {
        ConfirmOrder.isSuccess = true;
        location.href = response.redirect;
        return;
      }
      if (response.success) {
        ConfirmOrder.isSuccess = true;
        window.location = ConfirmOrder.successUrl;
      }
      Checkout.setStepResponse(response);
    }
  };
})();
