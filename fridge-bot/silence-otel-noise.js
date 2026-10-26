import { diag } from "@opentelemetry/api";

/**
 * @cursor/sdk can end its `writeInitialRequest` span twice. OTel then logs
 * "You can only call end() on a span once" through Agent SDK's `[bdk:otel]`
 * diag logger. The second end is already a no-op; only the log is noise.
 */
export function silenceOtelDoubleEndNoise() {
  const original = diag.setLogger.bind(diag);
  diag.setLogger = (logger, options) => {
    if (logger == null || typeof logger !== "object") {
      return original(logger, options);
    }
    return original(
      {
        ...logger,
        error(message, ...args) {
          if (
            typeof message === "string" &&
            message.includes("You can only call end() on a span once")
          ) {
            return;
          }
          return logger.error?.(message, ...args);
        },
      },
      options,
    );
  };
}
