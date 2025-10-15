const fetch = require('node-fetch');

const ALLOWED_HOSTS = ["lite.duckduckgo.com", "duckduckgo.com"];

exports.handler = async function(event, context) {
  try {
    const target = event.queryStringParameters?.url;
    if (!target) return { statusCode: 400, body: "Missing 'url'" };

    const url = decodeURIComponent(target);
    const parsed = new URL(url);

    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return { statusCode: 403, body: "Host not allowed" };
    }

    const method = event.httpMethod || "GET";
    const headers = {};
    const incoming = event.headers || {};

    if (incoming["user-agent"]) headers["user-agent"] = incoming["user-agent"];
    if (incoming["accept"]) headers["accept"] = incoming["accept"];

    let body = null;
    if (event.body) {
      body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body
    });

    const resHeaders = {};
    res.headers.forEach((value, key) => {
      if (!["connection","keep-alive","transfer-encoding","upgrade"].includes(key.toLowerCase())) {
        resHeaders[key] = value;
      }
    });

    const buffer = await res.buffer();
    let content = buffer.toString('utf8');

    // Rewrite links in HTML to stay proxied
    if ((res.headers.get("content-type") || "").includes("text/html")) {
      content = content.replace(
        /href=["'](.*?)["']/gi,
        (match, p1) => {
          try {
            if(p1.startsWith("http")) return `href="/proxy/${encodeURIComponent(p1)}"`;
            return match;
          } catch(e) {
            return match;
          }
        }
      );
      content = content.replace(
        /src=["'](.*?)["']/gi,
        (match, p1) => {
          try {
            if(p1.startsWith("http")) return `src="/proxy/${encodeURIComponent(p1)}"`;
            return match;
          } catch(e) {
            return match;
          }
        }
      );
    }

    const isBinary = !/(text|application\/json|javascript|xml)/i.test(res.headers.get("content-type") || "");

    return {
      statusCode: res.status,
      headers: resHeaders,
      body: isBinary ? buffer.toString('base64') : content,
      isBase64Encoded: isBinary
    };

  } catch (err) {
    return { statusCode: 500, body: `Proxy error: ${err.message}` };
  }
};
