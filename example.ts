// deno run -A example.ts "an isometric coffee shop, pastel palette"
// deno run -A example.ts --edit https://example.com/portrait.jpg "give him a buzz cut"
import { edit, generate } from "./mod.ts";
const a = Deno.args;
const img = a[0] === "--edit" ? await edit(a[1], a[2]) : await generate(a[0]);
console.log(img.url, img.watermarked ? "(watermarked)" : "");
