import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { exec, spawn } from 'child_process'
import { readdir } from 'fs'
import { promisify } from 'util'

const readdirP = promisify(readdir)

const app = express();
const PORT = 3000;
const PAGE_SIZE = 5;
const DURATION = 60;

app.use(cors());
app.use(morgan('combined'));

app.get('/playlist.m3u8', async (req, res) => {
	const playFrom = Number(req.query.playFrom); // timestamp from which client wants to begin streaming recorded footage
	const startTime = Number(req.query.startTime); // current wall-clock time at which client began viewing footage
	const now = Date.now();

	let nextSequenceNumber = Math.round((now - startTime) / 1000 / 60);
	let nextFileTimestamps = await getNextFileTimestamps(playFrom, nextSequenceNumber, PAGE_SIZE)
	let startTimeOffsetSeconds = (playFrom - nextFileTimestamps[0]) / 1000

	let playlistTags = [
		'#EXTM3U',
		'#EXT-X-VERSION:7',
		`#EXT-X-TARGETDURATION:${DURATION}`,
		'#EXT-X-PLAYLIST-TYPE:LIVE',
		`#EXT-X-MEDIA-SEQUENCE:${nextSequenceNumber}`,
		`#EXT-X-DISCONTINUITY-SEQUENCE:${nextSequenceNumber}`,
		nextSequenceNumber === 0 ? `#EXT-X-START:TIME-OFFSET=${startTimeOffsetSeconds},PRECISE=YES` : undefined,
	].filter(Boolean).join('\n')

	let nextMediaSegments = nextFileTimestamps
		.map((fileTimestamp, i) => [
			i > 0 || nextSequenceNumber > 0 ? '#EXT-X-DISCONTINUITY' : undefined,
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(fileTimestamp).toISOString()}`,
			'#EXTINF:60',
			`${fileTimestamp}.ts`,
		].join('\n')).join('\n')

	let playlist = playlistTags + '\n\n' + nextMediaSegments;

	res.contentType('audio/mpegurl');
	res.send(playlist)
});

async function getNextFileTimestamps(timestamp: number, offset: number, pageSize: number) {
	return readdirP('files')
		.then(files => files.map(f => Number(f.replace('.mp4', ''))).sort())
		.then(timestamps => {
			let nextTimestampIndex = timestamps.findIndex(ts => ts >= timestamp);

			if (nextTimestampIndex === -1) {
				return []
			}

			let firstTimestampIndex = timestamp === timestamps[nextTimestampIndex]
				? nextTimestampIndex
				: nextTimestampIndex > 0
					? nextTimestampIndex - 1
					: nextTimestampIndex;
			firstTimestampIndex += offset;

			return timestamps.slice(firstTimestampIndex, firstTimestampIndex + pageSize);
		})
}

app.get('/:recordingTimestamp.ts', (req, res) => {
	const recordingTimestamp = req.params.recordingTimestamp;

	res.contentType('application/octet-stream')

	let [command, ...args] = `ffmpeg -loglevel error -i files/${recordingTimestamp}.mp4 -codec copy -bsf:v h264_mp4toannexb -f mpegts -`.split(' ')
	let ffmpegProcess = spawn(command, args)

	ffmpegProcess.stdout.pipe(res)

	ffmpegProcess.on('exit', () => {
		res.end();
	})
})

app.use((req, res) => {
    res.status(404).send('Not Found');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
