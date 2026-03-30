import { Hono } from "hono";
import { streamSSE, SSEStreamingApi } from "hono/streaming";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import type { Session, Email, Payload } from "./types";

config({ quiet: true });

const app = new Hono();
const sessions: Map<string, Session> = new Map();
const inbox: Map<string, Email[]> = new Map();
const allocations: Map<string, { count: number; resetAt: number }> = new Map();
const subscribers: Map<string, Set<SSEStreamingApi>> = new Map();

const pool: string[] = readFileSync("./emails.txt", "utf-8").split("\n").map(s => s.trim()).filter(Boolean);
const active: Set<string> = new Set();
const available: Set<string> = new Set(pool);

const rateLimit = 5;
const rateLimitWindow = 30 * 60 * 1000;

function arrToB64(buf: ArrayBuffer): string {
    return Buffer.from(buf).toString("base64");
}

async function encryptField(value: string, pubKey: CryptoKey): Promise<Payload> {
    const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(value));
    const rawAes = await crypto.subtle.exportKey("raw", aesKey);
    const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawAes);

    return { encryptedKey: arrToB64(encryptedKey), iv: arrToB64(iv.buffer), ciphertext: arrToB64(ciphertext) };
}

app.post("/allocate", async c => {
    const body = await c.req.json().catch(() => null);
    if (!body?.publicKey || body.publicKey.kty !== "RSA") {
        return c.json({ error: "invalid_key" }, 400);
    }

    const ip = getConnInfo(c).remote.address ?? "unknown";
    const now = Date.now();
    const record = allocations.get(ip);

    if (record && now < record.resetAt) {
        if (record.count >= rateLimit) return c.json({ error: "allocation limit reached" }, 429);
        record.count++;
    } else {
        allocations.set(ip, { count: 1, resetAt: now + rateLimitWindow });
    }

    if (available.size === 0) return c.json({ error: "pool exhausted" }, 503);

    const username = [...available][Math.floor(Math.random() * available.size)];
    const address = `${username}@sahildash.dev`;

    available.delete(username);
    active.add(address);

    const entry: Session = {
        address,
        ip,
        allocatedAt: now,
        lastActivity: now,
        publicKey: body.publicKey,
    };

    sessions.set(address, entry);
    inbox.set(address, []);

    console.log(`Address allocated: ${address} - pool remaining: ${available.size}`);

    return c.json({ address: entry.address, allocatedAt: entry.allocatedAt });
});

app.get("/check/:address", c => {
    const address = c.req.param("address");
    if (!sessions.has(address)) return c.json({ exists: false }, 404);

    return c.json({ exists: true });
});

app.delete("/:address", c => {
    const address = c.req.param("address");
    const session = sessions.get(address);

    if (!session) return c.json({ error: "not found" }, 404);

    const username = address.split("@")[0];
    sessions.delete(address);
    inbox.delete(address);
    active.delete(address);
    available.add(username);

    console.log(`Deleted: ${address} - pool remaining: ${available.size}`);

    return c.json({ ok: true });
});

app.get("/inbox/:address", c => {
    const address = c.req.param("address");
    if (!sessions.has(address)) return c.json({ error: "not found" }, 404);

    return c.json(inbox.get(address) ?? []);
});

app.post("/inbox/:address/add", async c => {
    if (c.req.header("x-cloudflare-secret") !== process.env.CLOUDFLARE_SECRET) {
        return c.json({ error: "unauthorized" }, 401);
    }

    const address = c.req.param("address");
    if (!sessions.has(address)) return c.json({ error: "not found" }, 404);

    const { senderName, senderEmail, subject, body } = await c.req.json();

    let pubKey: CryptoKey;
    try {
        pubKey = await crypto.subtle.importKey(
            "jwk", sessions.get(address)!.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
        );
    } catch {
        console.error(`Failed to import public key for ${address}`);
        return c.json({ error: "invalid key" }, 422);
    }

    const email: Email = {
        id: randomUUID(),
        senderName: await encryptField(senderName ?? "", pubKey),
        senderEmail: await encryptField(senderEmail ?? "", pubKey),
        subject: await encryptField(subject ?? "(no subject)", pubKey),
        body: await encryptField(body ?? "", pubKey),
        receivedAt: Date.now(),
    };

    inbox.get(address)!.push(email);
    sessions.get(address)!.lastActivity = Date.now();
    subscribers.get(address)?.forEach(s => {
        s.writeSSE({ event: "email", data: JSON.stringify(email) })
    });

    console.log(`Mail for ${address} from ${senderName} <${senderEmail}>`);
    return c.json({ ok: true });
});

app.get("/inbox/:address/stream", async c => {
    const address = c.req.param("address");
    if (!sessions.has(address)) return c.json({ error: "not found" }, 404);

    return streamSSE(c, async stream => {
        if (!subscribers.has(address)) subscribers.set(address, new Set());
        subscribers.get(address)!.add(stream);

        stream.onAbort(() => { subscribers.get(address)?.delete(stream); });

        await stream.writeSSE({ event: "connected", data: "ok" });

        while (!stream.closed) {
            await stream.sleep(30000);
            await stream.writeSSE({ event: "ping", data: "" });
        }
    });
});

app.use("/*", serveStatic({ root: "./frontend" }));

serve({ fetch: app.fetch, port: 6002 }, info => {
    console.log(`Listening at http://localhost:${info.port}`);
});

setInterval(() => {
    const now = Date.now();
    const cutoff = now - 30 * 60 * 1000;

    for (const [address, session] of sessions) {
        if (session.lastActivity < cutoff) {
            const username = address.split("@")[0];
            sessions.delete(address);
            inbox.delete(address);
            active.delete(address);
            available.add(username);

            console.log(`Expired: ${address} - pool remaining: ${available.size}`);
        }
    }

    for (const [ip, record] of allocations) {
        if (now > record.resetAt) allocations.delete(ip);
    }
}, 60_000);