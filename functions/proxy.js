const fetch = require('node-fetch');

exports.handler = async function(event) {
  try {
    // Grab target URL from path after /api/proxy/ or /proxy/
    const rawPath = event.path.replace(/^\/(api\/)?proxy\//, '');
    if (!rawPath) return { statusCode: 400, body: "Missing URL" };

    const url = decodeURIComponent(rawPath);

    // Set up headers
    const headers = {};
    const incoming = event.headers || {};
    if (incoming["user-agent"]) headers["user-agent"] = incoming["user-agent"];
    if (incoming["accept"]) headers["accept"] = incoming["accept"];

    // Body handling for POST
    let body = null;
    if (event.body) {
      body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    }

    // Fetch the target
    const res = await fetch(url, {
      method: event.httpMethod || "GET",
      headers,
      body: event.httpMethod === "GET" || event.httpMethod === "HEAD" ? undefined : body
    });

    // Copy headers except forbidden ones
    const resHeaders = {};
    res.headers.forEach((value, key) => {
      if (!["connection","keep-alive","transfer-encoding","upgrade"].includes(key.toLowerCase())) {
        resHeaders[key] = value;
      }
    });

    // Get response content
    let buffer = await res.buffer();
    let content = buffer.toString('utf8');

    // Rewrite links and resources for full-page DuckDuckGo or other sites
    if ((res.headers.get("content-type") || "").includes("text/html")) {
      // Add <base> to fix relative URLs
      content = content.replace(/<head>/i, `<head><base href="${url}">`);

      // Rewrite href, src, and form actions
      content = content.replace(/(href|src|action)=["'](.*?)["']/gi, (match, attr, val) => {
        try {
          if (val.startsWith('http')) return `${attr}="/api/proxy/${encodeURIComponent(val)}"`;
          if (val.startsWith('/')) return `${attr}="/api/proxy/${encodeURIComponent(new URL(val, url).href)}"`;
          return match;
        } catch(e) {
          return match;
        }
      });

      // Optional: remove CSP to avoid blocking scripts
      delete resHeaders['content-security-policy'];
    }

    // Detect if binary
    const isBinary = !/(text|javascript|json|xml)/i.test(res.headers.get('content-type') || '');

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
