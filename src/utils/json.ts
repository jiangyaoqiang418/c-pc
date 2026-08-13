/**
 * JSON.parse 会把超出安全范围的 Long 静默舍入。后端虽约定业务 ID 以
 * 字符串下发，但 Swagger 仍标为 int64；REST 与 WebSocket 统一通过该
 * 方法兜底，避免会话、消息和订单 ID 发生精度丢失。
 */
export function parseJsonPreservingLong<T>(text: string): T {
  let inString = false;
  let escaped = false;
  let normalized = '';

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      normalized += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      normalized += char;
      continue;
    }

    const match = text.slice(index).match(/^-?\d{16,}(?=\s*[,}\]])/);
    if (match) {
      normalized += `"${match[0]}"`;
      index += match[0].length - 1;
      continue;
    }
    normalized += char;
  }

  return JSON.parse(normalized) as T;
}
