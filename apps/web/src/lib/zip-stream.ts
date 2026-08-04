import { Readable } from "node:stream";
import { deflateRawSync } from "node:zlib";

export type ZipEntry = {
  name: string;
  data: string | Uint8Array;
  compress?: boolean;
};

type CentralEntry = {
  name: Buffer;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  offset: bigint;
};

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;
const MAX_UINT32_BIGINT = BigInt(MAX_UINT32);
const UTF8_FLAG = 0x0800;

export function createZipStream(entries: AsyncIterable<ZipEntry>, modifiedAt = new Date()) {
  const readable = Readable.from(generateZip(entries, modifiedAt));
  return Readable.toWeb(readable) as unknown as ReadableStream<Uint8Array>;
}

async function* generateZip(entries: AsyncIterable<ZipEntry>, modifiedAt: Date) {
  const centralEntries: CentralEntry[] = [];
  const { time, date } = dosTimestamp(modifiedAt);
  let offset = 0n;

  for await (const entry of entries) {
    validateEntryName(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    if (name.byteLength > MAX_UINT16) throw new Error("ZIP entry name is too long.");

    const source = typeof entry.data === "string" ? Buffer.from(entry.data, "utf8") : Buffer.from(entry.data);
    const shouldCompress = entry.compress !== false && source.byteLength > 0;
    const payload = shouldCompress ? deflateRawSync(source, { level: 6 }) : source;
    const method = shouldCompress ? 8 : 0;
    ensureUint32(source.byteLength, "ZIP entry");
    ensureUint32(payload.byteLength, "Compressed ZIP entry");

    const crc = crc32(source);
    const localHeader = Buffer.alloc(30 + name.byteLength);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.byteLength, 18);
    localHeader.writeUInt32LE(source.byteLength, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);

    centralEntries.push({
      name,
      crc,
      compressedSize: payload.byteLength,
      uncompressedSize: source.byteLength,
      method,
      offset,
    });

    yield localHeader;
    yield payload;
    offset += BigInt(localHeader.byteLength + payload.byteLength);
  }

  const centralOffset = offset;
  for (const entry of centralEntries) {
    const usesZip64Offset = entry.offset > MAX_UINT32_BIGINT;
    const extra = usesZip64Offset ? zip64OffsetExtra(entry.offset) : Buffer.alloc(0);
    const header = Buffer.alloc(46 + entry.name.byteLength + extra.byteLength);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(usesZip64Offset ? 0x032d : 0x0314, 4);
    header.writeUInt16LE(usesZip64Offset ? 45 : 20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(entry.method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(entry.crc, 16);
    header.writeUInt32LE(entry.compressedSize, 20);
    header.writeUInt32LE(entry.uncompressedSize, 24);
    header.writeUInt16LE(entry.name.byteLength, 28);
    header.writeUInt16LE(extra.byteLength, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    header.writeUInt32LE(usesZip64Offset ? MAX_UINT32 : Number(entry.offset), 42);
    entry.name.copy(header, 46);
    extra.copy(header, 46 + entry.name.byteLength);
    yield header;
    offset += BigInt(header.byteLength);
  }

  const centralSize = offset - centralOffset;
  const usesZip64 = centralEntries.length > MAX_UINT16
    || centralOffset > MAX_UINT32_BIGINT
    || centralSize > MAX_UINT32_BIGINT;

  if (usesZip64) {
    const zip64Offset = offset;
    const zip64Footer = Buffer.alloc(56);
    zip64Footer.writeUInt32LE(0x06064b50, 0);
    zip64Footer.writeBigUInt64LE(44n, 4);
    zip64Footer.writeUInt16LE(45, 12);
    zip64Footer.writeUInt16LE(45, 14);
    zip64Footer.writeUInt32LE(0, 16);
    zip64Footer.writeUInt32LE(0, 20);
    zip64Footer.writeBigUInt64LE(BigInt(centralEntries.length), 24);
    zip64Footer.writeBigUInt64LE(BigInt(centralEntries.length), 32);
    zip64Footer.writeBigUInt64LE(centralSize, 40);
    zip64Footer.writeBigUInt64LE(centralOffset, 48);
    yield zip64Footer;

    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(zip64Offset, 8);
    locator.writeUInt32LE(1, 16);
    yield locator;
  }

  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(0x06054b50, 0);
  footer.writeUInt16LE(0, 4);
  footer.writeUInt16LE(0, 6);
  footer.writeUInt16LE(usesZip64 ? MAX_UINT16 : centralEntries.length, 8);
  footer.writeUInt16LE(usesZip64 ? MAX_UINT16 : centralEntries.length, 10);
  footer.writeUInt32LE(usesZip64 ? MAX_UINT32 : Number(centralSize), 12);
  footer.writeUInt32LE(usesZip64 ? MAX_UINT32 : Number(centralOffset), 16);
  footer.writeUInt16LE(0, 20);
  yield footer;
}

function validateEntryName(name: string) {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw new Error(`Unsafe ZIP entry name: ${name}`);
  }
}

function ensureUint32(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new Error(`${label} exceeds the non-ZIP64 limit.`);
  }
}

function zip64OffsetExtra(offset: bigint) {
  const extra = Buffer.alloc(12);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(8, 2);
  extra.writeBigUInt64LE(offset, 4);
  return extra;
}

function dosTimestamp(value: Date) {
  const year = Math.min(2107, Math.max(1980, value.getUTCFullYear()));
  return {
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | Math.floor(value.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(value: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of value) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
