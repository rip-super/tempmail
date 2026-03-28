export type Session = {
    address: string,
    ip: string | null,
    allocatedAt: number,
    lastActivity: number,
    publicKey: string
}

export type Email = {
    id: string,
    from: string,
    subject: string,
    body: string,
    receivedAt: string
}