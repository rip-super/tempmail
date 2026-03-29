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
const openSenderName = document.getElementById("openSenderName");
const openSenderEmail = document.getElementById("openSenderEmail");
const openDate = document.getElementById("openDate");
const openSubject = document.getElementById("openSubject");
const openBody = document.getElementById("openBody");
const avatarText = document.getElementById("avatarText");
const copyFeedback = document.getElementById("copyFeedback");
const overlay = document.getElementById("rateLimitOverlay");

document.getElementById("rateLimitOk").addEventListener("click", () => {
    overlay.classList.remove("active");
});

let emails = [];
let currentOpenId = null;
let pollingInterval = null;
let clearedAt = null;

await(async () => {
    renderEmptyInbox();

    const stored = localStorage.getItem("tempmail_address");

    if (stored) {
        const res = await fetch(`https://tempmail.sahildash.dev/check/${stored}`);
        const data = await res.json();
        if (data.exists) {
            const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
            setTimeout(() => {
                emailText.innerHTML = stored;
                startPolling(stored);
            }, delay);
            return;
        }
    }

    const res = await fetch("https://tempmail.sahildash.dev/allocate");

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

    const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
    setTimeout(() => {
        emailText.innerHTML = data.address;
        startPolling(data.address);
    }, delay);
})();

function startPolling(address) {
    async function fetchInbox() {
        const res = await fetch(`https://tempmail.sahildash.dev/inbox/${address}`);
        if (!res.ok) return;
        emails = await res.json();
        renderInbox();
    }

    if (pollingInterval) clearInterval(pollingInterval);
    fetchInbox();
    pollingInterval = setInterval(fetchInbox, 1000);
}

function formatDate(ts) {
    const d = new Date(ts);
    const date = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return `${date}<br>at ${time}`;
}

function renderEmptyInbox() {
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
    const visible = clearedAt ? emails.filter(m => m.receivedAt > clearedAt) : emails;

    if (!visible.length) { renderEmptyInbox(); return; }
    inboxBody.innerHTML = visible.map(m => `
    <div class="mail-row" data-id="${m.id}">
        <div class="sender-cell">
            <div class="unread-dot"></div>
            <div class="sender-info">
                <div class="sender-name">${m.senderName}</div>
                <div class="sender-email-small">${m.senderEmail}</div>
            </div>
            </div>
            <div class="subject-cell">${m.subject}</div>
            <div class="arrow-cell">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                </svg>
            </div>
    </div>`).join("");

    document.querySelectorAll(".mail-row").forEach(row => {
        row.addEventListener("click", () => openEmail(row.dataset.id));
    });
}

function openEmail(id) {
    const m = emails.find(e => e.id === id);
    if (!m) return;

    currentOpenId = id;
    openSenderName.textContent = m.senderName;
    openSenderEmail.textContent = m.senderEmail;
    openSubject.textContent = m.subject;
    openBody.textContent = m.body;
    avatarText.textContent = m.senderName.split(" ").map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase();
    openDate.innerHTML = formatDate(m.receivedAt);

    inboxHead.classList.add("hidden");
    inboxBody.classList.add("hidden");
    mailView.classList.remove("hidden");
}

function closeEmail() {
    currentOpenId = null;
    mailView.classList.add("hidden");
    inboxBody.classList.remove("hidden");
    inboxHead.classList.remove("hidden");
}

function deleteCurrentEmail() {
    if (currentOpenId === null) return;
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
    const current = localStorage.getItem("tempmail_address");

    emailText.innerHTML = `<span class="shimmer"></span>`;

    const res = await fetch("https://tempmail.sahildash.dev/allocate");

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

    const data = await res.json();
    localStorage.setItem("tempmail_address", data.address);

    const delay = Math.floor(Math.random() * (2500 - 800 + 1)) + 800;
    setTimeout(() => {
        emailText.innerHTML = data.address;
        clearedAt = null;
        startPolling(data.address)
    }, delay);
});

deleteBtn.addEventListener("click", () => {
    clearedAt = Date.now();
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