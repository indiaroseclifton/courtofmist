// List the spoken lines (named speaker, literal text) in the story, for voicing.
// usage: node tools/voice_lines.mjs [files...] > lines.json
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['src/game/story.js'];
const out = [];
const re = /\b(say|ask)\(\s*'([^']+)'\s*,\s*(['"`])((?:\\.|(?!\3).)*)\3/g;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(re)) {
    const [, , who, q, raw] = m;
    if (q === '`' && raw.includes('${')) continue; // composed at run time
    const text = raw.replace(/\\(.)/g, '$1');
    if (text.startsWith('<i>')) continue; // narration, not speech
    out.push({ who, text: text.replace(/<[^>]+>/g, '') });
  }
}
// the High Lords' audiences, the favours, and the Suriel's answers live in data, not calls
const str = (r) => r.replace(/\\(.)/g, '$1');
const story = readFileSync('src/game/story.js', 'utf8');
for (const m of story.matchAll(/\{ court: '[^']+', region: '[^']+', lord: '[^']+', name: '([^']+)', open: \[([^\]]*)\], question: '((?:\\.|[^'])*)'.*?yes: '((?:\\.|[^'])*)', no: '((?:\\.|[^'])*)' \}/g)) {
  const [, who, open, q, yes, no] = m;
  for (const o of open.matchAll(/'((?:\\.|[^'])*)'/g)) out.push({ who, text: str(o[1]) });
  for (const t of [q, yes, no]) out.push({ who, text: str(t) });
}
for (const m of story.matchAll(/who: '([^']+)', label: '[^']*', ask: \[([^\]]*)\]/g)) {
  for (const o of m[2].matchAll(/'((?:\\.|[^'])*)'/g)) out.push({ who: m[1], text: str(o[1]) });
}
const sur = story.match(/const answers = \[([^\]]*)\]/);
if (sur) for (const o of sur[1].matchAll(/'((?:\\.|[^'])*)'/g)) out.push({ who: 'The Suriel', text: str(o[1]) });
for (const t of ['Ask.', 'Another, then go.']) out.push({ who: 'The Suriel', text: t });
const seen = new Set();
console.log(JSON.stringify(out.filter((l) => !seen.has(l.who + l.text) && seen.add(l.who + l.text)), null, 1));
