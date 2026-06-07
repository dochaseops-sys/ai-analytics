export function buildGA4EventParameters(measurementId: string, eventName: string, extraParameters: Record<string, string> = {}) {
  return {
    measurementId,
    eventName,
    ...extraParameters
  };
}
