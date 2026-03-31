const emailText = document.getElementById("emailText");
const copyBtn = document.getElementById("copyBtn");
const copyIconWrap = document.getElementById("copyIconWrap");
const refreshBtn = document.getElementById("refreshBtn");
const changeBtn = document.getElementById("changeBtn");
const deleteBtn = document.getElementById("deleteBtn");
const inboxHead = document.getElementById("inboxHead");
const inboxBody = document.getElementById("inboxBody");
const mailView = document.getElementById("mailView");
const backBtn = document.getElementById("backBtn");
const deleteMailBtn = document.getElementById("deleteMailBtn");
const sourceBtn = document.getElementById("sourceBtn");
const htmlToggleBtn = document.getElementById("htmlToggleBtn");
const openSenderName = document.getElementById("openSenderName");
const openSenderEmail = document.getElementById("openSenderEmail");
const openDate = document.getElementById("openDate");
const openSubject = document.getElementById("openSubject");
const openBody = document.getElementById("openBody");
const avatarText = document.getElementById("avatarText");
const copyFeedback = document.getElementById("copyFeedback");
const overlay = document.getElementById("rateLimitOverlay");
const expiryBar = document.getElementById("expiryBar");

const LEGENDARY_ADDRESSES = [
    "realgeorgewashingtonusa",
    "mypassiscrazy123",
    "i_use_arch_btw",
    "sixseven",
    "sahildash.dev",
    "tempmail2electricboogaloo"
];

document.getElementById("rateLimitOk").addEventListener("click", () => {
    overlay.classList.remove("active");
});

let emails = [];
let currentOpenId = null;
let clearedAt = null;
let activeStream = null;
let retryTimeout = null;
let retryDelay = 1000;
let deletedIds = new Set();
let renderedIds = new Set();
let currentViewMode = "plain";
let lastActivityLocal = Date.now();
let expiryInterval = null;

await(async () => {
    renderEmptyInbox();

    const stored = localStorage.getItem("tempmail_address");
    const storedCleared = localStorage.getItem("tempmail_cleared");
    if (storedCleared) clearedAt = parseInt(storedCleared);

    const storedAddress = localStorage.getItem("tempmail_address");
    const storedKey = localStorage.getItem("tempmail_privkey");

    if (storedAddress && storedKey) {
        const res = await fetch(`https://tempmail.sahildash.dev/check/${stored}`);
        const data = await res.json();
        if (data.exists) {
            const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
            setTimeout(() => {
                emailText.innerHTML = stored;
                startPolling(stored);
                startExpiryCountdown();
            }, delay);
            return;
        }
    }

    localStorage.removeItem("tempmail_address");
    localStorage.removeItem("tempmail_privkey");

    const pubKey = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
    );
    const publicKey = await crypto.subtle.exportKey("jwk", pubKey.publicKey);
    const privateKey = await crypto.subtle.exportKey("jwk", pubKey.privateKey);
    localStorage.setItem("tempmail_privkey", JSON.stringify(privateKey));

    const res = await fetch("https://tempmail.sahildash.dev/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey }),
    });

    if (res.status === 429) {
        overlay.classList.add("active");
        if (stored) {
            const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
            setTimeout(() => emailText.innerHTML = stored, delay);
        }
        return;
    }

    const data = await res.json();
    localStorage.setItem("tempmail_address", data.address);

    const username = data.address.split("@")[0];
    if (LEGENDARY_ADDRESSES.includes(username)) {
        await showLegendaryPopup();
    }

    const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
    setTimeout(() => {
        emailText.innerHTML = data.address;
        startPolling(data.address);
        startExpiryCountdown();
    }, delay);
})();

