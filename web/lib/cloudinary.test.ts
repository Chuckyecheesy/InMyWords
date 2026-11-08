import assert from "node:assert/strict";
import { test } from "node:test";
import { TILE_RECIPE, demoPhotoUrl, photoSources, storyImageUrl, tileImageUrl, unsignedUploadFields } from "./cloudinary.ts";

test("a calm tile url uses the frozen recipe and strips a leading slash", () => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "inmywords";
  process.env.CLOUDINARY_CLOUD_NAME = "other-cloud";
  const url = tileImageUrl("/tiles/marcus_coffee", "calm");
  assert.equal(
    url,
    `https://res.cloudinary.com/inmywords/image/upload/${TILE_RECIPE.calm}/f_auto/q_auto/tiles/marcus_coffee`,
  );
  assert.match(url!, /c_fill,g_auto,w_640,h_640\/e_background_removal/);
  assert.match(url!, /c_pad,w_720,h_720,b_rgb:F7FBFA\/r_48/);
  assert.match(url!, /\/f_auto\/q_auto\/tiles\/marcus_coffee$/);
});

test("a high-contrast tile url sharpens and pads on white", () => {
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  process.env.CLOUDINARY_CLOUD_NAME = "inmywords";
  const url = tileImageUrl("tiles/marcus_coffee", "contrast");
  assert.match(url!, /e_contrast:50,e_sharpen:80/);
  assert.match(url!, /b_rgb:FFFFFF\/r_48/);
  assert.match(url!, /\/tiles\/marcus_coffee$/);
});

test("a display cloud name is lowercased for the delivery host", () => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "InMyWord";
  const url = tileImageUrl("tiles/marcus_coffee", "calm");
  assert.match(url!, /^https:\/\/res\.cloudinary\.com\/inmyword\/image\/upload\//);
});

test("a missing cloud name or public id builds no url", () => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  assert.equal(tileImageUrl("tiles/marcus_coffee", "calm"), null);
  process.env.CLOUDINARY_CLOUD_NAME = "inmywords";
  assert.equal(tileImageUrl("", "calm"), null);
});

test("unsigned upload fields are the cloud name and preset, never the secret", () => {
  const fields = unsignedUploadFields({
    cloudName: " inmywords ",
    uploadPreset: " staff_photos ",
    apiSecret: "super-secret",
    apiKey: "12345",
  });
  assert.deepEqual(fields, {
    cloud_name: "inmywords",
    upload_preset: "staff_photos",
  });
  const blob = JSON.stringify(fields);
  assert.equal(blob.includes("super-secret"), false);
  assert.equal(blob.includes("12345"), false);
  assert.deepEqual(Object.keys(fields).sort(), ["cloud_name", "upload_preset"]);
});

test("unsigned upload fields refuse a missing preset or cloud name", () => {
  assert.throws(() =>
    unsignedUploadFields({ cloudName: "inmywords", uploadPreset: "  " }),
  );
  assert.throws(() =>
    unsignedUploadFields({ cloudName: "", uploadPreset: "staff_photos" }),
  );
});

test("a tile asks for the saved file before Cloudinary", () => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "inmyword";
  const sources = photoSources("tiles/marcus_coffee", "calm");
  assert.deepEqual(sources, [
    "/demo/tiles/marcus_coffee.jpg",
    tileImageUrl("tiles/marcus_coffee", "calm"),
  ]);
  assert.equal(photoSources("", "calm").length, 0);
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  assert.deepEqual(photoSources("tiles/marcus_coffee", "story"), [
    "/demo/tiles/marcus_coffee.jpg",
  ]);
});

test("a demo photo url points at the saved file", () => {
  assert.equal(demoPhotoUrl("/tiles/marcus_coffee"), "/demo/tiles/marcus_coffee.jpg");
  assert.equal(demoPhotoUrl("story/marcus_portrait"), "/demo/story/marcus_portrait.jpg");
  assert.equal(demoPhotoUrl(""), null);
});

test("a story image url uses the configured cloud, not a hardcoded one", () => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "my-cloud";
  assert.equal(
    storyImageUrl("story/marcus_portrait"),
    "https://res.cloudinary.com/my-cloud/image/upload/c_fill,g_auto,w_800,h_400/f_auto/q_auto/story/marcus_portrait",
  );
  delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  assert.equal(storyImageUrl("story/marcus_portrait"), null);
});
