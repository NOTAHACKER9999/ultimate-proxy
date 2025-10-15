import fetch from 'node-fetch';

// List of allowed hostnames for security
const ALLOWED_HOSTS = [
  "lite.duckduckgo.com",
  "duckduckgo.com",
  // add other trusted hosts here
];

export async function handler(event, context) {
  try {
    // Get the target URL from query param "url"
    const target = event.queryStringParameters?.url;
    if (!target) return { statusCode: 400, body: "Missing 'url' query parameter" };

    const url = decodeURIComponent(target);
    const parsed = new URL(url);

    // Check if host is allowed
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return { statusCode: 403, body: "Host not allowed" };
    }

    // Set up request method and headers
    const method = event.httpMethod || "GET";
    const headers = {};
    const incoming = event.headers || {};

    // Forward selected headers (user-agent, accept)
    if (incoming["user-agent"]) headers["user-agent"] = incoming["user-agent"];
    if (incoming["accept"]) headers["accept"] = incoming["accept"];

    // Prepare request body if needed
    let body = null;
    if (event.body) {
      body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    }

    // Fetch the target URL
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });

    // Copy response headers, filtering out hop-by-hop headers
    const resHeaders = {};
    res.headers.forEach((value, key) => {
      if (!["connection","keep-alive","transfer-encoding","upgrade"].includes(key.toLowerCase())) {
        resHeaders[key] = value;
      }
    });

    // Read response as buffer
    const buffer = await res.arrayBuffer();
    const nodeBuf = Buffer.from(buffer);

    // Detect binary response
    const isBinary = !/(text|application\/json|javascript|xml)/i.test(res.headers.get("content-type") || "");

    return {
      statusCode: res.status,
      headers: resHeaders,
      body: isBinary ? nodeBuf.toString('base64') : nodeBuf.toString('utf8'),
      isBase64Encoded: isBinary
    };

  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
      }
