// Slide 1: orbit. Earth, the Landsat 8 model, the project name. No steps; the next key press starts the descent.
export default {
  steps: 0,
  mount(ctx) {
    const { EVENT, CHALLENGE, PROJECT_NAME, TEAM, MEMBERS, LOCAL_EVENT } = ctx.constants;
    ctx.el.innerHTML = `
      <div class="copy">
        <div class="eyebrow">${EVENT}<br>${CHALLENGE}</div>
        <div class="title">${PROJECT_NAME}</div>
        <div class="lede">From orbit to one field.</div>
        <div class="facts members">
          <span><small>Team</small>${TEAM}</span>
          <span><small>Members</small>${MEMBERS.map((m) => `<div>${m}</div>`).join('')}</span>
          <span><small>Local event</small>${LOCAL_EVENT}</span>
        </div>
      </div>`;
  },
  enter(_step, ctx) {
    ctx.scene.goTo('orbit', { instant: ctx.instant });
    ctx.setWash(0.55, 0);
  },
  final(ctx) { this.enter(0, ctx); },
};
