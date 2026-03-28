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

const addresses = [
    "bocehah807@sahildash.dev",
    "mivota214@sahildash.dev",
    "telnix482@sahildash.dev",
    "lunera901@sahildash.dev",
    "kevoma777@sahildash.dev",
];

let emails = [
    {
        id: 1,
        senderName: "Sahil Dash",
        senderEmail: "sahildash7704@gmail.com",
        subject: "Test Email",
        body: "mypassiscrazy123",
        date: "28-03-2026 11:29:32",
    },
];

let currentOpenId = null;

function getInitials(name) {
    return name.split(" ").map(p => p[0] || "").join("").slice(0, 2).toUpperCase();
}

function formatDate(str) {
    const [datePart, timePart] = str.split(" ");
    const [day, month, year] = datePart.split("-").map(Number);
    const [h, m, s] = timePart.split(":").map(Number);
    const d = new Date(year, month - 1, day, h, m, s);
    const dateLine = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const timeLine = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
    return `${dateLine}<br>at ${timeLine}`;
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
      <p>Waiting for incoming mail…</p>
    </div>`;
}

function renderInbox() {
    if (!emails.length) { renderEmptyInbox(); return; }
    inboxBody.innerHTML = emails.map(m => `
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
        row.addEventListener("click", () => openEmail(Number(row.dataset.id)));
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
    avatarText.textContent = getInitials(m.senderName);
    openDate.innerHTML = formatDate(m.date);

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

async function copyEmail() {
    try {
        await navigator.clipboard.writeText(emailText.textContent.trim());
        copyBtn.classList.add("copied");
        copyIconWrap.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`;
        setTimeout(() => {
            copyBtn.classList.remove("copied");
            copyIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>`;
        }, 1200);
    } catch (e) {
        console.error("Copy failed", e);
    }
}

copyBtn.addEventListener("click", copyEmail);
refreshBtn.addEventListener("click", renderInbox);

changeBtn.addEventListener("click", () => {
    emailText.textContent = addresses[Math.floor(Math.random() * addresses.length)];
    closeEmail();
    renderInbox();
});

deleteBtn.addEventListener("click", () => {
    emailText.textContent = "deleted@sahildash.dev";
    emails = [];
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

renderInbox();