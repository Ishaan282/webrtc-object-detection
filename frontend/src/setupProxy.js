const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/peerjs',
    createProxyMiddleware({
      target: 'http://localhost:9000',
      ws: true,
      changeOrigin: true
    })
  );
};