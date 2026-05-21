export function createTrackMessageSentState(state, config, log) {
  return async (event, ctx) => {
    if (event?.success !== true) {
      log.warn("message delivery failed; silent-work counter preserved", {
        error: event?.error,
      });
      return {};
    }
    state.toolCallsSinceMessage = 0;
    log.info("message delivered", { turn: state.currentTurn });
    return {};
  };
}
