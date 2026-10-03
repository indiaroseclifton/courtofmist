// Optimise Higgsfield/Meshy character GLBs for the web and gather every animation clip into
// each character's file. Runs in the Higgsfield sandbox.
// usage: node models.mjs <out.glb> <model.glb> <height_m> <clipName=clip.glb> [...]
// Clips from another rig of the same Meshy skeleton are retargeted by bone name: rotations
// are kept, the hips' translation is scaled to this character's height, and every other
// translation/scale track is dropped so the clip can't stretch this character's bones.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const [out, modelPath, heightArg, ...clips] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(modelPath);
const root = doc.getRoot();
const buf = root.listBuffers()[0];
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const hips = (d) => d.getRoot().listNodes().find((n) => n.getName() === 'Hips');
const hipY = (d) => { const h = hips(d); const m = h.getWorldMatrix(); return m[13]; };
const myHip = hipY(doc);
for (const a of root.listAnimations()) a.setName('walk');

for (const spec of clips) {
  const [name, path] = spec.split('=');
  const src = await io.read(path);
  const k = myHip / Math.max(1e-6, hipY(src));
  for (const anim of src.getRoot().listAnimations()) {
    const dst = doc.createAnimation(name);
    for (const ch of anim.listChannels()) {
      const tn = ch.getTargetNode()?.getName(), path_ = ch.getTargetPath();
      const node = byName.get(tn);
      if (!node || path_ === 'scale' || (path_ === 'translation' && tn !== 'Hips')) continue;
      const s = ch.getSampler();
      let outArr = s.getOutput().getArray().slice();
      if (path_ === 'translation') outArr = outArr.map((v) => v * k);
      const input = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buf);
      const output = doc.createAccessor().setType(s.getOutput().getType()).setArray(outArr).setBuffer(buf);
      const ns = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
      dst.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path_).setSampler(ns));
    }
  }
}
// The Meshy export sets emissive to white over a near-black map; nothing in Prythian glows unasked.
for (const m of root.listMaterials()) { m.setEmissiveFactor([0, 0, 0]); m.setEmissiveTexture(null); }
await doc.transform(
  dedup(), resample(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(out, doc);
const h = +heightArg;
console.log(JSON.stringify({ out, height: h, hipY: myHip, clips: root.listAnimations().map((a) => [a.getName(), a.listChannels().length]), joints: root.listSkins()[0]?.listJoints().length }));
