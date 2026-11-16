// The fake live chat: what "viewers" type while you film, and the comments under the upload.
import { pick } from './util.js';

const A = ['spooky', 'big', 'lil', 'xX', 'not', 'real', 'ghost', 'night', 'cursed', 'tired', 'crispy', 'soggy', 'mega', 'feral', 'cozy', 'lowkey', 'its', 'doctor', 'captain', 'goblin', 'nana'];
const B = ['gamer', 'enjoyer', 'watcher', 'bean', 'lurker', 'moth', 'frog', 'possum', 'toaster', 'ghoul', 'raccoon', 'nugget', 'skeptic', 'believer', 'gremlin', 'potato', 'spoon', 'mothman'];
const COLS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff', '#ff9f1c', '#f15bb5', '#9ef01a', '#a0c4ff'];
export const username = (r = Math.random) => pick(r, A) + '_' + pick(r, B) + (r() < 0.5 ? Math.floor(r() * 99) : '');
export const userColor = (r = Math.random) => pick(r, COLS);

export const LINES = {
  idle: ['first', 'is this live??', 'hi from brazil', 'w stream', 'bro its SO dark', 'turn a light on lol', 'where are we', 'what town is this', 'any ghosts yet', 'audio is fine', 'can u say hi to my mom', 'chat is this real', 'lurking', 'love these guys'],
  bored: ['boring', 'this is just grass', 'skip', 'nothing is happening', 'unsub', 'show us something', 'zzz', 'go inside the building', 'my grandma is scarier', 'refund'],
  chair: ['THE CHAIR', 'chair is floating??', 'fishing line 100%', 'its spinning omg', 'sit in it. coward', 'chair levitation is crazy'],
  tv: ['the tv is watching', 'who left the tv on', 'channel 666 lmao', 'IT HAS A FACE', 'it smiled at me', 'turn it OFF'],
  flamingo: ['did the flamingo move', 'they are CLOSER', 'flamingos 💀', 'why is it looking at u', 'dont blink', 'pink menace'],
  wardrobe: ['something is in there', 'DONT OPEN IT', 'eyes in the closet', 'narnia?', 'knock knock 💀', 'it blinked'],
  balloon: ['balloon is following u', 'pop it', 'red balloon nope', 'why is it floating TOWARDS u', 'lil guy', 'balloon bestie'],
  dancer: ['shes dancing', 'only in the light??', 'mannequin moves are crazy', 'turn the light off and on', 'slay', 'the choreography'],
  applause: ['WHO IS THAT', 'RUN', 'his smile 💀💀', 'mr applause??', 'dont let him get u', 'the mic...', 'is that a host', 'NOPE'],
  pose: ['HE IS POSING', 'he wants to be famous lmao', 'say cheese', 'so photogenic', 'the bow 😭', 'iconic'],
  chase: ['RUN RUN RUN', 'BEHIND YOU', 'he is FAST', 'go go go', 'THROW SOMETHING', 'not like this'],
  hand: ['THE HAND', 'what is that 😭', 'crawly boy', 'its so fast', 'stomp it', 'ew ew ew'],
  steal: ['IT TOOK IT', 'GIVE IT BACK', 'bro got robbed', 'chase it!!', 'thief 💀'],
  kill: ['NOOOO', 'RIP', 'CLIP IT', 'they are gone 💀', 'F', 'F in chat', 'this is going viral', 'WHAT DID I JUST SEE', 'bro got cancelled'],
  scream: ['the SCREAM 😭', 'my ears', 'lmaooo', 'scream again', 'certified scream', 'hahahaha'],
  fall: ['LMAO they fell', 'ragdoll physics', '😭😭😭', 'bonk', 'are they ok', 'down bad'],
  bonk: ['HEADSHOT', 'BONK', 'he felt that', 'good arm', 'throw another'],
  pop: ['POP', 'rip balloon', 'he popped it 💀', 'noooo balloon'],
  wave: ['hiii', 'wave back', 'hello!!', '👋', 'cutie'],
  narrate: ['good commentary', 'keep talking', 'love the narration', 'whisper mode', 'asmr ghost hunt'],
  body: ['is he ok', 'hes not moving', 'poke him', 'ok thats not funny anymore'],
  nv: ['night vision goes hard', 'green mode', 'now we can see'],
};
export const say = (tag, r = Math.random) => pick(r, LINES[tag] || LINES.idle);

// Comments for the upload page, from a highlight's tags.
export function comments(tags, n, r = Math.random) {
  const pool = [...tags.filter((t) => LINES[t]), 'idle'];
  const out = [];
  for (let i = 0; i < n; i++) out.push({ user: username(r), color: userColor(r), text: say(pick(r, pool), r), likes: Math.floor(Math.pow(r(), 3) * 900) });
  return out;
}
