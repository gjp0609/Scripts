import Fastify from 'fastify';
import * as cheerio from 'cheerio';

const fastify = Fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname',
                singleLine: true
            }
        }
    }
});

fastify.get('/*', async function handler(request, reply) {
    const url = request.raw.url.substring(1);
    if (url.startsWith('http')) {
        console.log('url:', url);
        {
            const faviconUrl = url + (url.endsWith('/') ? '' : '/') + 'favicon.ico';
            const res = await fetch(faviconUrl);
            console.log(res.status);
            if (res.status === 200) {
                return faviconUrl;
            }
        }
        const html = await (await fetch(url)).text();
        const $ = await cheerio.load(html);
        {
            let links = $('head link').filter((index, item) => item?.attribs?.rel?.includes('shortcut'));
            if (links.length > 0) {
                let href = links[0].attribs?.href;
                if (href) {
                    return new URL(href, url).href;
                }
            }
        }
        {
            let links = $('head link').filter((index, item) => item?.attribs?.rel?.includes('icon'));
            console.log(links);
            if (links.length > 0) {
                let href = links[0].attribs?.href;
                if (href) {
                    return new URL(href, url).href;
                }
            }
        }
        return 'non';
    }
});

try {
    await fastify.listen({ port: 48000 });
} catch (e) {}
