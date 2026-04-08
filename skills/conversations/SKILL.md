---
name: conversations
description: Show active conversation tracker -- channels, topics, heat levels, and per-conversation context links.
triggers:
  - /conversations
  - show conversations
  - conversation log
  - what conversations
  - who am i talking to
user-invocable: true
---

# Conversations -- Cross-Channel Conversation Tracker

Read CONVERSATIONS.md from the workspace and display the active conversation index formatted for Discord.

## Instructions

When triggered, read `CONVERSATIONS.md` from the workspace root.

Format the output for Discord using stacked block format.

### Display Format

**Header:**
```
**Active Conversations**
```

**For each conversation, sorted by heat (hot first):**
```
**[heat emoji] [Person] -- #[channel]**
> Last active: [timestamp]
> Topics: [current topics, comma-separated]
> Detail: [link to conversations/channel-name.md]
```

**Heat emojis:**
- Hot (active today): `[fire]`
- Warm (active this week): `[sun]`
- Cool (1-2 weeks): `[snowflake]`
- Cold (>2 weeks): `[ice]`

**Footer:**
```
[count] active | [count] archived | Dream cycle: [last run time]
```

### If CONVERSATIONS.md doesn't exist
Reply: "No CONVERSATIONS.md found. Not tracking any conversations. Create one."

### If no active conversations
Reply: "No active conversations. Either nobody's talking or you're not tracking. Check your channels."
