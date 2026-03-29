export type Session = {
    address: string,
    ip: string | null,
    allocatedAt: number,
    lastActivity: number,
    publicKey: string
}

export type Email = {
    id: string;
    senderName: string;
    senderEmail: string;
    subject: string;
    body: string;
    receivedAt: number;
}