export function createMockLogger() {
  const entries: Array<{
    level: string;
    gate?: string;
    action?: string;
    tool?: string;
    reason?: string;
    msg?: string;
    [key: string]: any;
  }> = [];
  return {
    entries,
    block(tool: string, reason: string, extra?: any) {
      entries.push({ level: "WARN", action: "block", tool, reason, ...extra });
    },
    allow(tool: string, reason: string) {
      entries.push({ level: "DEBUG", action: "allow", tool, reason });
    },
    skip(tool: string, reason: string) {
      entries.push({ level: "DEBUG", action: "skip", tool, reason });
    },
    info(msg: string, extra?: any) {
      entries.push({ level: "INFO", msg, ...extra });
    },
    warn(msg: string, extra?: any) {
      entries.push({ level: "WARN", msg, ...extra });
    },
    debug(msg: string, extra?: any) {
      entries.push({ level: "DEBUG", msg, ...extra });
    },
  };
}
