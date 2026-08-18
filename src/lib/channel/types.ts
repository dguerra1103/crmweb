export type OutboundMessage = {
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "document" | "audio" | "video";
  fileName?: string;
};

export type SendResult = { ok: boolean; externalId?: string; error?: string };

export type ChannelStatus = {
  provider: string;
  label: string;
  connected: boolean;
  qr?: string | null;
  phone?: string | null;
  detail?: string;
  history?: { status: string; progress: number; messages: number; chats: number };
  labels?: number;
};

export type StatusPostInput = {
  text?: string;
  mediaUrl?: string;
  background?: string;
  recipients: string[];
};

export interface ChannelProvider {
  name: string;
  label: string;
  send(message: OutboundMessage): Promise<SendResult>;
  status(): Promise<ChannelStatus>;
  connect(): Promise<{ ok: boolean; detail?: string }>;
  logout(): Promise<{ ok: boolean; detail?: string }>;
  /** Publica un estado de WhatsApp (solo conexión por QR). */
  postStatus(input: StatusPostInput): Promise<{ ok: boolean; recipients?: number; error?: string }>;
  /** Pone o quita una etiqueta de WhatsApp Business a un chat. */
  setChatLabel(input: {
    phone: string;
    labelId: string;
    action: "add" | "remove";
  }): Promise<{ ok: boolean; error?: string }>;
}
