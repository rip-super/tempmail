import PostalMime from "postal-mime";

interface Env {
    CLOUDFLARE_SECRET: string;
}

export default {
    async email(message: ForwardableEmailMessage, env: Env) {
        const parsed = await new PostalMime().parse(message.raw);

        const to = message.to;
        const address = `${to.split("@")[0]}@${to.split("@")[1]}`;

        const res = await fetch(`https://tempmail.sahildash.dev/inbox/${encodeURIComponent(address)}/add`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-cloudflare-secret": env.CLOUDFLARE_SECRET,
            },
            body: JSON.stringify({
                to: address,
                senderName: parsed.from?.name || parsed.from?.address || message.from,
                senderEmail: parsed.from?.address || message.from,
                subject: parsed.subject ?? "(no subject)",
                textBody: parsed.text ?? "",
                htmlBody: parsed.html ?? parsed.text ?? "",
            }),
        });

        if (!res.ok) {
            throw new Error(`Request failed: ${res.status}`);
        }
    }
};