import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId, openRunStore } from '../src/core/store.js';

test('exports named artifacts through generated IDs, blocks traversal and refuses symlinks', async (t) => {
  const dir = await mkdtemp(join(tmpdir(),'maintenance-store-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const runId = createRunId();
  const store = await openRunStore(dir,runId);
  const descriptor = await store.writeArtifact({label:'navigation result',mediaType:'application/json',bytes:'{"score":1}'});
  assert.match(descriptor.id,/^art_[0-9a-f]{24}$/);
  assert.equal((await store.readArtifact(descriptor.id)).toString(),'{"score":1}');
  await assert.rejects(store.readArtifact('../../etc/passwd'), /artifact ID/i);
  await writeFile(join(dir,'external'), 'private');
  await symlink(join(dir,'external'),join(dir,runId,'art_000000000000000000000000'));
  await assert.rejects(store.readArtifact('art_000000000000000000000000'));
  await store.writeReport({kind:'report'});
  assert.deepEqual(JSON.parse(await readFile(join(dir,runId,'report.json'),'utf8')),{kind:'report'});
  await assert.rejects(store.writeReport({kind:'replacement'}));
});

test('reports failed storage and enforces per-artifact retention bounds', async (t) => {
  const dir = await mkdtemp(join(tmpdir(),'maintenance-store-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  await writeFile(join(dir,'file'),'not a directory');
  await assert.rejects(openRunStore(join(dir,'file'),createRunId()),/storage/i);
  const store = await openRunStore(dir,createRunId(),{artifactBytes:64});
  await assert.rejects(store.writeArtifact({label:'large',mediaType:'text/plain',bytes:'x'.repeat(65)}),/limit/i);
});
