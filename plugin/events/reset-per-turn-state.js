import { resetPerTurnState } from "../shared/state.js";
import { BOT_BANTER_WINDOW_MS } from "../shared/constants.js";

export function createResetPerTurnState(state, config, log) {
  return async (event, ctx) => {
    resetPerTurnState(state);
    state.currentTurn++;
    state.promptTurnCount++;
    state.lastMessageReceivedTime = Date.now();

    const senderIsBot = Boolean(
      event?.metadata?.bot ||
      event?.metadata?.author?.bot ||
      event?.metadata?.isBot ||
      event?.metadata?.sender?.bot,
    );
    state.inboundIsBot = senderIsBot;

    if (senderIsBot) {
      const chKey = ctx?.channelId || ctx?.conversationId || "global";
      const banter = state.botBanterState.get(chKey) || {
        count: 0,
        windowStart: Date.now(),
        hostileSent: false,
      };

      if (Date.now() - banter.windowStart > BOT_BANTER_WINDOW_MS) {
        banter.count = 0;
        banter.windowStart = Date.now();
        banter.hostileSent = false;
      }

      banter.count++;
      state.botBanterState.set(chKey, banter);
      log.info("bot message received", { count: banter.count, channel: chKey });
    } else {
      state.botBanterState.clear();
      state.inboundIsBot = false;
      log.info("human message received, banter counters reset");
    }
  };
}
