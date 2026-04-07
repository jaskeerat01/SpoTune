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
  browseId: "FEmusic_home" 
});

const req = https.request('https://music.youtube.com/youtubei/v1/browse?prettyPrint=false', {
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
      const tabs = parsed?.contents?.singleColumnBrowseResultsRenderer?.tabs;
      const sections = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
      console.log("Sections found:", sections?.length || 0);
function bestThumb(thumbnails) {
  if (!thumbnails?.length) return '';
  return thumbnails[thumbnails.length - 1].url;
}
function fixThumbUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}
function parseSong(renderer) {
  try {
    const cols = renderer.flexColumns || [];
    const col0Text = cols?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
    let title = col0Text;
    let artistRuns = cols?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    let albumRuns = cols?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

    if (!title && cols[1]) {
      title = cols?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      artistRuns = cols?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      albumRuns = cols?.[3]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    }

    const id = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId
      || renderer.playlistItemData?.videoId
      || renderer.navigationEndpoint?.watchEndpoint?.videoId;

    if (!id || !title) return null;

    const thumb = fixThumbUrl(bestThumb(renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails));
    return { id, title, thumbnail: thumb };
  } catch(e) {
    return null;
  }
}

      if (sections) {
        sections.forEach((s, idx) => {
           console.log(`[${idx}] Has shelf: ${!!s.musicCarouselShelfRenderer}`);
           if (s.musicCarouselShelfRenderer) {
             const contents = s.musicCarouselShelfRenderer.contents || [];
             console.log(`  Items count: ${contents.length}`);
             if (contents.length > 0) {
                if (contents[0].musicResponsiveListItemRenderer) {
                   const parsed = parseSong(contents[0].musicResponsiveListItemRenderer);
                   console.log(`   ParseSong test:`, parsed);
                }
             }
           }
        });
      } else {
        console.log("Error finding sections in response. Keys:", Object.keys(parsed));
      }
    } catch(e) {
      console.log('Error parsing JSON', e);
    }
  });
});

req.on('error', console.error);
req.write(data);
req.end();
