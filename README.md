# autocache

experimental!!

```ts
import { serve } from "https://deno.land/std@0.158.0/http/mod.ts";
import { withCache } from "./mod.ts";

serve(withCache(() =>
  Response.json({ a: "aa" }, {
    headers: { "Cache-Control": "public, max-age=604800" },
  })
));
```
