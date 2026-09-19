/**
 * Express 5's router throws away the path string of `router.use(path, ...)`
 * (it keeps only a compiled matcher), which makes it impossible to rebuild full
 * route paths by walking the stack. This remembers it as `layer.rawPath`.
 *
 * MUST be required before anything loads `express`/`router` (see apps/api/app.js);
 * it swaps the Layer class in the module cache, and `router` binds it on load.
 * If that ordering is ever broken the docs still build, just with missing mount
 * prefixes — `assertRecorderActive()` (used by the docs builder) says so loudly.
 */
const path = require("path");

const layerPath = require.resolve("router/lib/layer", {
  paths: [path.dirname(require.resolve("express"))],
});

if (!require.cache[layerPath] || !require.cache[layerPath].exports.__recordsPaths) {
  const Orig = require(layerPath);

  function Layer(p, options, fn) {
    if (!(this instanceof Layer)) return new Layer(p, options, fn);
    Orig.call(this, p, options, fn);
    this.rawPath = p;
  }
  Object.setPrototypeOf(Layer, Orig);
  Layer.prototype = Object.create(Orig.prototype);
  Layer.prototype.constructor = Layer;
  Layer.__recordsPaths = true;

  require.cache[layerPath].exports = Layer;
}

module.exports = {
  assertRecorderActive(sampleLayer) {
    if (sampleLayer && !("rawPath" in sampleLayer)) {
      throw new Error("recordLayerPaths was required after express loaded; mount prefixes would be missing from the docs");
    }
  },
};
