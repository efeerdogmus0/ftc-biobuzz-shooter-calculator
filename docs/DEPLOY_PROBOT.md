# Deploying ProbotShooter under probotstudio.com

**Status: preparation only.** The public preview is GitHub Pages:
https://efeerdogmus0.github.io/ftc-biobuzz-shooter-calculator/. Nothing here
claims that the app is served from probotstudio.com. No DNS or CNAME change is
part of this repository.

## Build for a subpath such as `/shooter/`

The default build uses a relative base (`./`), so the same `dist/` works at any
path. To pin the path explicitly:

```sh
npm ci
VITE_BASE=/shooter/ npm run build   # → dist/ (index.html, assets/, 4 worker chunks)
```

Copy `dist/` to the web root's `shooter/` folder:

- Serve it as static files.
- No rewrites are needed: state lives in the URL hash (`#s=1.…`, `#reset`) and `localStorage`.
- HTTPS is required for "Paylaşım bağlantısını kopyala" (Clipboard API).
- Module workers load same-origin from `assets/`.

## Storage on a shared origin

Under `probotstudio.com` the app shares `localStorage` with the other Probot tools. Its keys are:

- `pollen-active`: the active scenario
- `pollen-profiles`: named profiles
- `pollen-ui-mode`: the interface mode

Saved work does not move between origins. Profiles from the GitHub Pages preview must be exported (Dosya → Profili dışa aktar) and imported again on the new origin, or carried over with a share link.

## Fonts

`index.html` loads Baloo 2, Inter and JetBrains Mono from Google Fonts. If the host serves these itself, replace the `<link>` tags; the CSS falls back to system fonts.
