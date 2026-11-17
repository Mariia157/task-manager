/** «Chrome · Windows», «Safari · iPhone» — грубо, но достаточно, чтобы узнать своё устройство в списке. */
export function deviceLabel(ua: string): { name: string; mobile: boolean } {
  if (!ua) return { name: "Пристрій (вхід до оновлення)", mobile: false };
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Яндекс Браузер"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Браузер";
  return { name: os ? `${browser} · ${os}` : browser, mobile: /iPhone|Android|Mobile/.test(ua) };
}
