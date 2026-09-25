# @splinetool/viewer 1.9.82 — self-hosted

Used only by `js/robot.js` (cap. 05 of `capitoli-legacy.html`, the Spline robot).
Downloaded from the npm package `@splinetool/viewer@1.9.82` (`build/*.js`).

`spline-viewer.js` is the official build with ONE mechanical change: the eight
hard-coded third-party URLs were replaced so nothing leaves our origin.

| was | now |
|---|---|
| runtime build base (npm `@splinetool/runtime@1.9.82/build/`) | `new URL("./", import.meta.url)` |
| `@splinetool/{modelling,navmesh,boolean}-wasm@1.9.82/build` | `./wasm/` |
| `@splinetool/ui-wasm@1.9.82/build/ui.wasm` | `./wasm/ui.wasm` (NOT shipped: 6 MB, unused by our scene) |
| Google DRACO decoders 1.5.2 | `./draco/` |
| Spline logo icon (app.spline.design) | `./spline-icon.png` (same image, the "Built with Spline" badge is kept) |

`wasm/*.wasm` come from the matching npm packages at 1.9.82, `draco/` from the
official DRACO 1.5.2 decoders. The `integrity` in `js/robot.js` is computed on
the patched file. Scene features that call Spline's own services (webhooks,
external APIs, AI voice) are not used by our scene and were left untouched.
