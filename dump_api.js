import https from 'https';

const WEB_REMIX = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20250310.01.00',
  clientId: '67',
};

const data = JSON.stringify({
  context: {
    client: {
      clientName: WEB_REMIX.clientName,
      clientVersion: WEB_REMIX.clientVersion,
      gl: 'US',
      hl: 'en',
    }
  },
  browseId: "VLPL4fGSI1pR0nHTZHIW2Gk55uP-h9QxQ7O4" // Some known YT music playlist ID or generic one
});

const req = https.request('https://music.youtube.com/youtubei/v1/browse?key=QUITE_POSSIBLY_NOT_NEEDED_BUT_API_KEY_MAYBE', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Format-Version': '1',
    'X-YouTube-Client-Name': WEB_REMIX.clientId,
    'X-YouTube-Client-Version': WEB_REMIX.clientVersion,
  }
}, (res) => {
  let chunks = [];
  res.on('data', d => chunks.push(d));
  res.on('end', () => {
    let body = Buffer.concat(chunks).toString();
    try {
      let parsed = JSON.parse(body);
      const fs = require('fs');
      fs.writeFileSync('./browse_dump.json', JSON.stringify(parsed, null, 2));
      console.log('Success, wrote dump to browse_dump.json');
    } catch(e) {
      console.log('Error parsing JSON');
    }
  });
});

req.on('error', console.error);
req.write(data);
req.end();
