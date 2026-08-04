import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { createZipStream, type ZipEntry } from "../src/lib/zip-stream";

test("ZIP stream contains compressed text and stored binary entries", async () => {
  async function* entries(): AsyncGenerator<ZipEntry> {
    yield { name: "README.md", data: "Atlas backup" };
    yield { name: "spaces/start/image.png", data: new Uint8Array([1, 2, 3]), compress: false };
  }

  const stream = createZipStream(entries(), new Date("2026-08-04T12:00:00Z"));
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream as never)) chunks.push(Buffer.from(chunk));
  const archive = Buffer.concat(chunks);
  const files = readLocalEntries(archive);

  assert.equal(files.get("README.md")?.toString("utf8"), "Atlas backup");
  assert.deepEqual(files.get("spaces/start/image.png"), Buffer.from([1, 2, 3]));
  assert.ok(archive.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])));
});

test("ZIP stream switches to ZIP64 when the classic entry limit is exceeded", async () => {
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (let index = 0; index <= 0xffff; index += 1) {
      yield { name: `empty/${index}`, data: "", compress: false };
    }
  }

  const stream = createZipStream(entries(), new Date("2026-08-04T12:00:00Z"));
  let tail = Buffer.alloc(0);
  for await (const chunk of Readable.fromWeb(stream as never)) {
    tail = Buffer.concat([tail, Buffer.from(chunk)]).subarray(-128);
  }
  assert.ok(tail.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06])));
  assert.ok(tail.includes(Buffer.from([0x50, 0x4b, 0x06, 0x07])));
});

function readLocalEntries(archive: Buffer) {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed));
    offset = dataStart + compressedSize;
  }
  return files;
}
