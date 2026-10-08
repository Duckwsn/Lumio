import test from "node:test";
import assert from "node:assert/strict";
import { isDriveReference, youtubeIdFromInput } from "./MediaResolver";

test("YouTube links require a complete ID on an HTTPS YouTube host", () => {
  const id = "abcdefghijk";
  assert.equal(youtubeIdFromInput(`https://youtu.be/${id}?si=share`), id);
  assert.equal(youtubeIdFromInput(`https://www.youtube.com/watch?v=${id}&t=12`), id);
  assert.equal(youtubeIdFromInput(`https://www.youtube.com/embed/${id}`), id);
  assert.equal(youtubeIdFromInput(`https://youtu.be/${id}extra`), "");
  assert.equal(youtubeIdFromInput(`https://www.youtube.com/embed/${id}extra`), "");
  assert.equal(youtubeIdFromInput(`ftp://youtube.com/watch?v=${id}`), "");
  assert.equal(youtubeIdFromInput(`https://youtube.com.evil.example/watch?v=${id}`), "");
});

test("Drive reference detection requires the actual Google Drive HTTPS host", () => {
  assert.equal(isDriveReference("https://drive.google.com/file/d/abcdefghijk/view"), true);
  assert.equal(isDriveReference("https://evil.example/?next=https://drive.google.com/file/d/abcdefghijk"), false);
  assert.equal(isDriveReference("http://drive.google.com/file/d/abcdefghijk/view"), false);
});
