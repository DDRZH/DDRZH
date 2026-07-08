function createRequestLogger(baseLogger, context = {}) {
  return {
    debug(message, metadata) {
      log(baseLogger, "debug", message, context, metadata);
    },
    info(message, metadata) {
      log(baseLogger, "info", message, context, metadata);
    },
    warn(message, metadata) {
      log(baseLogger, "warn", message, context, metadata);
    },
    error(message, metadata) {
      log(baseLogger, "error", message, context, metadata);
    }
  };
}

function errorMetadata(error) {
  if (!error) return {};
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    errorMessage: err.message,
    errorName: err.name
  };
}

function log(baseLogger, level, message, context, metadata) {
  const method = baseLogger?.[level];
  if (typeof method !== "function") return;
  method(message, {
    ...context,
    ...(metadata || {})
  });
}

module.exports = {
  createRequestLogger,
  errorMetadata
};
