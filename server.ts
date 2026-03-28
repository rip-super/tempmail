import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config } from "dotenv"
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import type { Session, Email } from "./types";

config({ quiet: true });

const app = new Hono();
const sessions: Map<string, Session> = new Map();
const inbox: Map<string, Email[]> = new Map();

const pool: string[] = readFileSync("./emails.txt", "utf-8").split("\n").map(s => s.trim()).filter(Boolean);
const active: Set<string> = new Set();

app.get("/allocate", c => {
    const available = pool.filter(e => !active.has(e));
    if (available.length === 0) return c.json({ error: "pool exhausted" }, 503);

    const username = available[Math.floor(Math.random() * available.length)];
    const address = `${username}@sahildash.dev`;
    active.add(address);

    const entry: Session = {
        address,
        ip: getConnInfo(c).remote.address ?? "unknown",
        allocatedAt: Date.now(),
        lastActivity: Date.now(),
        publicKey: "",
    };

    sessions.set(address, entry);
    inbox.set(address, []);

    console.log(`Address added: ${address}`);

    return c.json(entry);
});

app.delete("/:address", c => {
    const address = c.req.param("address");
    const session = sessions.get(address);

    if (!session) return c.json({ error: "not found" }, 404);

    sessions.delete(address);
    inbox.delete(address);
    active.delete(address);

    console.log(`Deleted Email: ${address}`);

    return c.json({ ok: true });
});

app.get("/inbox/:address", c => {
    const address = c.req.param("address");
    const session = sessions.get(address);

    if (!session) return c.json({ error: "not found" }, 404);

    return c.json(inbox.get(address) ?? []);
});

app.post("/inbox/:address/add", async c => {
    if (c.req.header("x-cloudflare-secret") !== process.env.CLOUDFLARE_SECRET) {
        return c.json({ error: "unauthorized" }, 401);
    }

    const address = c.req.param("address");
    if (!sessions.has(address)) return c.json({ error: "not found" }, 404);

    const { from, subject, body } = await c.req.json();

    const email: Email = {
        id: randomUUID(),
        from,
        subject,
        body,
        receivedAt: Date.now(),
    };

    inbox.get(address)!.push(email);
    sessions.get(address)!.lastActivity = Date.now();

    console.log(`Mail for ${address} from ${from}`);
    return c.json({ ok: true });
});

app.use("/*", serveStatic({ root: "./frontend" }))

serve({ fetch: app.fetch, port: 6002 }, info => {
    console.log(`Listening at http://localhost:${info.port}`);
});

setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000;

    for (const [address, session] of sessions) {
        if (session.lastActivity < cutoff) {
            sessions.delete(address);
            inbox.delete(address);
            active.delete(address);

            console.log(`Expired: ${address}`);
        }
    }
}, 60_000);