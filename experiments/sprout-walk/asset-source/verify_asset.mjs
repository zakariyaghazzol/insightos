import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';

const base = dirname(fileURLToPath(import.meta.url));
const root = resolve(base, '../../..');
const assetPath = resolve(root, 'public/experiments/sprout-walk/sprout-walk-v001.glb');
const manifest = JSON.parse(readFileSync(assetPath.replace('.glb', '.manifest.json'), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function glb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const length = bytes.readUInt32LE(12);
  return {
    bytes,
    doc: JSON.parse(bytes.toString('utf8', 20, 20 + length)),
    binary: bytes.subarray(28 + length),
  };
}
function accessor(asset, index) {
  const acc = asset.doc.accessors[index];
  assert.ok(!acc.sparse);
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType] * width;
  const view = asset.doc.bufferViews[acc.bufferView];
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return Buffer.concat(
    Array.from({ length: acc.count }, (_, i) =>
      asset.binary.subarray(
        start + i * (view.byteStride ?? size),
        start + i * (view.byteStride ?? size) + size,
      ),
    ),
  );
}
const old = glb(resolve(root, 'public/buddy/sprout-v008.glb'));
const asset = glb(assetPath);
const source = glb(resolve(root, manifest.source_export));
assert.equal(sha(asset.bytes), manifest.sha256);
for (const [path, digest] of Object.entries(manifest.preservation.baseline_files))
  assert.equal(sha(readFileSync(resolve(root, path))), digest);
for (const field of ['nodes', 'skins', 'meshes', 'materials', 'images', 'textures', 'samplers'])
  assert.deepEqual(asset.doc[field], old.doc[field]);
assert.deepEqual(asset.binary.subarray(0, old.binary.length), old.binary);
assert.deepEqual(asset.doc.animations.slice(0, 11), old.doc.animations);
assert.equal(asset.doc.animations.length, 14);
for (let i = 0; i < old.doc.accessors.length; i++)
  assert.deepEqual(accessor(asset, i), accessor(old, i));
const reports = [];
for (const definition of manifest.clips) {
  const animation = asset.doc.animations.find((a) => a.name === definition.name);
  const exported = source.doc.animations.find((a) => a.name === definition.name);
  assert.ok(animation && exported);
  let duration = 0;
  for (const channel of animation.channels) {
    const name = asset.doc.nodes[channel.target.node].name;
    const originalChannel = exported.channels.find(
      (c) => source.doc.nodes[c.target.node].name === name && c.target.path === channel.target.path,
    );
    assert.ok(originalChannel, `${definition.name} ${name} ${channel.target.path}`);
    const sampler = animation.samplers[channel.sampler];
    const originalSampler = exported.samplers[originalChannel.sampler];
    for (const property of ['input', 'output'])
      assert.deepEqual(
        accessor(asset, sampler[property]),
        accessor(source, originalSampler[property]),
      );
    const times = accessor(asset, sampler.input);
    duration = Math.max(duration, times.readFloatLE(times.length - 4));
    const values = accessor(asset, sampler.output);
    for (let i = 0; i < values.length; i += 4) assert.ok(Number.isFinite(values.readFloatLE(i)));
    if (name === 'ROOT') {
      const size = channel.target.path === 'rotation' ? 16 : 12;
      for (let i = size; i < values.length; i += size)
        assert.deepEqual(values.subarray(i, i + size), values.subarray(0, size));
    }
  }
  assert.equal(duration, definition.duration_seconds);
  reports.push({
    clip: definition.name,
    duration,
    channels: animation.channels.length,
    sourceStreamsExact: true,
    stationaryRoot: true,
  });
}
const validation = await validator.validateBytes(new Uint8Array(asset.bytes), {
  uri: assetPath,
  maxIssues: 100,
});
writeFileSync(resolve(base, 'gltf-validation.json'), JSON.stringify(validation, null, 2) + '\n');
assert.equal(validation.issues.numErrors, 0);
const baselineValidation = await validator.validateBytes(new Uint8Array(old.bytes), {
  maxIssues: 100,
});
const warnings = (v) =>
  v.issues.messages.filter((m) => m.severity === 1).map(({ code, pointer }) => ({ code, pointer }));
assert.deepEqual(warnings(validation), warnings(baselineValidation));
const report = {
  pass: true,
  assetSha256: manifest.sha256,
  originalElevenClipsExact: true,
  geometryMaterialRigHierarchyExact: true,
  originalBinaryBytesPreserved: old.binary.length,
  newClips: reports,
  errors: validation.issues.numErrors,
  warnings: validation.issues.numWarnings,
  warningsUnchangedFromV008: true,
  scope: 'GLB structure and exact source animation streams; no native desktop behavior is implied.',
};
writeFileSync(resolve(base, 'preservation-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
