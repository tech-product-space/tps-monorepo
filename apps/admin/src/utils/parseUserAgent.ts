export function parseUserAgent(ua: string): string {
  if (!ua) return "Unknown User Agent";

  const readable: string[] = [];

  // ============================
  // OS Detection
  // ============================
  const androidMatch = ua.match(/Android\s([\d.]+)/i);
  const windowsMatch = ua.match(/Windows NT\s([\d.]+)/i);
  const macMatch = ua.match(/Mac OS X\s([\d_]+)/i);
  const iosMatch = ua.match(/CPU (iPhone )?OS\s([\d_]+)/i);

  if (androidMatch) {
    readable.push(`OS: Android ${androidMatch[1]}`);
  } else if (iosMatch) {
    readable.push(`OS: iOS ${iosMatch[2].replace(/_/g, ".")}`);
  } else if (macMatch) {
    readable.push(`OS: macOS ${macMatch[1].replace(/_/g, ".")}`);
  } else if (windowsMatch) {
    readable.push(`OS: Windows ${windowsMatch[1]}`);
  } else {
    readable.push("OS: Unknown");
  }

  // ============================
  // Device Type
  // ============================
  if (/Mobile/i.test(ua)) readable.push("Device Type: Mobile");
  else if (/Tablet/i.test(ua)) readable.push("Device Type: Tablet");
  else readable.push("Device Type: Desktop");

  // ============================
  // Device Brand Detection
  // (Basic extraction from Android UA)
  // ============================
  const deviceModelMatch = ua.match(/Android.*?;\s([^;]+)\)/i);
  if (deviceModelMatch) {
    readable.push(`Device Model: ${deviceModelMatch[1].trim()}`);
  }

  // ============================
  // Architecture
  // ============================
  if (/x86_64|Win64|x64/i.test(ua)) readable.push("Architecture: 64-bit");
  if (/arm|aarch64/i.test(ua)) readable.push("Architecture: ARM");

  // ============================
  // Browser Detection
  // ============================
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/i);
  const firefoxMatch = ua.match(/Firefox\/([\d.]+)/i);
  const edgeMatch = ua.match(/Edg\/([\d.]+)/i);
  const safariMatch = ua.match(/Version\/([\d.]+).*Safari/i);

  if (edgeMatch) {
    readable.push(`Browser: Edge ${edgeMatch[1].split(".")[0]}`);
  } else if (chromeMatch) {
    readable.push(`Browser: Chrome ${chromeMatch[1].split(".")[0]}`);
  } else if (firefoxMatch) {
    readable.push(`Browser: Firefox ${firefoxMatch[1].split(".")[0]}`);
  } else if (safariMatch) {
    readable.push(`Browser: Safari ${safariMatch[1].split(".")[0]}`);
  } else {
    readable.push("Browser: Unknown");
  }

  // ============================
  // Rendering Engine
  // ============================
  if (/AppleWebKit/i.test(ua)) readable.push("Engine: WebKit");
  if (/Gecko/i.test(ua) && !/like Gecko/i.test(ua)) readable.push("Engine: Gecko");
  if (/Blink/i.test(ua)) readable.push("Engine: Blink");

  return readable.join(" · ");
}
