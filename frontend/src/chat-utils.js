/** 对话界面用到的纯函数：相对时间与语音转写拼接，独立出来便于单测。 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 历史列表里的相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / N 个月前 / N 年前。 */
export function formatRelativeTime(value, now = Date.now()) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const diff = now - time;
  if (diff < 0) return '刚刚';
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  if (diff < 365 * DAY) return `${Math.floor(diff / (30 * DAY))} 个月前`;
  return `${Math.floor(diff / (365 * DAY))} 年前`;
}

const ASCII_WORD = /[A-Za-z0-9]$/;

/** 把一段转写接在已有输入后面：中文直接相连，英文单词之间补一个空格。 */
export function mergeTranscript(current, addition) {
  const base = typeof current === 'string' ? current : '';
  const text = typeof addition === 'string' ? addition : '';
  if (!text.trim()) return base;
  if (!base) return text;
  if (/\s$/.test(base) || /^\s/.test(text)) return base + text;
  return ASCII_WORD.test(base) && /^[A-Za-z0-9]/.test(text) ? `${base} ${text}` : base + text;
}
