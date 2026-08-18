import { EventEmitter } from "node:events";

export type CrmEvent = {
  type: "message" | "conversation" | "contact" | "notice";
  conversationId?: string;
  contactId?: string;
  text?: string;
  at?: string;
};

const globalForBus = globalThis as unknown as { crmBus?: EventEmitter };

export const bus =
  globalForBus.crmBus ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    globalForBus.crmBus = emitter;
    return emitter;
  })();

export function publish(event: CrmEvent) {
  bus.emit("crm", { ...event, at: new Date().toISOString() });
}

export function subscribe(listener: (event: CrmEvent) => void) {
  bus.on("crm", listener);
  return () => bus.off("crm", listener);
}
