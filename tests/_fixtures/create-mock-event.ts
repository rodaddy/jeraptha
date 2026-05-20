interface MockMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ToolCallEventOptions {
  messages?: MockMessage[];
  lastUserMessageTimestamp?: number;
}

interface MockContext {
  sessionKey?: string;
  channelId?: string;
  conversationId?: string;
}

export function createToolCallEvent(
  toolName: string,
  params: Record<string, any> = {},
  options?: ToolCallEventOptions,
) {
  return {
    toolName,
    params,
    tool: { name: toolName, input: params },
    context: {
      messages: options?.messages || [],
      prompt: "",
      lastUserMessageTimestamp: options?.lastUserMessageTimestamp || Date.now(),
      last_user_message_timestamp:
        options?.lastUserMessageTimestamp || Date.now(),
    },
  };
}

export function createPromptBuildEvent(
  prompt: string = "",
  messages?: MockMessage[],
) {
  return {
    context: { prompt, messages: messages || [] },
    messages: messages || [],
  };
}

export function createMessageReceivedEvent(
  content: string,
  isBot: boolean = false,
) {
  return {
    content,
    metadata: {
      bot: isBot,
      author: { bot: isBot },
      isBot,
      sender: { bot: isBot },
    },
  };
}

export function createMessageSendingEvent(content: string) {
  return { content };
}

export function createMockContext(
  overrides?: Partial<MockContext>,
): MockContext {
  return {
    sessionKey: "test-session",
    channelId: "test-channel",
    conversationId: "test-conversation",
    ...overrides,
  };
}

export function createHeartbeatContext(): MockContext {
  return {
    sessionKey: "heartbeat-isolated-session",
    channelId: "heartbeat-channel",
    conversationId: "heartbeat-conversation",
  };
}
