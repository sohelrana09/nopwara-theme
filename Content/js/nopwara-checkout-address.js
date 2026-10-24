/*
 * Multi-step checkout address pages without jQuery: a port of core wwwroot/js/public.billingaddress.js and
 * public.shippingaddress.js with the same objects (CheckoutBilling, CheckoutShipping) and methods.
 * Loaded by Views/Checkout/BillingAddress.cshtml and ShippingAddress.cshtml.
 */
(function () {
  'use strict';

  const $id = (id) => document.getElementById(id);
  const show = (selector, visible) => document.querySelectorAll(selector).forEach((el) => { el.style.display = visible ? '' : 'none'; });

  function create(kind, prefix, formBox, onEdit) {
    const self = {
      form: false,
      selectedStateId: 0,

      init(form) {
        this.form = form;
      },

      editAddress(url, addressId, titleText) {
        self.resetForm();
        nw.get(url, { addressId: addressId })
          .then((data) => {
            Object.keys(data || {}).forEach((id) => {
              const value = data[id];
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
              if (value === null) return;
              if (id.indexOf('StateProvinceId') >= 0) self.setSelectedStateId(value);
              const field = $id(prefix + id);
              if (!field) return;
              field.value = value;
              if (id.indexOf('CountryId') >= 0) field.dispatchEvent(new Event('change', { bubbles: true }));
            });
          })
          .catch((err) => window.alert(err))
          .finally(() => {
            onEdit();
            const title = document.querySelector('#' + formBox + ' .title-text');
            if (title) title.innerHTML = titleText;
          });
      },

      saveEditAddress(url) {
        nw.post(url, nw.serialize(document.querySelector(this.form)))
          .then((response) => {
            if (response.redirect) location.href = response.redirect;
            else if (response.error) window.alert(response.message);
          })
          .catch((err) => window.alert(err));
      },

      deleteEditAddress(url, addressId) {
        nw.get(url, { addressId: addressId })
          .then((response) => { location.href = response.redirect; })
          .catch((err) => window.alert(err));
      },

      resetForm() {
        const box = $id(formBox);
        if (box) {
          box.querySelectorAll('input, select, textarea').forEach((input) => {
            if (['button', 'submit', 'reset', 'hidden'].indexOf(input.type) !== -1) return;
            if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
            else if (input.tagName !== 'SELECT') input.value = '';
          });
        }
        document.querySelectorAll('select').forEach((select) => {
          if (select.querySelector('option[value="0"]')) select.value = '0';
        });
      },

      setSelectedStateId(id) {
        this.selectedStateId = id;
        //picked by nopwara-core.js when the states for the new country arrive
        const state = $id(prefix + 'StateProvinceId');
        if (state) state.dataset.selectedState = id;
      }
    };
    self['reset' + kind + 'Form'] = self.resetForm;
    return self;
  }

  window.CheckoutBilling = create('Billing', 'BillingNewAddress_', 'billingaddress-new-form', () => {
    show('#toggle-billing-address, #billingaddress-next-button', false);
    show('#billingaddress-save-button, #billingaddress-cancel-button', true);
  });

  window.CheckoutShipping = create('Shipping', 'ShippingNewAddress_', 'shippingaddress-new-form', () => {
    show('#shipping-addresses-form, #shippingaddress-next-button', false);
    show('#shippingaddress-save-button, #shippingaddress-cancel-button', true);
  });
})();
