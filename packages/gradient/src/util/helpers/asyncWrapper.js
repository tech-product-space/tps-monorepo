export default (fn) => {
  // `inner` lets the API docs (apps/api/lib/openapi) read the real handler's source.
  return Object.assign(
    function (req, res, next) {
      Promise.resolve(fn(req, res, next)).catch(next);
    },
    { inner: fn },
  );
};
