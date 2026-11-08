import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateIpv4, isPrivateIpv6, parseAndValidateUrl, SsrfError } from "../ssrf.js";

test("blocks loopback and localhost variants", () => {
  assert.throws(() => parseAndValidateUrl("http://127.0.0.1/file.zip"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://localhost/file.zip"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://evil.localhost/file.zip"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://[::1]/file.zip"), SsrfError);
});

test("blocks RFC1918, link-local, CGNAT and cloud metadata IPs", () => {
  assert.throws(() => parseAndValidateUrl("http://10.0.0.5/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://172.16.3.9/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://192.168.1.1/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://169.254.169.254/latest/meta-data"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://100.64.0.1/x"), SsrfError);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(isPrivateIpv6("2606:4700:4700::1111"), false);
});

test("blocks non-http schemes and credential-smuggling URLs", () => {
  assert.throws(() => parseAndValidateUrl("ftp://example.com/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("file:///etc/passwd"), SsrfError);
  assert.throws(() => parseAndValidateUrl("https://user:pass@example.com/x"), SsrfError);
});

test("blocks disallowed ports", () => {
  assert.throws(() => parseAndValidateUrl("http://example.com:22/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://example.com:6379/x"), SsrfError);
});

test("blocks internal-suffix hostnames", () => {
  assert.throws(() => parseAndValidateUrl("http://db.internal/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("http://printer.lan/x"), SsrfError);
  assert.throws(() => parseAndValidateUrl("https://metadata.google.internal/x"), SsrfError);
});

test("accepts ordinary public https URLs", () => {
  const v = parseAndValidateUrl("https://releases.ubuntu.com/24.04/ubuntu-24.04.3-live-server-amd64.iso");
  assert.equal(v.hostname, "releases.ubuntu.com");
  assert.equal(v.isIpLiteral, false);
  const ip = parseAndValidateUrl("https://1.1.1.1/file.zip");
  assert.equal(ip.isIpLiteral, true);
});
