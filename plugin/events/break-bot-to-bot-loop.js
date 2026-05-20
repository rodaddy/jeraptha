import {
  BOT_BANTER_LIMIT,
  BOT_BANTER_HOSTILE_MESSAGES,
} from "../shared/constants.js";

export function createBreakBotToBotLoop(state, config, log) {
  return async (event, ctx) => {
    if (!state.inboundIsBot) return {};

    const chKey = ctx?.channelId || ctx?.conversationId || "global";
    const banter = state.botBanterState.get(chKey);
    if (!banter || banter.count <= BOT_BANTER_LIMIT) return {};

    if (!banter.hostileSent) {
      banter.hostileSent = true;
      state.botBanterState.set(chKey, banter);
      const msg = BOT_BANTER_HOSTILE_MESSAGES[
        Math.floor(Math.random() * BOT_BANTER_HOSTILE_MESSAGES.length)
      ].replace("{count}", String(banter.count));
      log(
        "bot-banter-gate: HOSTILE RESPONSE (" +
          banter.count +
          " exchanges in " +
          chKey +
          ")",
      );
      return { content: msg };
    }

    log(
      "bot-banter-gate: CANCELLED (post-hostile, " +
        banter.count +
        " exchanges in " +
        chKey +
        ")",
    );
    return { cancel: true };
  };
}
