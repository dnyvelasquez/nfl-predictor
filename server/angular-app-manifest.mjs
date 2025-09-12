
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
    'index.csr.html': {size: 69380, hash: '6791381e29f2c4a27cf6173cefdc4251d536d42a26e5026a0c7aabc5ea11d643', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 17145, hash: '2d497b2c5759896e74d4818d9b543ba1497bd56904cd71364c64df4acbf664df', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'index.html': {size: 74927, hash: '2552297059a2889df307e20c93fd9eae1cca97eb8300b8768e4ba753a18ed58c', text: () => import('./assets-chunks/index_html.mjs').then(m => m.default)},
    'puntajes/index.html': {size: 83744, hash: '09ece67f2b259f404400b18c3d00c7288c0a8e8db59901ea69ae7daf47a04a8e', text: () => import('./assets-chunks/puntajes_index_html.mjs').then(m => m.default)},
    'reglamento/index.html': {size: 77198, hash: '5463a6b85e2aea2f17950f76ec0078377a06df4e3b57b98e22282a0a266ed4e0', text: () => import('./assets-chunks/reglamento_index_html.mjs').then(m => m.default)},
    'equipos/index.html': {size: 86388, hash: '150391d1ccf5fc1c039060bfe67809746154ce6b35cf28319895d6e5ee1de1b5', text: () => import('./assets-chunks/equipos_index_html.mjs').then(m => m.default)},
    'styles-BSXEOMAR.css': {size: 53687, hash: '5LJiXKB3p/k', text: () => import('./assets-chunks/styles-BSXEOMAR_css.mjs').then(m => m.default)}
  },
};
