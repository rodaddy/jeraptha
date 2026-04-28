// prompt-include hook -- auto-inject include files into prompt context
// Event: before_prompt_build
// Inspired by Space Agent's *.system.include.md / *.transient.include.md pattern
// Solves post-compact amnesia by ensuring critical context survives compaction
//
// Convention:
//   ~/.openclaw/workspace/includes/*.system.include.md  -> appendSystemContext (every turn)
//   ~/.openclaw/workspace/includes/*.transient.include.md -> appendSystemContext with [TRANSIENT] marker
//
// Features:
//   - Alphabetical sort by filename for deterministic ordering
//   - Fail-soft: unreadable files are skipped with a log, not fatal
//   - Token cap: optional MAX_INCLUDE_CHARS prevents context bloat
//   - Source provenance: each include is tagged with its filename

import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Configurable via environment or defaults
const INCLUDES_DIR = join(
  process.env.HOME || "/Users/rico",
  ".openclaw/workspace/includes"
);

// Max chars per include type (0 = unlimited)
const MAX_SYSTEM_CHARS = 8000;
const MAX_TRANSIENT_CHARS = 4000;

interface IncludeFile {
  name: string;
  path: string;
  content: string;
  type: "system" | "transient";
}

function discoverIncludes(): IncludeFile[] {
  const files: IncludeFile[] = [];

  let entries: string[];
  try {
    entries = readdirSync(INCLUDES_DIR);
  } catch {
    // Directory doesn't exist yet -- not an error, just no includes
    return [];
  }

  // Sort alphabetically for deterministic ordering
  entries.sort();

  for (const entry of entries) {
    let type: "system" | "transient" | null = null;

    if (entry.endsWith(".system.include.md")) {
      type = "system";
    } else if (entry.endsWith(".transient.include.md")) {
      type = "transient";
    }

    if (!type) continue;

    const filePath = join(INCLUDES_DIR, entry);
    try {
      const content = readFileSync(filePath, "utf-8").trim();
      if (content) {
        files.push({ name: entry, path: filePath, content, type });
      }
    } catch {
      // Fail-soft: skip unreadable files
      console.warn(`[prompt-include] Could not read ${entry}, skipping`);
    }
  }

  return files;
}

function truncateWithNotice(content: string, maxChars: number, filename: string): string {
  if (maxChars <= 0 || content.length <= maxChars) return content;
  return (
    content.slice(0, maxChars) +
    `\n\n[... ${filename} truncated at ${maxChars} chars (${content.length} total) ...]`
  );
}

const handler = async (_event: any) => {
  const includes = discoverIncludes();
  if (includes.length === 0) return undefined;

  const systemIncludes = includes.filter((f) => f.type === "system");
  const transientIncludes = includes.filter((f) => f.type === "transient");

  const sections: string[] = [];

  // System includes -- stable, standing context
  if (systemIncludes.length > 0) {
    sections.push("## 📎 Auto-Included Context (system)");
    let totalChars = 0;
    for (const inc of systemIncludes) {
      const remaining = MAX_SYSTEM_CHARS > 0 ? MAX_SYSTEM_CHARS - totalChars : Infinity;
      if (remaining <= 0) {
        sections.push(`\n[system includes truncated -- ${MAX_SYSTEM_CHARS} char cap reached]`);
        break;
      }
      const content = truncateWithNotice(inc.content, remaining, inc.name);
      sections.push(`\n### source: ${inc.name}\n${content}`);
      totalChars += content.length;
    }
  }

  // Transient includes -- hot/changing context
  if (transientIncludes.length > 0) {
    sections.push("\n## 📎 Auto-Included Context (transient)");
    let totalChars = 0;
    for (const inc of transientIncludes) {
      const remaining = MAX_TRANSIENT_CHARS > 0 ? MAX_TRANSIENT_CHARS - totalChars : Infinity;
      if (remaining <= 0) {
        sections.push(`\n[transient includes truncated -- ${MAX_TRANSIENT_CHARS} char cap reached]`);
        break;
      }
      const content = truncateWithNotice(inc.content, remaining, inc.name);
      sections.push(`\n### source: ${inc.name}\n${content}`);
      totalChars += content.length;
    }
  }

  return {
    prompt: (_event.context?.prompt || "") + "\n\n" + sections.join("\n"),
  };
};

export default handler;
