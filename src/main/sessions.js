// One state record per Claude Code session, driven by hook events.

const { EventEmitter } = require('node:events');
const { DEFAULTS } = require('./config');
const { head } = require('./text');
const { toolSummary } = require('./toolSummary');

class SessionStore extends EventEmitter {
  constructor({ now = Date.now, config = DEFAULTS, readTranscript = async () => null } = {}) {
    super();
    this.now = now;
    this.config = config;
    this.readTranscript = readTranscript;
    this.sessions = new Map();
  }

  get(id) {
    return this.sessions.get(id);
  }

  list() {
    return [...this.sessions.values()];
  }

  handle(evt) {
    if (evt.event === 'SessionEnd') {
      this.remove(evt.sessionId);
      return;
    }

    let s = this.sessions.get(evt.sessionId);
    const isNew = !s;
    if (isNew) {
      s = { id: evt.sessionId, project: evt.project, cwd: evt.cwd, state: 'done', text: '', lastEventAt: 0, seq: 0 };
      this.sessions.set(s.id, s);
    }
    s.lastEventAt = this.now();
    s.seq++;
    if (evt.cwd && !s.cwd) {
      s.cwd = evt.cwd;
      s.project = evt.project;
    }

    const max = this.config.maxTextLength;
    switch (evt.event) {
      case 'SessionStart':
        return this.set(s, 'done', '', isNew);
      case 'UserPromptSubmit':
        return this.set(s, 'coding', 'Thinking...', isNew);
      case 'PreToolUse':
        return this.set(s, 'coding', toolSummary(evt.toolName, evt.toolInput), isNew);
      case 'PostToolUse':
      case 'PostToolUseFailure':
        return this.set(s, 'coding', s.state === 'coding' ? s.text : 'Thinking...', isNew);
      case 'PermissionRequest':
        return this.set(s, 'waiting', head(`Claude needs your permission to use ${evt.toolName || 'a tool'}`, max), isNew);
      case 'Notification':
        if (evt.notificationType === 'idle_prompt' && s.state === 'done') break;
        // Arrives a few seconds after PermissionRequest with a generic message; keep the specific one.
        if (evt.notificationType === 'permission_prompt' && s.state === 'waiting') break;
        return this.set(s, 'waiting', head(evt.message || 'Claude needs your attention', max), isNew);
      case 'Stop':
        return this.stop(s, evt, isNew);
      case 'StopFailure':
        return this.set(s, 'waiting', `Stopped (${(evt.errorType || 'error').replace(/_/g, ' ')})`, isNew);
    }
    if (isNew) this.emit('change', s);
  }

  stop(s, evt, isNew) {
    const max = this.config.maxTextLength;
    if (evt.lastAssistantMessage && evt.lastAssistantMessage.trim()) {
      return this.set(s, 'done', head(evt.lastAssistantMessage, max), isNew);
    }
    this.set(s, 'done', 'Done', isNew);
    const seq = s.seq;
    Promise.resolve(this.readTranscript(evt.transcriptPath))
      .then((text) => {
        // Drop the result if newer events arrived or the session is gone.
        if (!text || this.sessions.get(s.id) !== s || s.seq !== seq) return;
        this.set(s, 'done', head(text, max), false);
      })
      .catch(() => {});
  }

  set(s, state, text, force) {
    if (!force && s.state === state && s.text === text) return;
    s.state = state;
    s.text = text;
    this.emit('change', s);
  }

  remove(id) {
    if (this.sessions.delete(id)) this.emit('remove', id);
  }

  // Called periodically: interrupt detection and stale-session cleanup.
  tick() {
    const now = this.now();
    for (const s of this.list()) {
      const idle = now - s.lastEventAt;
      if (idle >= this.config.staleSessionMs) this.remove(s.id);
      else if (s.state === 'coding' && idle >= this.config.interruptTimeoutMs) this.set(s, 'waiting', 'Stopped?');
    }
  }
}

module.exports = { SessionStore };
