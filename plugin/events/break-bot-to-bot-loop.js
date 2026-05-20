import {
  BOT_BANTER_LIMIT,
  BOT_BANTER_HOSTILE_MESSAGES,
} from "../shared/constants.js";

export function createBreakBotToBotLoop(state, config, log) {
  return async (event, ctx) => {
    if (!state.inboundIsBot) {
      log.skip("message-sending", "not bot inbound");
      return {};
    }

    const chKey = ctx?.channelId || ctx?.conversationId || "global";
    const banter = state.botBanterState.get(chKey);
    if (!banter || banter.count <= BOT_BANTER_LIMIT) {
      log.allow("message-sending", "under banter limit");
      return {};
    }

    if (!banter.hostileSent) {
      banter.hostileSent = true;
      state.botBanterState.set(chKey, banter);
      const msg = BOT_BANTER_HOSTILE_MESSAGES[
        Math.floor(Math.random() * BOT_BANTER_HOSTILE_MESSAGES.length)
      ].replace("{count}", String(banter.count));
      log.info("hostile response sent", {
        count: banter.count,
        channel: chKey,
      });
      return { content: msg };
    }

    log.info("cancelled post-hostile", { count: banter.count, channel: chKey });
    return { cancel: true };
  };
}
