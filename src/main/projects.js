// Which projects get a cat. Pure: the caller persists toJSON() and asks isShown().

function createProjects({ autoShow = true, projects = {} } = {}) {
  let auto = autoShow;
  const known = new Map(Object.entries(projects).map(([name, p]) => [name, { muted: p.muted === true }]));

  return {
    // Records a project. Returns true the first time it is seen.
    seen(name) {
      if (known.has(name)) return false;
      known.set(name, { muted: !auto });
      return true;
    },
    isShown(name) {
      const p = known.get(name);
      return p ? !p.muted : auto;
    },
    setMuted(name, muted) {
      known.set(name, { muted });
    },
    get autoShow() {
      return auto;
    },
    setAutoShow(value) {
      auto = value;
    },
    // Projects with open sessions (counts: Map name -> sessions), by name.
    // Choices for closed projects are remembered but not listed.
    menuList(counts) {
      return [...counts.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, count: counts.get(name), shown: this.isShown(name) }));
    },
    toJSON() {
      return { autoShow: auto, projects: Object.fromEntries(known) };
    },
  };
}

module.exports = { createProjects };
