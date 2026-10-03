import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAllowedOrigin, tokenMatches, validateImageUrl } from '../lib.js';

test('loopback origins on any port are allowed', () => {
  for (const o of ['http://localhost:5173', 'http://127.0.0.1:4173', 'http://[::1]:5173', 'https://localhost']) {
    assert.equal(isAllowedOrigin(o), true, o);
  }
});

test('non-loopback and malformed origins are rejected', () => {
  for (const o of ['http://192.168.1.20:5173', 'https://evil.example', 'http://localhost.evil.example', 'null', 'file://']) {
    assert.equal(isAllowedOrigin(o), false, o);
  }
});

test('a missing Origin (non-browser client) is allowed; the token still gates it', () => {
  assert.equal(isAllowedOrigin(undefined), true);
});

test('token comparison', () => {
  assert.equal(tokenMatches('abc', 'abc'), true);
  assert.equal(tokenMatches('abd', 'abc'), false);
  assert.equal(tokenMatches('ab', 'abc'), false);
  assert.equal(tokenMatches(null, 'abc'), false);
});

test('image URL validation accepts http(s) and image data URIs of any case', () => {
  for (const u of ['https://x.example/a.png', 'http://x.example/a.png', 'data:image/png;base64,AAAA', 'DATA:IMAGE/PNG;base64,AAAA']) {
    assert.doesNotThrow(() => validateImageUrl(u), u);
  }
});

test('image URL validation rejects dangerous schemes and non-image data', () => {
  assert.throws(() => validateImageUrl('javascript:alert(1)'), /scheme/);
  assert.throws(() => validateImageUrl('file:///etc/passwd'), /scheme/);
  assert.throws(() => validateImageUrl('data:text/html,<script>'), /image/);
  assert.throws(() => validateImageUrl('not a url'), /format/);
});
