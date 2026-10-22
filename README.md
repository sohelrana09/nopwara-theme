# Nopwara theme for nopCommerce

A lightweight storefront theme for nopCommerce 5.00, built with **Tailwind CSS v4** and **Alpine.js 3**. It follows the Hyvä approach from Magento: core views are rewritten one at a time with utility classes and small Alpine components, while the ids and classes that core jQuery scripts depend on are kept, so core features keep working.

## Features

- **Layout:**
  - header with mega-menu, account links, search and flyout cart (with a Checkout button);
  - footer, one- and two-column layouts;
  - toast notifications instead of the core notification bar.
- **Catalog:**
  - ajax layered navigation with filter chips and "Clear all", plus back/forward history that restores the filters, sort and page size;
  - a dual-handle price range slider;
  - long filter lists collapse after six values;
  - a "Show more products" button that loads the next page.
- **Product page (simple and grouped):**
  - gallery with thumbnails;
  - tabs for description, specifications and reviews;
  - pill and swatch attributes;
  - a styled estimate-shipping popup;
  - in-browser checks of required attributes before "Add to cart" posts.
- **Cart and checkout:** cart page, order-completed page, and the core one-page checkout styled. For a true single-page checkout, use [nopwara-checkout](https://github.com/sohelrana09/nopwara-checkout).
- **Generic core pages:** account, login, register, blog and topics are styled globally in `tailwind/app.css`. Views that aren't overridden still look consistent.
- **Widget zones for companion plugins:**
  - `nopwara_productdetails_after_tabs` on the product page;
  - `nopwara_productbox_actions` on product boxes;
  - `nopwara_flyoutcart_top` in the flyout cart.

## Companion plugins

| Plugin | Repo |
|---|---|
| Single-page checkout | [nopwara-checkout](https://github.com/sohelrana09/nopwara-checkout) |
| Instant search | [nopwara-instant-search](https://github.com/sohelrana09/nopwara-instant-search) |
| Quick view | [nopwara-quick-view](https://github.com/sohelrana09/nopwara-quick-view) |
| Conversion widgets (free-shipping bar, countdown, low stock, sticky add to cart) | [nopwara-boost](https://github.com/sohelrana09/nopwara-boost) |
| Product Q&A | [nopwara-product-qa](https://github.com/sohelrana09/nopwara-product-qa) |
| Product bundles | [nopwara-bundles](https://github.com/sohelrana09/nopwara-bundles) |
| Webhooks | [nopwara-webhooks](https://github.com/sohelrana09/nopwara-webhooks) |
| Google sign-in | [nopwara-google-signin](https://github.com/sohelrana09/nopwara-google-signin) |

`tailwind/app.css` scans each plugin's `Views` folder (`@source` lines). Remove the lines for plugins you don't use, or keep them: a missing folder is skipped.

## Requirements

- nopCommerce **5.00**
- Node.js 20+ to rebuild the CSS (the built `Content/css/styles.css` is included)

## Install

1. Copy this folder to `src/Presentation/Nop.Web/Themes/Nopwara`.
2. In admin, go to Configuration → Settings → General settings and choose **Nopwara** as the store theme.
3. After changing views, rebuild the CSS:

```bash
cd tailwind
npm install
npm run build
```

`npm run watch` rebuilds on every change. See [tailwind/README.md](tailwind/README.md) for how views are overridden.

## License

Copyright (C) 2026 Sohel Rana

Licensed under the [GNU Affero General Public License v3.0](LICENSE), the license nopCommerce itself is built on (the [nopCommerce Public License](https://www.nopcommerce.com/license) is AGPL v3 plus its additional terms). Parts of this project are adapted from nopCommerce source code. A store that uses it must keep nopCommerce's "Powered by nopCommerce" link, as the nopCommerce Public License requires.
