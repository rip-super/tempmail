export type Session = {
    address: string,
    ip: string | null,
    allocatedAt: number,
    lastActivity: number,
    publicKey: JsonWebKey,
}

export interface Payload {
    encryptedKey: string,
    iv: string,
    ciphertext: string,
}

export type Email = {
    id: string,
    senderName: Payload,
    senderEmail: Payload,
    subject: Payload,
    body: Payload,
    bodyHtml?: Payload,
    receivedAt: number,
}