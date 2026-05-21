# track-message-sent-state

**Priority:** 10
**Event:** `message_sent`
**Type:** Passive Observer

## What

Resets `toolCallsSinceMessage` when an outgoing message is reported as successfully delivered.

## Why

The before-tool-call state tracker cannot safely reset the silent-work counter for `message` tool calls. Later message gates can still block the message, and the channel send can still fail. This observer runs on `message_sent` and only clears the counter when `success === true`.

## Block Message

> None -- this observer never blocks.
