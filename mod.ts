// Generate and edit images with no API key and no account. See README.md.
/** The service this module talks to. */
export const BASE_URL = "https://www.kavel.ai";
/** Credit balance a signed-out caller starts with. */
export const ANON_GRANT = 15;
/** What one generated image costs, so the grant pays for three. */
export const COST_TEXT_TO_IMAGE = 5;
/** What one edit costs: the whole grant. */
export const COST_EDIT = 15;
/** Credits one machine may spend per day regardless of client ids. */
export const IP_DAILY_CEILING = 30;
/** The free text-to-image engine. */
export const MODEL_GENERATE = "kavel-image-v1";
/** The free image-to-image engine. */
export const MODEL_EDIT = "nano-banana-2-lite";

/** One finished picture. */
export interface Image {
  /** A permanent, cacheable CDN link. */
  url: string;
  /** Whether a mark was actually drawn on it. Signing in removes it. */
  watermarked: boolean;
}

/** Tunes a single call. Every field is optional. */
export interface Options {
  /** "1:1" (default), "16:9", "9:16", "4:3" or "3:4". Ignored by {@link edit}. */
  aspectRatio?: string;
  /** Poll interval in milliseconds. Default 5000. */
  pollEveryMs?: number;
  /** Deadline for the whole call in milliseconds. Default 360000. */
  timeoutMs?: number;
  /** Aborts the call. */
  signal?: AbortSignal;
  /** Override for tests or a proxy. */
  baseUrl?: string;
  /** Override for tests. */
  fetch?: typeof fetch;
}

/** Why a call failed, split by what the caller should do next. */
export type KavelErrorKind =
  | "invalid" // fix the call
  | "quota" // wait, or sign in
  | "rejected" // reword the prompt
  | "sign_in" // off the free shelf
  | "timeout"
  | "service";

/** The only error this module throws on purpose. Branch on `kind`. */
export class KavelError extends Error {
  /** What went wrong. */
  readonly kind: KavelErrorKind;
  /** Creates an error of a given kind. */
  constructor(kind: KavelErrorKind, message: string) {
    super(`kavel: ${message}`);
    this.name = "KavelError";
    this.kind = kind;
  }
}

interface Envelope {
  code: number;
  message?: string;
  data?: Record<string, unknown> | null;
}

/** A fresh client id. A reused id walls partway through a loop. */
export function anonId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return "ts-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Interpret the submit response. The quota wall answers HTTP 200 with code 0,
 * so it can only be recognised by a field.
 */
export function parseSubmit(env: Envelope): string {
  if (env.code !== 0) {
    const m = env.message ?? "request refused";
    if (m.toLowerCase().includes("sign in")) throw new KavelError("sign_in", m);
    throw new KavelError("service", m);
  }
  const d = env.data ?? {};
  if (d.wall === true) {
    if (d.reason === "anon_ip_daily") {
      throw new KavelError("quota", `this machine has used its ${IP_DAILY_CEILING} credits for today`);
    }
    if (d.reason === "anon_unmetered_video") throw new KavelError("sign_in", "video");
    throw new KavelError("quota", "free allowance spent");
  }
  if (typeof d.id !== "string" || d.id === "") {
    throw new KavelError("service", "the service returned no task id");
  }
  return d.id;
}

/** Turn a prompt into a new image. Name the light, the material and the composition. */
export function generate(prompt: string, opts: Options = {}): Promise<Image> {
  if (!prompt?.trim()) return Promise.reject(new KavelError("invalid", "prompt is required"));
  return run(opts, {
    provider: "kie",
    mediaType: "image",
    model: MODEL_GENERATE,
    scene: "text-to-image",
    prompt,
    options: { aspect_ratio: opts.aspectRatio || "1:1" },
  });
}

/** Rewrite an existing image. `sourceUrl` must be a public http(s) url. */
export function edit(sourceUrl: string, instruction: string, opts: Options = {}): Promise<Image> {
  if (!/^https?:\/\//.test(sourceUrl ?? "")) {
    return Promise.reject(new KavelError("invalid", "sourceUrl must be a public http(s) url"));
  }
  if (!instruction?.trim()) return Promise.reject(new KavelError("invalid", "instruction is required"));
  return run(opts, {
    provider: "kie",
    mediaType: "image",
    model: MODEL_EDIT,
    scene: "image-to-image",
    prompt: instruction,
    options: { image_input: [sourceUrl] },
  });
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    }, { once: true });
  });

async function run(opts: Options, payload: unknown): Promise<Image> {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? BASE_URL;
  const deadline = Date.now() + (opts.timeoutMs ?? 360_000);
  const id = anonId();

  const res = await f(`${base}/api/ai/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-anon-id": id },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
  const task = parseSubmit(await res.json() as Envelope);

  // Free runs queue 25-80s and only reach the model on the poll that crosses
  // the end of it, so polling is what starts the work.
  const query = `${base}/api/ai/anon-query?taskId=${encodeURIComponent(task)}&provider=kie&mediaType=image`;
  while (Date.now() < deadline) {
    await wait(opts.pollEveryMs ?? 5000, opts.signal);
    let env: Envelope;
    try {
      env = await (await f(query, { headers: { "x-anon-id": id }, signal: opts.signal })).json();
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      continue; // a dropped poll is not a failed generation
    }
    if (env.code !== 0) continue;
    const d = env.data ?? {};
    const images = d.images as string[] | undefined;
    if (images?.length) {
      return { url: images[0], watermarked: Boolean((d.watermarked as boolean[] | undefined)?.[0]) };
    }
    if (d.status === "failed" || d.status === "error") throw new KavelError("rejected", "prompt refused");
  }
  throw new KavelError("timeout", "deadline passed");
}

/** What a client id has left. Costs nothing. Omit `clientId` to ask about a fresh one. */
export async function credits(clientId: string = anonId()): Promise<{ remaining: number; grant: number }> {
  const env = await (await fetch(`${BASE_URL}/api/ai/anon-credits`, { headers: { "x-anon-id": clientId } }))
    .json() as Envelope;
  if (env.code !== 0) throw new KavelError("service", env.message ?? "failed");
  return { remaining: Number(env.data?.remaining ?? 0), grant: Number(env.data?.grant ?? 0) };
}
