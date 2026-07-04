import assert from "node:assert/strict";
import test from "node:test";
import { detectImageMime } from "../src/lib/image-upload";

test("accepts PNG, JPEG, WebP, and GIF magic bytes", () => {
  assert.equal(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageMime(new TextEncoder().encode("RIFF1234WEBP")), "image/webp");
  assert.equal(detectImageMime(new TextEncoder().encode("GIF89a")), "image/gif");
});

test("rejects content that only claims to be an image", () => {
  assert.equal(detectImageMime(new TextEncoder().encode("<svg></svg>")), null);
});
