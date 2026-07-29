import assert from "node:assert/strict";
import test from "node:test";
import { CodedApiError } from "../src/lib/api-errors";
import { MAX_IMAGE_BYTES, detectImageMime, readValidatedImage } from "../src/lib/image-upload";

test("accepts PNG, JPEG, WebP, and GIF magic bytes", () => {
  assert.equal(detectImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageMime(new TextEncoder().encode("RIFF1234WEBP")), "image/webp");
  assert.equal(detectImageMime(new TextEncoder().encode("GIF89a")), "image/gif");
});

test("rejects content that only claims to be an image", () => {
  assert.equal(detectImageMime(new TextEncoder().encode("<svg></svg>")), null);
});

test("returns validated bytes and the detected MIME type", async () => {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = await readValidatedImage(new File([bytes], "image.png", { type: "text/plain" }));
  assert.equal(image.mime, "image/png");
  assert.deepEqual(image.bytes, bytes);
});

test("rejects empty, oversized, and invalid image files with stable codes", async () => {
  await assert.rejects(
    () => readValidatedImage(new File([], "empty.png")),
    (error) => isCodedError(error, "IMAGE_EMPTY"),
  );
  await assert.rejects(
    () => readValidatedImage(new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png")),
    (error) => isCodedError(error, "IMAGE_TOO_LARGE"),
  );
  await assert.rejects(
    () => readValidatedImage(new File(["not an image"], "fake.png", { type: "image/png" })),
    (error) => isCodedError(error, "IMAGE_INVALID_TYPE"),
  );
});

function isCodedError(error: unknown, code: CodedApiError["code"]) {
  return error instanceof CodedApiError && error.code === code;
}
