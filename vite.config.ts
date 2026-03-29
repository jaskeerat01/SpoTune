import { defineConfig, type Plugin } from 'vite';
import http from 'http';
import https from 'https';

/**
 * Custom Vite plugin to proxy audio stream URLs.
 * Handles /audiostream?url=<encoded_url> by piping the remote audio through the local server.
 */
function audioStreamProxy(): Plugin {
  return {
    name: 'audio-stream-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/audiostream')) return next();

        const params = new URL(req.url, 'http://localhost').searchParams;
        const targetUrl = params.get('url');
        if (!targetUrl) {
          res.writeHead(400);
          res.end('Missing url parameter');
          return;
        }

        const parsedUrl = new URL(targetUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0',
        };
        if (req.headers.range) {
          headers['Range'] = req.headers.range;
        }

        const proxyReq = client.get(targetUrl, { headers }, (proxyRes) => {
          const fwdHeaders: Record<string, string | string[]> = {};
          for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
            if (proxyRes.headers[key]) {
              fwdHeaders[key] = proxyRes.headers[key] as string;
            }
          }
          res.writeHead(proxyRes.statusCode || 200, fwdHeaders);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(502);
            res.end('Proxy error');
          }
        });

        req.on('close', () => proxyReq.destroy());
      });
    },
  };
}

/**
 * Custom plugin to proxy Invidious/Piped API requests.
 * Tries multiple instances in sequence if one fails.
 */
function invidiousProxy(): Plugin {
  const instances = [
    'https://inv.nadeko.net',
    'https://invidious.nerdvpn.de',
    'https://invidious.jing.rocks',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
  ];

  return {
    name: 'invidious-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/yt-proxy/')) return next();

        const path = req.url.replace(/^\/yt-proxy/, '');

        for (const instance of instances) {
          try {
            const targetUrl = instance + path;
            const result = await new Promise<{ status: number; headers: Record<string, string>; body: string }>((resolve, reject) => {
              const parsedUrl = new URL(targetUrl);
              const client = parsedUrl.protocol === 'https:' ? https : http;
              const proxyReq = client.get(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0',
                  'Accept': 'application/json',
                },
                timeout: 8000,
              }, (proxyRes) => {
                let body = '';
                proxyRes.on('data', (chunk: Buffer) => body += chunk.toString());
                proxyRes.on('end', () => {
                  const h: Record<string, string> = {};
                  if (proxyRes.headers['content-type']) h['content-type'] = proxyRes.headers['content-type'] as string;
                  resolve({ status: proxyRes.statusCode || 500, headers: h, body });
                });
              });
              proxyReq.on('error', reject);
              proxyReq.on('timeout', () => { proxyReq.destroy(); reject(new Error('timeout')); });
            });

            if (result.status >= 200 && result.status < 300) {
              res.writeHead(200, { 'Content-Type': result.headers['content-type'] || 'application/json' });
              res.end(result.body);
              return;
            }
          } catch {
            // try next instance
          }
        }

        res.writeHead(502);
        res.end('All proxy instances failed');
      });
    },
  };
}

export default defineConfig({
  // Relative base so built assets resolve correctly when deployed to a
  // GitHub Pages subdirectory (e.g. https://<user>.github.io/SpoTune/).
  base: './',
  plugins: [audioStreamProxy(), invidiousProxy()],
  server: {
    proxy: {
      '/ytapi': {
        target: 'https://music.youtube.com',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/ytapi/, '/youtubei/v1'),
        headers: {
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/',
        },
      },
      '/lrclib': {
        target: 'https://lrclib.net',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/lrclib/, ''),
      },
    },
  },
});
