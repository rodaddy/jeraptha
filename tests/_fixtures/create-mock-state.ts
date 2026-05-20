import { createState } from "../../plugin/shared/state.js";

export function createMockState(overrides?: Record<string, any>) {
  const state = createState();
  if (overrides) {
    Object.assign(state, overrides);
  }
  return state;
}

export function createActiveSessionState(overrides?: Record<string, any>) {
  return createMockState({
    currentTurn: 10,
    tasksReadThisSession: true,
    conversationsReadThisSession: true,
    obContextLoadedThisSession: true,
    ...overrides,
  });
}
