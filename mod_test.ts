import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { anonId, edit, generate, KavelError, parseSubmit } from "./mod.ts";

Deno.test("client ids are unique", () => {
  assert(anonId() !== anonId());
  assert(anonId().startsWith("ts-"));
});

Deno.test("validates arguments", async () => {
  await assertRejects(() => generate("  "), KavelError);
  await assertRejects(() => edit("file:///x.png", "hi"), KavelError);
  await assertRejects(() => edit("https://x/y.png", ""), KavelError);
});

Deno.test("quota wall is a 200 recognised by a field", () => {
  const e = assertThrows(() => parseSubmit({ code: 0, data: { wall: true, reason: "anon_ip_daily" } }), KavelError);
  assertEquals(e.kind, "quota");
});

Deno.test("sign-in refusal", () => {
  const e = assertThrows(() => parseSubmit({ code: -1, message: "Please sign in to use this model" }), KavelError);
  assertEquals(e.kind, "sign_in");
});

Deno.test("keeps polling through a dropped connection", async () => {
  let polls = 0;
  const fake = ((url: string) => {
    if (url.endsWith("/api/ai/generate")) return Promise.resolve(Response.json({ code: 0, data: { id: "t1" } }));
    polls++;
    if (polls === 1) return Promise.reject(new TypeError("network down"));
    return Promise.resolve(Response.json({ code: 0, data: { status: "success", images: ["https://cdn/x.webp"], watermarked: [true] } }));
  }) as typeof fetch;
  const img = await generate("x", { fetch: fake, pollEveryMs: 1, baseUrl: "https://t" });
  assertEquals(img, { url: "https://cdn/x.webp", watermarked: true });
  assertEquals(polls, 2);
});
