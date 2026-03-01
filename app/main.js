import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const PAGE_PATH = path.join(__dirname, '/static/page.html');

import { runShortTripMain } from './shortTrip.js';

function runShortTrip(from, to, arriveBy) {
    return runShortTripMain(from, to, arriveBy);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

function lineToStyledHTML(line) {
    // Extract the transport type and number before " Richtung"
    const richtungMatch = line.match(/^(.+?)(<div>.*<\/div>)?$/);
    const transportPart = richtungMatch ? richtungMatch[1] : line;
    const directionPart = richtungMatch && richtungMatch[2] ? richtungMatch[2] : '';

    if (transportPart.startsWith('Bus ')) {
        const number = transportPart.slice(4);
        return '<div class="o-transport-icon o-transport-icon--16 o-transport-icon--buses"><div class="o-transport-icon__number">' + number + '</div></div>' + directionPart;
    }

    if (transportPart.startsWith('S')) {
        const number = transportPart.slice(1);
        return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--s${number}"><div class="o-transport-icon__number">S${number}</div></div>${directionPart}`;
    }

    if (transportPart.startsWith('U')) {
        const number = transportPart.slice(1);
        return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--u${number}"><div class="o-transport-icon__number">U${number}</div></div>${directionPart}`;
    }

    if (transportPart.startsWith('X')) {
        const number = transportPart.slice(1);
        return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--xpressbus"><div class="o-transport-icon__number">X${number}</div></div>${directionPart}`;
    }

    if (transportPart.startsWith('Fäh ')) {
        const number = transportPart.slice(4);
        return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--ship"><div class="o-transport-icon__number">${number}</div></div>${directionPart}`;
    }

    if (transportPart.startsWith('RB')) {
        const number = transportPart.slice(2);
        return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--rerb o-transport-icon--transparent"><div class="o-transport-icon__number">RB${number}</div></div>${directionPart}`;
    }

    if (transportPart.startsWith('RE')) {
        const number = transportPart.slice(2);
        return `<div class="o-transport-icon o-transport-icon--16 o-transport-icon--rerb o-transport-icon--transparent"><div class="o-transport-icon__number">RE${number}</div></div>${directionPart}`;
    }
    
    return line;
};

function renderRows(steps) {
    let html = '<div class="schedule">';
    
    for (const step of steps) {
        const depTime = step.depTime.slice(0, 2) + ':' + step.depTime.slice(2, 4);
        let line = step.dir ? `${step.line}<div>${escapeHtml(step.dir)}</div>` : step.line;

        const rowClass = line == "WALK" && !!step.graphic ? "walk-row" : "";
        let walk1 = "";
        let walk2 = "";
    
        if (line == "WALK") {
            distanceString = step.distanceInMeters ? ` ${step.distanceInMeters} m` : '';
            line = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M320 144C350.9 144 376 118.9 376 88C376 57.1 350.9 32 320 32C289.1 32 264 57.1 264 88C264 118.9 289.1 144 320 144zM233.4 291.9L256 269.3L256 338.6C256 366.6 268.2 393.3 289.5 411.5L360.9 472.7C366.8 477.8 370.7 484.8 371.8 492.5L384.4 580.6C386.9 598.1 403.1 610.3 420.6 607.8C438.1 605.3 450.3 589.1 447.8 571.6L435.2 483.5C431.9 460.4 420.3 439.4 402.6 424.2L368.1 394.6L368.1 279.4L371.9 284.1C390.1 306.9 417.7 320.1 446.9 320.1L480.1 320.1C497.8 320.1 512.1 305.8 512.1 288.1C512.1 270.4 497.8 256.1 480.1 256.1L446.9 256.1C437.2 256.1 428 251.7 421.9 244.1L404 221.7C381 192.9 346.1 176.1 309.2 176.1C277 176.1 246.1 188.9 223.4 211.7L188.1 246.6C170.1 264.6 160 289 160 314.5L160 352C160 369.7 174.3 384 192 384C209.7 384 224 369.7 224 352L224 314.5C224 306 227.4 297.9 233.4 291.9zM245.8 471.3C244.3 476.5 241.5 481.3 237.7 485.1L169.4 553.4C156.9 565.9 156.9 586.2 169.4 598.7C181.9 611.2 202.2 611.2 214.7 598.7L283 530.4C294.5 518.9 302.9 504.6 307.4 488.9L309.6 481.3L263.6 441.9C261.1 439.7 258.6 437.5 256.2 435.1L245.8 471.3z"/></svg>${distanceString}`;
            walk1 = '(1) ';
            walk2 = '(2) ';
        }
        
        html += `
            <div class="${rowClass}">${depTime}</div>
            <div class="${rowClass}">${walk1}${escapeHtml(step.depName)}</div>
            <div class="${rowClass}">${lineToStyledHTML(line)}</div>
            <div class="${rowClass}">${walk2}${escapeHtml(step.arrName)}</div>`;
        
        if (step.graphic) {
            html += `<div class="image-row"><img src="${step.graphic}" alt="route" /></div>`;
        }
    }
    
    html += '</div>';
    return html;
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = decodeURIComponent(url.pathname);
        const staticRoot = path.join(__dirname, 'static');

        const passphrase = url.searchParams.get('passphrase');
        if (
            pathname === '/' &&
            (!passphrase || !process.env.PASSPHRASE || 
            !crypto.timingSafeEqual(Buffer.from(passphrase), Buffer.from(process.env.PASSPHRASE)))
        ) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
        }

        // Serve files under /static/*
        if (req.method === 'GET' && pathname.startsWith('/static/')) {
            const rel = pathname.slice('/static/'.length);
            const filePath = path.normalize(path.join(staticRoot, rel));

            if (!filePath.startsWith(staticRoot + path.sep)) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }

            try {
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    res.statusCode = 404;
                    res.end('Not Found');
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                const types = {
                    '.html': 'text/html; charset=utf-8',
                    '.css': 'text/css; charset=utf-8',
                    '.js': 'application/javascript; charset=utf-8',
                    '.json': 'application/json; charset=utf-8',
                    '.svg': 'image/svg+xml',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.ico': 'image/x-icon',
                    '.txt': 'text/plain; charset=utf-8',
                    '.map': 'application/json',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                };
                res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
                res.end(await fs.readFile(filePath));
            } catch {
                res.statusCode = 404;
                res.end('Not Found');
            }
            return;
        }

        // Dynamic page at /
        if (req.method !== 'GET' || pathname !== '/') {
            res.statusCode = 404;
            res.end('Not Found');
            return;
        }

        // fetch from query params if provided, otherwise use defaults
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const arriveBy = url.searchParams.get('arriveBy');
        const rs = runShortTrip(from, to, arriveBy);
        const [html, data] = await Promise.all([fs.readFile(PAGE_PATH, 'utf8'), rs]);
        const rows = renderRows(Array.isArray(data) ? data : [data]);

        const lastArrTime = data[data.length - 1].arrTime;
        const firstDepTime = data[0].depTime;

        const arrDate = new Date(arriveBy);
        arrDate.setHours(parseInt(lastArrTime.slice(0, 2), 10));
        arrDate.setMinutes(parseInt(lastArrTime.slice(2, 4), 10));
        arrDate.setSeconds(parseInt(lastArrTime.slice(4, 6), 10));
        const formattedArrDate = new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' }).format(arrDate);
        const depDate = new Date(arriveBy);
        depDate.setHours(parseInt(firstDepTime.slice(0, 2), 10));
        depDate.setMinutes(parseInt(firstDepTime.slice(2, 4), 10));
        depDate.setSeconds(parseInt(firstDepTime.slice(4, 6), 10));
        const travelTime = new Date(arrDate - depDate);
        const hours = Math.floor(travelTime / (1000 * 60 * 60));
        const minutes = Math.round((travelTime % (1000 * 60 * 60)) / (1000 * 60));
        const formattedTravelTimeDiff = hours == 0 ? `${minutes} Minuten` : `${hours}:${minutes} Stunde${hours > 1 ? 'n' : ''}`;
        const output = html.replace("{{ instructions }}", rows)
                           .replace("{{ to }}", to)
                           .replace("{{ tourname }}", url.searchParams.get('tourname'))
                           .replace("{{ date }}", new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(arriveBy)))
                           .replace("{{ dayRelative }}", Math.round((new Date(arriveBy) - new Date('2026-12-26T00:00:00')) / (1000 * 60 * 60 * 24)))
                           .replace("{{ travelTime }}", formattedTravelTimeDiff)
                           .replace("{{ arrivalTime }}", formattedArrDate);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(output);
    } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(`Error: ${err.message}`);
    }
});

server.listen(PORT, () => {
    console.log(__dirname);
    console.log(`Server running at http://localhost:${PORT}`);
});