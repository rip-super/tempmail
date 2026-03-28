import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { readFileSync } from "node:fs";

import type { Session, Email } from "./types";

const app = new Hono();
const sessions: Map<string, Session> = new Map();
const inbox: Map<string, Email[]> = new Map();

const pool: string[] = readFileSync("./emails.txt", "utf-8").split("\n").map(s => s.trim()).filter(Boolean);
const active: Set<string> = new Set();

app.get("/allocate", c => {
    const available = pool.filter(e => !active.has(e));
    if (available.length === 0) return c.json({ error: "pool exhausted" }, 503);

    const address = available[Math.floor(Math.random() * available.length)];
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

    return c.json(entry);
});

app.get("/inbox/:address", c => {
    const address = c.req.param("address");
    const session = sessions.get(address);

    if (!session) return c.json({ error: "not found" }, 404);

    return c.json(inbox.get(address) ?? []);
});

app.post("/inbox/:address/add", c => { return c.text("todo") });

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