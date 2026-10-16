// Turn an untrusted hook payload into a small, validated event object.

const path = require('node:path');

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EVENT_NAME = /^[A-Za-z]{1,64}$/;
const TOOL_INPUT_KEYS = ['file_path', 'command', 'pattern', 'url', 'description'];

function str(value, max) {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function sanitize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  // Validated whole, never truncated: a cut-down id could collide with another session.
  const event = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof event !== 'string' || !EVENT_NAME.test(event)) return null;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;

  const cwd = str(raw.cwd, 1024);
  const evt = {
    event,
    sessionId,
    cwd,
    project: cwd ? path.basename(cwd) || cwd : 'unknown',
    toolName: str(raw.tool_name, 200),
    message: str(raw.message, 2000),
    notificationType: str(raw.notification_type, 64),
    lastAssistantMessage: str(raw.last_assistant_message, 4000),
    transcriptPath: str(raw.transcript_path, 1024),
    agentId: str(raw.agent_id, 128),
    errorType: str(raw.error_type, 64),
  };

  if (raw.tool_input && typeof raw.tool_input === 'object') {
    evt.toolInput = {};
    for (const key of TOOL_INPUT_KEYS) {
      const value = str(raw.tool_input[key], 1024);
      if (value !== undefined) evt.toolInput[key] = value;
    }
  }
  return evt;
}

module.exports = { sanitize };
