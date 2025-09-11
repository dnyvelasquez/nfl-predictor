
export default {
  bootstrap: () => import('./main.server.mjs').then(m => m.default),
  inlineCriticalCss: true,
  baseHref: '/nfl-predictor/',
  locale: undefined,
  routes: [
  {
    "renderMode": 2,
    "route": "/nfl-predictor"
  },
  {
    "renderMode": 2,
    "route": "/nfl-predictor/equipos"
  },
  {
    "renderMode": 2,
    "route": "/nfl-predictor/puntajes"
  },
  {
    "renderMode": 2,
    "route": "/nfl-predictor/reglamento"
  }
],
  entryPointToBrowserMapping: undefined,
  assets: {
    'index.csr.html': {size: 69380, hash: '60968e2e8946e80c2d2f4a9e0d334f68d9391ece40541fe959049879b60eff7b', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 17145, hash: 'd8125977519cdb657b7bfb2e226ffb0f497ac789dd428574834d9311f59b76d8', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'index.html': {size: 74926, hash: '18c628141e7085cfec6bf452da6f95fe28984e9a1e293763c7a1b8f6aa25a6de', text: () => import('./assets-chunks/index_html.mjs').then(m => m.default)},
    'reglamento/index.html': {size: 77198, hash: 'a2a0170c27072fddbdb913dc60e5a7bf0df23d8f0d2a33ce4c2d2ce7ba4fa3a6', text: () => import('./assets-chunks/reglamento_index_html.mjs').then(m => m.default)},
    'equipos/index.html': {size: 86387, hash: 'c265a53a4b5b4772f9629f320f2d0fc0fd9704df5bac372b566efa5eeaf40fef', text: () => import('./assets-chunks/equipos_index_html.mjs').then(m => m.default)},
    'puntajes/index.html': {size: 83742, hash: 'be587c97b08841fbdc22fe50ccd37fb1b83fd6b080b0ed8e51a7d020ac365387', text: () => import('./assets-chunks/puntajes_index_html.mjs').then(m => m.default)},
    'styles-BSXEOMAR.css': {size: 53687, hash: '5LJiXKB3p/k', text: () => import('./assets-chunks/styles-BSXEOMAR_css.mjs').then(m => m.default)}
  },
};
