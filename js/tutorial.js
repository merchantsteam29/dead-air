// The first-night tutorial (alone, first night of the first season, once per device; How to play can replay it).
// A coach line walks you through: grab the camcorder, film the floating chair it puts out, throw something,
// an emote, and how to leave. The dangerous things arrive 70 s later than usual while it runs. Every step
// moves on by itself after 45 s, so nobody gets stuck.
const KEY = 'deadair.tutorial';
export const tutorialWanted = () => { try { return !localStorage.getItem(KEY); } catch { return false; } };
export const resetTutorial = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };

export class Tutorial {
  constructor(g) {
    this.g = g; this.i = 0; this.t = 0; this.threw = false;
    this.el = document.getElementById('coach');
    this.el.hidden = false;
    const W = g.world, I = g.items;
    if (g.isHost) {
      for (const s of g.schedule || []) s.t += 70;
      // a floating chair just north of the van, out in the open
      let x = W.van.x, z = W.van.z - 10;
      if (!W.walkCell(Math.floor(x), Math.floor(z))) { const s = W.spot(g.spawnR, 'out', 8); x = s.x; z = s.z; }
      g.things.spawn('chair', x, z);
      I.add('bucket', g.me.x + 1, g.me.z - 1.2);
    }
    const L = (k, p) => g.input.label(k, p);
    this.steps = [
      { text: () => `Grab the camcorder: it's on the ground behind the van. Look at it and press ${L('E', 'X')}.`, done: () => g.items.carriedBy(g.myId)?.kind === 'cam' },
      { text: () => `Hold ${L('RMB', 'LT')} to film. Point it at the glowing chair floating just north of the van.`, done: () => (g.items.list.find((i) => i.kind === 'cam')?.tape || 0) >= 40 },
      { text: () => `Nice footage! Now drop the camcorder (${L('Q', 'B')}), pick up the bucket (${L('E', 'X')}) and throw it (${L('LMB', 'RT')}). Thrown junk stuns the dangerous things.`, done: () => this.threw },
      { text: () => g.input.mode === 'pad' ? 'Emotes: press the D-pad (wave, dance, point, sit). Viewers love them.' : g.input.mode === 'touch' ? 'Emotes: tap EMOTE and pick one. Viewers love them.' : 'Emotes: hold Z, flick the mouse toward one, let go. (G is a quick wave.) Viewers love them.', done: () => !!g.p.emote },
      { text: () => `That's it! Grab the camcorder again, film anything weird, and be back at the van by 6 a.m. Hold ${L('E', 'X')} at the van to leave. Something out there hears you talking...`, done: () => this.t > 10 },
    ];
  }
  update(dt) {
    if (this.i >= this.steps.length) return;
    this.t += dt;
    const s = this.steps[this.i];
    this.el.textContent = s.text();
    if (s.done() || this.t > 45) {
      this.i++; this.t = 0;
      if (this.i < this.steps.length) this.g.sfx.play('views');
      else this.finish();
    }
  }
  finish() { this.el.hidden = true; try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } }
  dispose() { this.el.hidden = true; }
}
