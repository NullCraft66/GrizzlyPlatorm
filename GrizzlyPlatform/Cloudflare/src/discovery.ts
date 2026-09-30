function json(body: unknown): Response {
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getPairingInfo(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  const address = `${origin}/api/`;
  const identity = address.replace(/\/$/, "");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const id = hex(new Uint8Array(digest)).slice(0, 12).toUpperCase();
  const name = env.PUBLIC_HOST_NAME?.trim().slice(0, 80) || "GrizzlyPlatform";
  const qr = `grizzly://pair?address=${encodeURIComponent(address)}&id=${id}`;

  return json({ name, id, address, mdns: "", qr, localNetwork: false });
}

export function getDiscoveryDiagnostics(env: Env): Response {
  return json({
    host: env.PUBLIC_HOST_NAME?.trim().slice(0, 80) || "GrizzlyPlatform",
    api: "online",
    tcpPort: 443,
    discoveryPort: null,
    localNetwork: false,
  });
}
