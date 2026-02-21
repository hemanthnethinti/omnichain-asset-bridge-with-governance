function log(message, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    message,
    ...meta
  };
  console.log(JSON.stringify(payload));
}

function error(message, err, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level: "error",
    message,
    error: err?.message || String(err),
    ...meta
  };
  console.error(JSON.stringify(payload));
}

module.exports = {
  log,
  error
};
