const PROTECTED_PATTERNS = [
  /openclaw\.json/i,
  /openclaw\s+(gateway|config|plugins|channels)/i,
  /launchctl\s+(unload|load|bootout|bootstrap|stop|start|kill)/i,
  /systemctl\s+(restart|stop|enable|disable).*openclaw/i,
  /kill\s+(-\d+\s+)?(\$\(pgrep|.*openclaw)/i,
  /rm\s+.*\.openclaw/i,
  /BOOT\.md|SOUL\.md|AGENTS\.md|IDENTITY\.md|TOOLS\.md|HEARTBEAT\.md/i,
  /\.openclaw\/hooks\//i,
  /gateway\s+(restart|stop|start)/i,
];

const handler = async (event: any) => {
  const { toolName, params } = event.context;

  if (toolName === "exec" || toolName === "bash") {
    const cmd = params?.command || params?.cmd || "";
    for (const pattern of PROTECTED_PATTERNS) {
      if (pattern.test(cmd)) {
        return {
          block: true,
          blockReason: `Self-surgery blocked: "${cmd.substring(0, 80)}" matches protected pattern. Ask Rico to make this change.`,
        };
      }
    }
  }

  if ((toolName === "write" || toolName === "edit" || toolName === "apply_patch") && params?.path) {
    if (/openclaw\.json|\.openclaw\/(hooks|workspace\/(BOOT|SOUL|AGENTS|IDENTITY|TOOLS|HEARTBEAT)\.md)/i.test(params.path)) {
      return {
        block: true,
        blockReason: `Self-surgery blocked: cannot modify "${params.path}". Ask Rico to make this change.`,
      };
    }
  }

  return undefined;
};

export default handler;
