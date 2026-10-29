type Message = { olusturanId: string };

// Reading a message does not count as a reply. Only the latest sender determines the turn.
export function messageReplyStatus(messages: readonly Message[], userId: string) {
  const last = messages.at(-1);
  if (!last) return null;
  return last.olusturanId === userId ? "Yanıt bekleniyor" : "Yanıtınız bekleniyor";
}

export function pendingMessageNotifications<T extends Message & { id: number }>(
  threads: readonly { id: number; messages: readonly T[] }[], userId: string,
) {
  return threads.flatMap(thread => {
    if (messageReplyStatus(thread.messages, userId) !== "Yanıtınız bekleniyor") return [];
    return [{ ...thread.messages.at(-1)!, etiket: "Yanıtınız bekleniyor", konusmaId: thread.id }];
  });
}
