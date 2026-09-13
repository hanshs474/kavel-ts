# @kavel/kavel

Generate **and edit** images from TypeScript with no API key, no account and no card. Runs in Deno,
Node 18+ and Bun — anything with `fetch`, zero dependencies.

```bash
deno add jsr:@kavel/kavel      # or: npx jsr add @kavel/kavel
```

```ts
import { generate, edit, KavelError } from "@kavel/kavel";

const img = await generate(
  "matte black ceramic mug on pale oak, soft window light from the left, shallow depth of field",
  { aspectRatio: "16:9" },
);
console.log(img.url); // https://cdn.kavel.ai/uploads/kie/image/....webp

const edited = await edit(img.url, "place the mug on a white marble surface");
```

Every other image client wants a key from OpenAI, fal or Replicate before it runs once. This one talks
to the free tier of [Kavel](https://www.kavel.ai/?utm_source=jsr&utm_medium=package) — a client id
the module invents rather than an account you register — so a script works on a machine with nothing
configured, including CI and edge functions.

## Why it is shaped this way

- **Zero dependencies, fully typed.** Just `fetch` and Web Crypto.
- **An edit lane.** `edit` takes a photo you already have and one sentence describing the change.
- **One error class with a `kind`.** `quota` means wait or sign in, `rejected` means reword,
  `sign_in` means the request is off the free shelf.
- **`AbortSignal` support and a deadline.** Pass `signal` to cancel from a UI.
- **It keeps polling through a dropped connection.** A free run waits in a queue and only reaches the
  model at the end of it; giving up on one failed poll would throw away a job about to run.

## Limits, measured against the running service

- The free grant is **15 credits**. An image costs **5**, an edit costs **15**. The crate mints a new
  client id per call, so a loop is not capped at three.
- **30 credits per IP per day** sits on top — about six images from one machine — and surfaces as
  a `quota` error.
- Free output is **1K and watermarked**; `img.watermarked` tells you instead of leaving you to guess.
- Free runs queue **25–80 seconds** before the model is called, which is why the default deadline is
  six minutes.
- **Video does not run anonymously** — the cheapest clip costs more than the grant. The
  [AI video generator](https://www.kavel.ai/video?utm_source=jsr&utm_medium=package) has a browser
  lane for that.

Signing in removes the watermark and opens the full shelf:
[Nano Banana 2](https://www.kavel.ai/image/nano-banana-2?utm_source=jsr&utm_medium=package) for up to
14 reference photos, [GPT Image 2](https://www.kavel.ai/image/gpt-image-2?utm_source=jsr&utm_medium=package)
for 4K output, [Qwen Image 3](https://www.kavel.ai/image/qwen-image-3?utm_source=jsr&utm_medium=package)
when the picture has to contain correctly spelled text, and
[Seedream 5.0 Pro](https://www.kavel.ai/image/seedream-5-pro?utm_source=jsr&utm_medium=package) for
photoreal people. [Pricing](https://www.kavel.ai/pricing?utm_source=jsr&utm_medium=package) has every tier.

## Past the free tier: an API key

When the free allowance runs out, the error tells you where to go next. Create a key at
[kavel.ai/settings/apikeys](https://www.kavel.ai/settings/apikeys?utm_source=jsr&utm_medium=package) — the same account
you use on the site — and pass it (or set `KAVEL_API_KEY`):

```ts
const img = await generate(prompt, { apiKey: Deno.env.get("KAVEL_API_KEY"), model: "gpt-image-2" });
```

With a key every call runs on your account, exactly as it would on the site: your
[credits and plan](https://www.kavel.ai/pricing?utm_source=jsr&utm_medium=package), no per-IP ceiling, no watermark on a
paid plan, and any image model your plan includes. A `KavelError` with `kind === "auth"` means the key is wrong; `"quota"` with a key means the account is out of credits.

## Prompts that work

Name the light, the material and the composition — that moves the result more than adjectives do.
For edits, say what changes and the model keeps the rest; it is the same
[Nano Banana 2 Lite](https://www.kavel.ai/image/nano-banana-2-lite?utm_source=jsr&utm_medium=package)
lane behind the [AI hairstyle changer](https://www.kavel.ai/image/ai-hairstyle-changer?utm_source=jsr&utm_medium=package)
and the [AI outfit generator](https://www.kavel.ai/image/ai-outfit-generator?utm_source=jsr&utm_medium=package).
The [free AI image generator](https://www.kavel.ai/image?utm_source=jsr&utm_medium=package) runs the
same engines in a browser, and the [showcase](https://www.kavel.ai/showcases?utm_source=jsr&utm_medium=package)
has finished output.

## Tests

```bash
deno test
```

Offline: argument validation, client id uniqueness, the quota wall (an HTTP 200 recognised only by a
field), the sign-in refusal, and polling through a dropped connection.

MIT
