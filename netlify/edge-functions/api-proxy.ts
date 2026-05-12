/**
 * Netlify Edge Function Proxy
 * This acts exactly like the vite.config.ts proxy, but for production deployment.
 */
import type { Context } from '@netlify/edge-functions';

export default async (request: Request, context: Context) => {
  const url = new URL(request.url);

  try {
    // Proxy for YouTube InnerTube API
    if (url.pathname.startsWith('/ytapi/')) {
      const targetPath = url.pathname.replace(/^\/ytapi/, '/youtubei/v1');
      const targetUrl = `https://music.youtube.com${targetPath}${url.search}`;
      
      const headers = new Headers(request.headers);
      headers.set('Origin', 'https://music.youtube.com');
      headers.set('Referer', 'https://music.youtube.com/');
      headers.delete('Host'); // Netlify automatically sets the correct host

      const init: RequestInit = {
        method: request.method,
        headers,
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.clone().blob();
      }

      const response = await fetch(targetUrl, init);
      const clonedResponse = new Response(response.body, response);
      clonedResponse.headers.set('Access-Control-Allow-Origin', '*');
      return clonedResponse;
    }

    // Proxy for LrcLib API
    if (url.pathname.startsWith('/lrclib/')) {
      const targetPath = url.pathname.replace(/^\/lrclib/, '');
      const targetUrl = `https://lrclib.net${targetPath}${url.search}`;
      
      const headers = new Headers(request.headers);
      headers.delete('Host');

      const init: RequestInit = {
        method: request.method,
        headers,
      };

      const response = await fetch(targetUrl, init);
      const clonedResponse = new Response(response.body, response);
      clonedResponse.headers.set('Access-Control-Allow-Origin', '*');
      return clonedResponse;
    }

    // Multi-instance proxy for YT stream data (Invidious / Piped)
    if (url.pathname.startsWith('/yt-proxy/')) {
      const instances = [
        'https://inv.nadeko.net',
        'https://invidious.nerdvpn.de',
        'https://invidious.jing.rocks',
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.adminforge.de',
      ];
      
      const targetPath = url.pathname.replace(/^\/yt-proxy/, '');
      
      for (const instance of instances) {
        try {
          const targetUrl = `${instance}${targetPath}${url.search}`;
          const init: RequestInit = {
            method: request.method,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0',
              'Accept': 'application/json',
            },
          };
          
          const reqPromise = fetch(targetUrl, init);
          // 8-second timeout abort
          const res = await Promise.race([
            reqPromise,
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
          ]);
          
          if (res.ok) {
            const body = await res.arrayBuffer();
            const clonedResponse = new Response(body, {
              status: res.status,
              headers: {
                'Content-Type': res.headers.get('content-type') || 'application/json',
                'Access-Control-Allow-Origin': '*',
              }
            });
            return clonedResponse;
          }
          console.warn('[yt-proxy] upstream failed', res.status, targetUrl);
        } catch {
          // ignore error and try next instance
        }
      }
      
      return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Audio stream proxy: keeps playback in an <audio> element instead of a video iframe.
    if (url.pathname.startsWith('/audiostream')) {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

      try {
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0',
        };
        const range = request.headers.get('range');
        if (range) headers.Range = range;

        const res = await fetch(targetUrl, { headers });
        if (!res.ok) return new Response('Upstream error', { status: res.status });

        const responseHeaders = new Headers();
        for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
          const value = res.headers.get(key);
          if (value) responseHeaders.set(key, value);
        }
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Cache-Control', 'no-store');

        return new Response(res.body, { status: res.status, headers: responseHeaders });
      } catch {
        return new Response('Audio proxy error', { status: 502 });
      }
    }

    // Audio download proxy - streams remote audio with download headers
    if (url.pathname.startsWith('/dl-proxy')) {
      const targetUrl = url.searchParams.get('url');
      const fileName = url.searchParams.get('name') || 'audio';
      if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0',
          },
        });
        if (!res.ok) return new Response('Upstream error', { status: res.status });

        const contentType = res.headers.get('content-type') || 'audio/mp4';
        const ext = contentType.includes('webm') ? 'webm' : contentType.includes('ogg') ? 'ogg' : 'm4a';
        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}.${ext}"`,
          'Access-Control-Allow-Origin': '*',
        };
        const cl = res.headers.get('content-length');
        if (cl) headers['Content-Length'] = cl;

        return new Response(res.body, { status: 200, headers });
      } catch (e) {
        return new Response('Download proxy error: ' + String(e), { status: 502 });
      }
    }

    // Default passthrough if URL does not match any proxy rule
    return;

  } catch (error) {
    console.error('Edge function proxy error:', error);
    return new Response(String(error), { status: 500 });
  }
};