function showLegendaryPopup() {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "legendary-popup-overlay";
        overlay.innerHTML = `
            <div class="legendary-popup">
                <p>congrats! you rolled a <span class="legendary-label">legendary</span> email address.<br>(0.01% chance!) good job!</p>
                <button id="legendary-ok">yay</button>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector("#legendary-ok").addEventListener("click", () => {
            overlay.remove();
            resolve();
        }, { once: true });
    });
}

async function decryptEmail(email) {
    const b64ToArr = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const jwk = JSON.parse(localStorage.getItem("tempmail_privkey"));
    const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);

    async function decryptField(payload) {
        const aesKeyRaw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, b64ToArr(payload.encryptedKey));
        const aesKey = await crypto.subtle.importKey("raw", aesKeyRaw, { name: "AES-GCM" }, false, ["decrypt"]);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToArr(payload.iv) }, aesKey, b64ToArr(payload.ciphertext));
        return new TextDecoder().decode(plain);
    }

    const [subject, body, senderName, senderEmail] = await Promise.all([
        decryptField(email.subject), decryptField(email.body),
        decryptField(email.senderName), decryptField(email.senderEmail),
    ]);
    let bodyHtml = "";
    if (email.bodyHtml) {
        bodyHtml = await decryptField(email.bodyHtml);
    }
    return { ...email, subject, body, bodyHtml, senderName, senderEmail };
}

function startPolling(address) {
    if (activeStream) activeStream.close();
    if (retryTimeout) clearTimeout(retryTimeout);

    fetch(`https://tempmail.sahildash.dev/inbox/${address}`)
        .then(r => r.json())
        .then(async raw => {
            emails = await Promise.all(raw.map(decryptEmail));
            renderInbox();
        });

    const es = new EventSource(`https://tempmail.sahildash.dev/inbox/${address}/stream`);
    activeStream = es;

    es.addEventListener("connected", () => { retryDelay = 1000; });

    es.addEventListener("email", async e => {
        const raw = JSON.parse(e.data);
        const decrypted = await decryptEmail(raw);
        emails.push(decrypted);
        lastActivityLocal = Date.now();
        renderInbox();

        if ("Notification" in window) {
            if (Notification.permission === "default") {
                const result = await Notification.requestPermission();
                if (result === "granted" && document.visibilityState !== "visible") {
                    new Notification(`New email — ${decrypted.senderName}`, { body: decrypted.subject, icon: "/favicon.ico" });
                }
            } else if (Notification.permission === "granted" && document.visibilityState !== "visible") {
                new Notification(`New email — ${decrypted.senderName}`, { body: decrypted.subject, icon: "/favicon.ico" });
            }
        }
    });

    es.addEventListener("error", () => {
        es.close();
        activeStream = null;
        retryTimeout = setTimeout(() => startPolling(address), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
    });
}

function formatDate(ts) {
    const d = new Date(ts);
    const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return `${date}<br>at ${time}`;
}

function esc(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderEmptyInbox() {
    if (inboxBody.querySelector(".empty-state")) return;

    inboxBody.innerHTML = `
    <div class="empty-state">
        <div class="empty-icon-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
            </svg>
        </div>
        <h3>Inbox is empty</h3>
        <p>Waiting for incoming mail...</p>
    </div>`;
}

function renderInbox() {
    const visible = emails.filter(m => !deletedIds.has(m.id) && (!clearedAt || m.receivedAt > clearedAt)).reverse();

    document.title = visible.length > 0
        ? `(${visible.length}) tempmail - private and secure temporary email`
        : "tempmail - private and secure temporary email";

    if (!visible.length) {
        const rows = inboxBody.querySelectorAll(".mail-row");
        if (!rows.length) {
            renderedIds = new Set();
            renderEmptyInbox();
            return;
        }
        rows.forEach(row => row.classList.add("is-leaving"));
        setTimeout(() => {
            renderedIds = new Set();
            renderEmptyInbox();
        }, 200);
        return;
    }

    const empty = inboxBody.querySelector(".empty-state");
    if (empty) empty.remove();

    const visibleIds = new Set(visible.map(m => m.id));

    inboxBody.querySelectorAll(".mail-row").forEach(row => {
        if (!visibleIds.has(row.dataset.id)) row.remove();
    });

    visible.forEach((m, i) => {
        if (renderedIds.has(m.id)) return;

        const row = document.createElement("div");
        row.className = "mail-row is-new";
        row.dataset.id = m.id;
        row.innerHTML = `
        <div class="sender-cell">
            <div class="unread-dot"></div>
            <div class="sender-info">
                <div class="sender-name">${esc(m.senderName)}</div>
                <div class="sender-email-small">${esc(m.senderEmail)}</div>
            </div>
        </div>
        <div class="subject-cell">${esc(m.subject)}</div>
        <div class="arrow-cell">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
            </svg>
        </div>`;

        row.addEventListener("click", () => openEmail(m.id));
        row.addEventListener("animationend", () => row.classList.remove("is-new"), { once: true });

        const allRows = inboxBody.querySelectorAll(".mail-row");
        if (i < allRows.length) {
            inboxBody.insertBefore(row, allRows[i]);
        } else {
            inboxBody.appendChild(row);
        }
    });

    renderedIds = visibleIds;
}

function openEmail(id) {
    const m = emails.find(e => e.id === id);
    if (!m) return;

    currentOpenId = id;
    currentViewMode = "plain";
    openSenderName.textContent = m.senderName;
    openSenderEmail.textContent = m.senderEmail;
    openSubject.textContent = m.subject;
    openBody.classList.remove("html-mode");
    openBody.textContent = m.body;
    avatarText.textContent = m.senderName.split(" ").map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
    openDate.innerHTML = formatDate(m.receivedAt);

    htmlToggleBtn.textContent = "HTML";
    htmlToggleBtn.classList.remove("active");
    if (m.bodyHtml) {
        htmlToggleBtn.classList.remove("hidden");
    } else {
        htmlToggleBtn.classList.add("hidden");
    }

    inboxHead.classList.add("hidden");
    inboxBody.classList.add("hidden");
    mailView.classList.remove("hidden");
    mailView.classList.add("entering");
    mailView.addEventListener("animationend", () => {
        mailView.classList.remove("entering");
    }, { once: true });
}

function closeEmail() {
    currentOpenId = null;
    mailView.classList.add("leaving");
    mailView.addEventListener("animationend", () => {
        mailView.classList.remove("leaving");
        mailView.classList.add("hidden");
        inboxBody.classList.remove("hidden");
        inboxBody.classList.add("returning");
        inboxHead.classList.remove("hidden");
        inboxBody.addEventListener("animationend", () => {
            inboxBody.classList.remove("returning");
        }, { once: true });
    }, { once: true });
}

function updateBodyView() {
    const m = emails.find(e => e.id === currentOpenId);
    if (!m) return;

    if (currentViewMode === "html" && m.bodyHtml) {
        openBody.classList.add("html-mode");
        openBody.innerHTML = "";
        const iframe = document.createElement("iframe");
        iframe.className = "mail-body-iframe";
        iframe.setAttribute("sandbox", "allow-popups");
        iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:16px;font-family:sans-serif;font-size:14px;line-height:1.6;color:#000;}</style></head><body>${m.bodyHtml}</body></html>`;
        openBody.appendChild(iframe);
        htmlToggleBtn.classList.add("active");
        htmlToggleBtn.textContent = "Plain";
    } else {
        currentViewMode = "plain";
        openBody.classList.remove("html-mode");
        openBody.innerHTML = "";
        openBody.textContent = m.body;
        htmlToggleBtn.classList.remove("active");
        htmlToggleBtn.textContent = "HTML";
    }
}

htmlToggleBtn.addEventListener("click", () => {
    currentViewMode = currentViewMode === "plain" ? "html" : "plain";
    updateBodyView();
});

function startExpiryCountdown() {
    expiryBar.classList.remove("hidden");
    expiryBar.classList.remove("expired");
    if (expiryInterval) clearInterval(expiryInterval);

    expiryInterval = setInterval(() => {
        const remaining = Math.max(0, 30 * 60 * 1000 - (Date.now() - lastActivityLocal));
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const timerEl = document.getElementById("expiryTimer");

        if (remaining === 0) {
            timerEl.textContent = "Session expired";
            expiryBar.classList.add("expired");
            clearInterval(expiryInterval);
        } else {
            timerEl.textContent = `Expires in ${mins}:${secs.toString().padStart(2, "0")}`;
        }
    }, 1000);
}

function deleteCurrentEmail() {
    if (currentOpenId === null) return;
    deletedIds.add(currentOpenId);
    emails = emails.filter(m => m.id !== currentOpenId);
    closeEmail();
    renderInbox();
}

async function copyEmail(e) {
    e.preventDefault();

    const value = emailText.textContent.trim();
    if (!value) return;

    let copied = false;

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            copied = true;
        } else {
            const ta = document.createElement("textarea");
            ta.value = value;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            ta.style.pointerEvents = "none";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();

            try {
                copied = document.execCommand("copy");
            } catch (err) {
                copied = false;
            }

            document.body.removeChild(ta);
        }
    } catch (err) {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();

        try {
            copied = document.execCommand("copy");
        } catch (fallbackErr) {
            copied = false;
        }

        document.body.removeChild(ta);
    }

    if (copied) {
        copyBtn.classList.add("copied");
        copyFeedback.classList.add("show");
        copyIconWrap.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <polyline points="21 5 12 14 8 10"
            style="fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;" />
        <path d="M20.94,11A8.26,8.26,0,0,1,21,12a9,9,0,1,1-9-9,8.83,8.83,0,0,1,4,1"
            style="fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2;" />
        </svg>`;

        setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyFeedback.classList.remove("show");
            copyIconWrap.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>`;
        }, 1500);
    } else {
        console.error("Copy failed");
    }
}

