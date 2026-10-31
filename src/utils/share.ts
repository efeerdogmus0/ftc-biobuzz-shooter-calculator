// Scenario share links: `#s=1.<base64url(deflate-raw(JSON))>`.
// Versioned prefix, size limits on both the encoded text and the inflated JSON
// (a small link cannot expand into a huge allocation), and the decoded value
// always goes through parseScenario.
import {
  captureScenario,
  parseScenario,
  type Scenario,
  type ScenarioState,
} from "./scenario";

export const SHARE_PREFIX = "#s=1.";
export const SHARE_LIMITS = { encodedChars: 96 * 1024, jsonBytes: 1024 * 1024 };

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromBase64Url(text: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(text))
    throw new Error("Share link is not valid base64url.");
  const padded =
    text.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function readLimited(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`Shared scenario expands beyond ${limit / 1024} kB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function encodeShare(state: ScenarioState) {
  const json = new TextEncoder().encode(JSON.stringify(captureScenario(state)));
  if (json.length > SHARE_LIMITS.jsonBytes)
    throw new Error(
      "Scenario is too large to share as a link; export a file instead.",
    );
  const compressed = await readLimited(
    new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw")),
    SHARE_LIMITS.jsonBytes,
  );
  const hash = SHARE_PREFIX + toBase64Url(compressed);
  if (hash.length > SHARE_LIMITS.encodedChars)
    throw new Error(
      "Scenario is too large to share as a link; export a file instead.",
    );
  return hash;
}

export function isShareHash(hash: string) {
  return hash.startsWith("#s=");
}

export async function decodeShare(hash: string): Promise<Scenario> {
  if (!hash.startsWith(SHARE_PREFIX))
    throw new Error("Unsupported share link version.");
  if (hash.length > SHARE_LIMITS.encodedChars)
    throw new Error("Share link is too long.");
  const bytes = fromBase64Url(hash.slice(SHARE_PREFIX.length));
  let json: Uint8Array;
  try {
    json = await readLimited(
      new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw")),
      SHARE_LIMITS.jsonBytes,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Shared scenario expands"))
      throw e;
    throw new Error("Share link is corrupted.");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error("Share link does not contain valid JSON.");
  }
  return parseScenario(value);
}
