import { Hono } from "hono";
import { cors } from "hono/cors";

interface CloudflareBindings {
  linkshortner: KVNamespace;
  API_TOKEN: string;
}

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", cors());

app.post("/generate-shortlink", async (c) => {
  try {
    const { url } = await c.req.json<{ url: string }>();

    const providedToken = c.req.header("X-API-TOKEN");
    const validToken = c.env.API_TOKEN;

    if (!providedToken || providedToken !== validToken) {
      return c.json({
        status: false,
        message: "Unauthorized - Invalid or missing API token",
        data: null
      }, 401);
    }

    if (!url) {
      return c.json({
        status: false,
        message: "URL is required",
        data: null
      }, 400);
    }

    // Using Web Crypto API which is available in Workers by default
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hashBuffer = await crypto.subtle.digest("MD5", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const shortCode = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const oneYearInSeconds = 365 * 24 * 60 * 60; // 365 days * 24 hours * 60 minutes * 60 seconds

    await c.env.linkshortner.put(shortCode, url, {
      expirationTtl: oneYearInSeconds
    });

    return c.json({
      status: true,
      message: "Short link generated successfully",
      data: {
        shortCode,
      }
    });
  } catch (error) {
    return c.json({
      status: false,
      message: "Failed to generate short link",
      data: null
    }, 500);
  }
});

app.get("/:code", async (c) => {
  try {
    const code = c.req.param("code");

    const originalUrl = await c.env.linkshortner.get(code);

    if (!originalUrl) {
      return c.text("Invalid link", 404);
    }

    return c.redirect(originalUrl, 301);
  } catch (error) {
    return c.text("Error processing link", 500);
  }
});

app.get("/ping", (c) => {
  return c.json({
    status: true,
    message: "pong",
    data: null
  });
});

export default app;