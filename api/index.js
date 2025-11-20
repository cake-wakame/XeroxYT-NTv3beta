import express from "express";
import { Innertube } from "youtubei.js";

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 動画詳細 API (/api/video)
app.get('/api/video', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing video id" });

    const info = await youtube.getInfo(id);

    // 関連動画を集約するための配列
    // 初期ロード分の動画を追加
    let relatedVideos = [];
    
    // watch_next_feedがメインの関連動画ソース
    if (info.watch_next_feed && Array.isArray(info.watch_next_feed)) {
        relatedVideos.push(...info.watch_next_feed);
    }
    // secondary_infoにも含まれる場合がある
    if (info.secondary_info?.watch_next_feed && Array.isArray(info.secondary_info.watch_next_feed)) {
        relatedVideos.push(...info.secondary_info.watch_next_feed);
    }

    // 重複排除用のセット
    const seenIds = new Set();
    // 初期データの重複排除とID保存
    relatedVideos = relatedVideos.filter(v => {
        const vid = v.id || v.videoId;
        if (vid && !seenIds.has(vid)) {
            seenIds.add(vid);
            return true;
        }
        return false;
    });

    // 50件になるまでContinuation（次のページの読み込み）を実行
    const MAX_VIDEOS = 50;
    let currentInfo = info;
    let continuationCount = 0;

    while (relatedVideos.length < MAX_VIDEOS && continuationCount < 5) {
        try {
            // getWatchNextContinuationで次のバッチを取得
            const nextInfo = await currentInfo.getWatchNextContinuation();
            
            if (!nextInfo) break;
            currentInfo = nextInfo; // 次のループのために参照を更新

            const newItems = nextInfo.watch_next_feed || [];
            if (newItems.length === 0) break;

            let addedCount = 0;
            for (const item of newItems) {
                if (relatedVideos.length >= MAX_VIDEOS) break;

                const vid = item.id || item.videoId;
                // IDがあり、かつ未登録のものだけ追加
                // 動画以外の要素（プレイリストカードなど）が混ざる場合があるので、タイトルかIDがあるものを簡易チェック
                if (vid && !seenIds.has(vid) && (item.type === 'CompactVideo' || item.type === 'Video' || item.title)) {
                    seenIds.add(vid);
                    relatedVideos.push(item);
                    addedCount++;
                }
            }
            
            // 新しい動画が一つも追加されなかったら終了（無限ループ防止）
            if (addedCount === 0) break;

        } catch (e) {
            // Continuationがない、またはエラーの場合はループを抜ける
            // console.log('Continuation fetch ended:', e.message);
            break;
        }
        continuationCount++;
    }

    // 重要: youtubei.jsのオブジェクトはクラスインスタンスであり、
    // res.json(info)でシリアライズする際に、手動で代入したプロパティ(info.watch_next_feed = ...)が
    // 無視される場合があるため、一度プレーンなJSONオブジェクトに変換してからデータを上書きする。
    const responseObj = JSON.parse(JSON.stringify(info));
    
    // 集約した動画リストで上書き
    responseObj.watch_next_feed = relatedVideos;
    
    // フロントエンドが迷わないように、他の関連動画ソースは空にする
    if (responseObj.secondary_info) {
        responseObj.secondary_info.watch_next_feed = [];
    }
    responseObj.related_videos = [];

    res.status(200).json(responseObj);
    
  } catch (err) {
    console.error('Error in /api/video:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { q: query, limit = '50' } = req.query;
    if (!query) return res.status(400).json({ error: "Missing search query" });
    const limitNumber = parseInt(limit);
    let search = await youtube.search(query, { type: "video" });
    let videos = search.videos || [];
    while (videos.length < limitNumber && search.has_continuation) {
        search = await search.getContinuation();
        videos = videos.concat(search.videos);
    }
    res.status(200).json(videos.slice(0, limitNumber));
  } catch (err) { console.error('Error in /api/search:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/comments', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing video id" });
    const limit = 300;
    let commentsSection = await youtube.getComments(id);
    let allComments = commentsSection.contents || [];
    while (allComments.length < limit && commentsSection.has_continuation) {
      commentsSection = await commentsSection.getContinuation();
      allComments = allComments.concat(commentsSection.contents);
    }
    res.status(200).json({
      comments: allComments.slice(0, limit).map(c => ({
        text: c.comment?.content?.text ?? null, comment_id: c.comment?.comment_id ?? null, published_time: c.comment?.published_time ?? null,
        author: { id: c.comment?.author?.id ?? null, name: c.comment?.author?.name ?? null, thumbnails: c.comment?.author?.thumbnails ?? [] },
        like_count: c.comment?.like_count?.toString() ?? '0', reply_count: c.comment?.reply_count?.toString() ?? '0', is_pinned: c.comment?.is_pinned ?? false
      }))
    });
  } catch (err) { console.error('Error in /api/comments:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/channel', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { id, page = '1' } = req.query;
    if (!id) return res.status(400).json({ error: "Missing channel id" });
    const channel = await youtube.getChannel(id);
    let videosFeed = await channel.getVideos();
    for (let i = 1; i < parseInt(page); i++) {
      if (videosFeed.has_continuation) {
        videosFeed = await videosFeed.getContinuation();
      } else {
        videosFeed.videos = [];
        break;
      }
    }
    res.status(200).json({
      channel: {
        id: channel.id, name: channel.metadata?.title || null, description: channel.metadata?.description || null,
        avatar: channel.metadata?.avatar || null, banner: channel.metadata?.banner || null,
        subscriberCount: channel.metadata?.subscriber_count?.pretty || '非公開', videoCount: channel.metadata?.videos_count?.text ?? channel.metadata?.videos_count ?? '0'
      },
      page: parseInt(page), videos: videosFeed.videos || []
    });
  } catch (err) { console.error('Error in /api/channel:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/channel-shorts', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing channel id" });
    const channel = await youtube.getChannel(id);
    const shorts = await channel.getShorts();
    res.status(200).json(shorts.videos);
  } catch (err) { console.error('Error in /api/channel-shorts:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/channel-playlists', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing channel id" });
    const channel = await youtube.getChannel(id);
    const playlists = await channel.getPlaylists();
    res.status(200).json(playlists);
  } catch (err) { console.error('Error in /api/channel-playlists:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/playlist', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const { id: playlistId } = req.query;
    if (!playlistId) return res.status(400).json({ error: "Missing playlist id" });
    const playlist = await youtube.getPlaylist(playlistId);
    if (!playlist.info?.id) return res.status(404).json({ error: "Playlist not found"});
    res.status(200).json(playlist);
  } catch (err) { console.error('Error in /api/playlist:', err); res.status(500).json({ error: err.message }); }
});
app.get('/api/fvideo', async (req, res) => {
  try {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const trending = await youtube.getTrending("Music");
    res.status(200).json(trending);
  } catch (err) { console.error('Error in /api/fvideo:', err); res.status(500).json({ error: err.message }); }
});

export default app;