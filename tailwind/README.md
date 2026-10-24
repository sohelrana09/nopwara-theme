# Nopwara theme tooling

Nopwara is a Tailwind CSS + Alpine.js theme (the Hyvä approach, applied to nopCommerce).

```bash
npm install        # once
npm run build      # copy Alpine to ../Content/js, build minified ../Content/css/styles.min.css
npm run watch      # rebuild CSS while editing views
```

- `app.css` is the Tailwind source. Only `../Views` and `../Content/js/nopwara*.js` are scanned for classes.
- To restyle a page, copy the view from `Nop.Web/Views/...` (or a plugin's `Views/...`) to the same relative path under `../Views/` and rewrite it with Tailwind classes and Alpine directives.
- Core views that are not overridden yet still render with their original markup and the jQuery scripts loaded by `_Root.Head.cshtml`.
- `Nop.Web.csproj` publishes everything under `Themes/**`; delete `tailwind/node_modules` before `dotnet publish`.
