/**
 * Creates the shared state object for all Jeraptha gates.
 *
 * Per-turn state (reset by resetPerTurnState on each message_received):
 *   obQueriedThisTurn, sopSearchedThisTurn, skillConsultedThisTurn,
 *   contradictionCountThisTurn, reviewPromisedThisTurn, reviewAgentSpawned, prReviewContext
 *
 * Session state (persists across turns):
 *   currentTurn, promptTurnCount, lastTasksWriteTurn, lastConversationsWriteTurn,
 *   lastScorecardWriteTime, lastMessageReceivedTime, toolCallsSinceMessage,
 *   tasksReadThisSession, conversationsReadThisSession, obContextLoadedThisSession,
 *   sentimentLastMsg, resumeConsumed, contradictionGateFailures
 *
 * Bot-banter state:
 *   botBanterState (Map<channelKey, {count, windowStart, hostileSent}>), inboundIsBot
 */
export function createState() {
  return {
    // Per-turn flags (reset in message_received)
    obQueriedThisTurn: false,
    sopSearchedThisTurn: false,
    skillConsultedThisTurn: false,

    // Sentiment tracking
    sentimentLastMsg: "",

    // Turn counting
    promptTurnCount: 0,
    currentTurn: 0,

    // Staleness tracking
    lastTasksWriteTurn: 0,
    lastConversationsWriteTurn: 0,
    lastScorecardWriteTime: Date.now(),
    lastMessageReceivedTime: Date.now(),

    // Work tracking
    toolCallsSinceMessage: 0,

    // Context tracking (per-session, not per-turn)
    tasksReadThisSession: false,
    conversationsReadThisSession: false,
    obContextLoadedThisSession: false,

    // Bot-banter circuit breaker
    // Map<channelKey, { count: number, windowStart: number, hostileSent: boolean }>
    botBanterState: new Map(),
    inboundIsBot: false,

    // One-shot flags
    resumeConsumed: false,

    // Message context (set by scan-message-context injection during before_prompt_build)
    recentUserMessages: "",
    factualQuestionThisTurn: false,

    // Contradiction-check gate
    contradictionCountThisTurn: 0,
    contradictionGateFailures: 0,
    contradictionCircuitBreakerUntil: null,

    // Verify-before-praise gate
    reviewPromisedThisTurn: false,
    reviewAgentSpawned: false,
    prInvestigatedIds: new Set(),
    prDetectedIds: new Set(),
    prReviewContext: false,
  };
}

export function resetPerTurnState(state) {
  state.obQueriedThisTurn = false;
  state.sopSearchedThisTurn = false;
  state.skillConsultedThisTurn = false;
  state.contradictionCountThisTurn = 0;
  state.reviewPromisedThisTurn = false;
  state.reviewAgentSpawned = false;
  state.prReviewContext = false;
  state.recentUserMessages = "";
  state.factualQuestionThisTurn = false;
}
