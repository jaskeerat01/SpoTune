import { defineConfig, type Plugin } from 'vite';
import http from 'http';
import https from 'https';

function proxyGet(targetUrl: string, headers: Record<string, string>, onResponse: (proxyRes: http.IncomingMessage) => void, onError: () => void) {
  const parsedUrl = new URL(targetUrl);
  const client = parsedUrl.protocol === 'https:' ? https : http;
  const proxyReq = client.get(targetUrl, { headers }, onResponse);
  proxyReq.on('error', onError);
  return proxyReq;
}

function audioStreamProxy(): Plugin {
  return {
    name: 'audio-stream-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/audiostream')) return next();

        const targetUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
        if (!targetUrl) {
          res.writeHead(400);
          res.end('Missing url parameter');
          return;
        }

        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0',
        };
        if (req.headers.range) headers.Range = String(req.headers.range);

        const proxyReq = proxyGet(
          targetUrl,
          headers,
          (proxyRes) => {
            const fwdHeaders: Record<string, string | string[]> = {};
            for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
              if (proxyRes.headers[key]) fwdHeaders[key] = proxyRes.headers[key] as string;
            }
            res.writeHead(proxyRes.statusCode || 200, fwdHeaders);
            proxyRes.pipe(res);
          },
          () => {
            if (!res.headersSent) {
              res.writeHead(502);
              res.end('Proxy error');
            }
          },
        );

        req.on('close', () => proxyReq.destroy());
      });
    },
  };
}

function imageProxy(): Plugin {
  return {
    name: 'image-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/img-proxy')) return next();

        const targetUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
        if (!targetUrl) {
          res.writeHead(400);
          res.end('Missing url parameter');
          return;
        }

        const proxyReq = proxyGet(
          targetUrl,
          { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0' },
          (proxyRes) => {
            const fwdHeaders: Record<string, string | string[]> = {
              'Cache-Control': 'public, max-age=86400',
            };
            for (const key of ['content-type', 'content-length']) {
              if (proxyRes.headers[key]) fwdHeaders[key] = proxyRes.headers[key] as string;
            }
            res.writeHead(proxyRes.statusCode || 200, fwdHeaders);
            proxyRes.pipe(res);
          },
          () => {
            if (!res.headersSent) {
              res.writeHead(502);
              res.end('Image proxy error');
            }
          },
        );

        req.on('close', () => proxyReq.destroy());
      });
    },
  };
}

function downloadProxy(): Plugin {
  return {
    name: 'download-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/dl-proxy')) return next();

        const params = new URL(req.url, 'http://localhost').searchParams;
        const targetUrl = params.get('url');
        const fileName = params.get('name') || 'audio';
        if (!targetUrl) {
          res.writeHead(400);
          res.end('Missing url parameter');
          return;
        }

        const proxyReq = proxyGet(
          targetUrl,
          { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0' },
          (proxyRes) => {
            const contentType = proxyRes.headers['content-type'] || 'audio/mp4';
            const ext = contentType.includes('webm') ? 'webm' : contentType.includes('ogg') ? 'ogg' : 'm4a';
            const fwdHeaders: Record<string, string> = {
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename="${fileName}.${ext}"`,
            };
            if (proxyRes.headers['content-length']) {
              fwdHeaders['Content-Length'] = proxyRes.headers['content-length'] as string;
            }
            res.writeHead(proxyRes.statusCode || 200, fwdHeaders);
            proxyRes.pipe(res);
          },
          () => {
            if (!res.headersSent) {
              res.writeHead(502);
              res.end('Download proxy error');
            }
          },
        );

        req.on('close', () => proxyReq.destroy());
      });
    },
  };
}

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
            const result = await new Promise<{ status: number; contentType: string; body: string }>((resolve, reject) => {
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
                  resolve({
                    status: proxyRes.statusCode || 500,
                    contentType: String(proxyRes.headers['content-type'] || 'application/json'),
                    body,
                  });
                });
              });
              proxyReq.on('error', reject);
              proxyReq.on('timeout', () => {
                proxyReq.destroy();
                reject(new Error('timeout'));
              });
            });

            if (result.status >= 200 && result.status < 300) {
              res.writeHead(200, { 'Content-Type': result.contentType });
              res.end(result.body);
              return;
            }
          } catch {
            // Try the next public instance.
          }
        }

        res.writeHead(502);
        res.end('All proxy instances failed');
      });
    },
  };
}

export default defineConfig({
  plugins: [
    audioStreamProxy(),
    imageProxy(),
    downloadProxy(),
    invidiousProxy(),
  ],

  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        toplevel: true,
        properties: false,
      },
      format: {
        comments: false,
      },
    },
  },

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