copyBtn.addEventListener("click", copyEmail);
refreshBtn.addEventListener("click", () => {
    window.location.reload();
});

changeBtn.addEventListener("click", async () => {
    deleteBtn.click();

    const current = localStorage.getItem("tempmail_address");

    emailText.innerHTML = `<span class="shimmer"></span>`;

    const pubKey = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
    );
    const publicKey = await crypto.subtle.exportKey("jwk", pubKey.publicKey);
    const privateKey = await crypto.subtle.exportKey("jwk", pubKey.privateKey);
    localStorage.setItem("tempmail_privkey", JSON.stringify(privateKey));

    const res = await fetch("https://tempmail.sahildash.dev/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey }),
    });

    if (res.status === 429) {
        overlay.classList.add("active");
        await new Promise(resolve => {
            document.getElementById("rateLimitOk").addEventListener("click", () => {
                overlay.classList.remove("active");
                setTimeout(resolve, 500);
            }, { once: true });
        });
        emailText.innerHTML = current;
        return;
    }

    if (current) {
        fetch(`https://tempmail.sahildash.dev/${current}`, { method: "DELETE" });
    }

    const data = await res.json();
    localStorage.setItem("tempmail_address", data.address);

    const username = data.address.split("@")[0];
    if (LEGENDARY_ADDRESSES.includes(username)) {
        await showLegendaryPopup();
    }

    const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
    setTimeout(() => {
        emailText.innerHTML = data.address;

        localStorage.removeItem("tempmail_cleared");

        clearedAt = null;
        deletedIds = new Set();
        renderedIds = new Set();
        lastActivityLocal = Date.now();

        startPolling(data.address);
        startExpiryCountdown();
    }, delay);
});

deleteBtn.addEventListener("click", () => {
    clearedAt = Date.now();
    localStorage.setItem("tempmail_cleared", clearedAt);
    closeEmail();
    renderInbox();
});

backBtn.addEventListener("click", closeEmail);
deleteMailBtn.addEventListener("click", deleteCurrentEmail);

sourceBtn.addEventListener("click", () => {
    if (currentOpenId === null) return;
    const m = emails.find(e => e.id === currentOpenId);
    if (!m) return;
    const eml = `From: ${m.senderName} <${m.senderEmail}>\nTo: ${emailText.textContent.trim()}\nSubject: ${m.subject}\nDate: ${m.date}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n${m.body}\n`;
    const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
    const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `${m.subject || "email"}.eml`.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_"),
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});