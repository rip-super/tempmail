import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import type { Session, Email } from "./types";

config({ quiet: true });

const app = new Hono();
const sessions: Map<string, Session> = new Map();
const inbox: Map<string, Email[]> = new Map();
const allocations: Map<string, { count: number; resetAt: number }> = new Map();

const pool: string[] = readFileSync("./emails.txt", "utf-8").split("\n").map(s => s.trim()).filter(Boolean);
const active: Set<string> = new Set();
const available: Set<string> = new Set(pool);

const rateLimit = 5;
const rateLimitWindow = 30 * 60 * 1000;

app.get("/allocate", c => {
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
        publicKey: "",
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

    const email: Email = {
        id: randomUUID(),
        senderName,
        senderEmail,
        subject,
        body,
        receivedAt: Date.now(),
    };

    inbox.get(address)!.push(email);
    sessions.get(address)!.lastActivity = Date.now();

    console.log(`Mail for ${address} from ${senderName} <${senderEmail}>`);
    return c.json({ ok: true });
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