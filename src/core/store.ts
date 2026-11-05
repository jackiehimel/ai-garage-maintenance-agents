import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ArtifactDescriptor, RawArtifact } from './types.js';

const RUN_ID = /^run_[a-f0-9]{24}$/;
const ARTIFACT_ID = /^art_[a-f0-9]{24}$/;
export const createRunId = () => 'run_' + randomBytes(12).toString('hex');
export const createArtifactId = () => 'art_' + randomBytes(12).toString('hex');

export interface StoreLimits { artifactBytes: number; totalArtifactBytes: number; artifacts: number; reportBytes: number }
const STORE_LIMITS: StoreLimits = {artifactBytes:15_000_000,totalArtifactBytes:90_000_000,artifacts:60,reportBytes:8_000_000};
export interface RunStore {
  runId: string;
  writeArtifact(artifact: RawArtifact): Promise<ArtifactDescriptor>;
  readArtifact(id: string): Promise<Buffer>;
  writeReport(report: unknown): Promise<void>;
  readReport(): Promise<string>;
}
function storageError(error: unknown): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return new Error('Local run storage operation failed' + (code ? ` (${code})` : ''),{cause:error});
}
function verifyArtifactId(id: string): void {
  if (!ARTIFACT_ID.test(id)) throw new Error('Invalid artifact ID');
}

export function describeArtifact(artifact: RawArtifact): ArtifactDescriptor {
  const id = artifact.id ?? createArtifactId();
  verifyArtifactId(id);
  if (!artifact.label.trim() || artifact.label.length > 240) throw new Error('Invalid artifact label');
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(artifact.mediaType) || artifact.mediaType.length > 100) throw new Error('Invalid artifact media type');
  const byteLength = typeof artifact.bytes === 'string' ? Buffer.byteLength(artifact.bytes) : artifact.bytes.byteLength;
  return {id,label:artifact.label,mediaType:artifact.mediaType,byteLength,scope:artifact.scope};
}

export async function openRunStore(root: string, runId: string, options: Partial<StoreLimits> = {}): Promise<RunStore> {
  if (!RUN_ID.test(runId)) throw new Error('Invalid run ID');
  if (!root.trim()) throw new Error('Local run storage root is missing');
  const limits = {...STORE_LIMITS,...options};
  let directory: string;
  let count = 0;
  let bytes = 0;
  try {
    await mkdir(resolve(root),{recursive:true,mode:0o700});
    directory = join(await realpath(resolve(root)),runId);
    try { await mkdir(directory,{mode:0o700}); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error('Unsafe run directory');
    for (const entry of await readdir(directory,{withFileTypes:true})) {
      if (entry.isFile() && ARTIFACT_ID.test(entry.name)) {
        count++;
        bytes += (await lstat(join(directory,entry.name))).size;
      }
    }
  } catch (error) { throw storageError(error); }
  const assertDirectory = async () => {
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error('Unsafe run directory');
  };
  const writeOnce = async (name: string, data: string | Uint8Array) => {
    const temporary = join(directory,'.tmp_' + randomBytes(12).toString('hex'));
    try {
      await assertDirectory();
      await writeFile(temporary,data,{flag:'wx',mode:0o600});
      await link(temporary,join(directory,name));
    } catch (error) { throw storageError(error); }
    finally { await unlink(temporary).catch(() => {}); }
  };
  const read = async (name: string, maxBytes: number) => {
    try {
      await assertDirectory();
      const handle = await open(join(directory,name),constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > maxBytes) throw new Error('Stored file exceeds limit or is not a regular file');
        const result = Buffer.alloc(stat.size);
        let offset = 0;
        while (offset < result.length) {
          const {bytesRead} = await handle.read(result,offset,result.length-offset,offset);
          if (bytesRead === 0) throw new Error('Stored file changed while being read');
          offset += bytesRead;
        }
        return result;
      } finally { await handle.close(); }
    } catch (error) { throw storageError(error); }
  };
  return {
    runId,
    async writeArtifact(artifact) {
      const descriptor = describeArtifact(artifact);
      const size = descriptor.byteLength;
      if (size > limits.artifactBytes || count >= limits.artifacts || bytes + size > limits.totalArtifactBytes) throw new Error('Raw artifact retention limit exceeded');
      count++;
      bytes += size;
      try { await writeOnce(descriptor.id,artifact.bytes); }
      catch (error) { count--; bytes -= size; throw error; }
      return descriptor;
    },
    async readArtifact(id) { verifyArtifactId(id); return read(id,limits.artifactBytes); },
    async writeReport(report) {
      const data = JSON.stringify(report);
      if (typeof data !== 'string' || Buffer.byteLength(data) > limits.reportBytes) throw new Error('Run report exceeds the storage size limit');
      await writeOnce('report.json',data);
    },
    async readReport() { return (await read('report.json',limits.reportBytes)).toString('utf8'); },
  };
}
