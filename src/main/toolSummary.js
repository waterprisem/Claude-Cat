// Tool name + input -> short human text. Never leaks long commands or file contents.

const path = require('node:path');
const { clip } = require('./text');

const MAX = 40;

function basename(p) {
  return typeof p === 'string' && p ? path.basename(p) : '';
}

function withSubject(verb, subject) {
  if (!subject) return verb;
  return clip(`${verb} ${subject}`, MAX);
}

function toolSummary(name, input = {}) {
  input = input || {};
  switch (name) {
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit':
      return withSubject('Editing', basename(input.file_path));
    case 'Read':
      return withSubject('Reading', basename(input.file_path));
    case 'Bash': {
      const cmd = typeof input.command === 'string' ? input.command.replace(/\s+/g, ' ').trim() : '';
      if (!cmd) return 'Running a command';
      return cmd.length > 30 ? `Running ${cmd.slice(0, 29).trimEnd()}…` : `Running ${cmd}`;
    }
    case 'Grep':
    case 'Glob':
      return 'Searching the code';
    case 'WebSearch':
    case 'WebFetch':
      return 'Searching the web';
    case 'Task':
    case 'Agent':
      return 'Delegating to a helper';
    case 'TodoWrite':
    case 'EnterPlanMode':
    case 'ExitPlanMode':
      return 'Planning';
  }
  if (typeof name !== 'string' || !name) return 'Working';
  // mcp__server__tool -> tool
  const short = name.startsWith('mcp__') ? name.split('__').pop() || name : name;
  return withSubject('Using', short);
}

module.exports = { toolSummary };
