import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { spawn } from 'child_process'
import { getNextFileTimestamps, sleep } from './util';

const app = express();
const PORT = 3000;
const PAGE_SIZE = 10;
const DURATION_SEC = 60;
const DURATION_MS = DURATION_SEC * 1000;

app.use(cors());
app.use(morgan('combined'));

app.get('/playlist.m3u8', async (req, res) => {
	const startTime = Number(req.query.startTime); // timestamp from which client wants to begin streaming recorded footage
	const runTime = Number(req.query.runTime ?? 0) * 1000; // current wall-clock time at which client began viewing footage
	const now = Date.now();

	let nextSequenceNumber = Math.round(runTime / DURATION_MS);
	// let nextTimestamp = startTime + (nextSequenceNumber * DURATION_MS);
	let nextFileTimestamps = await getNextFileTimestamps(startTime, nextSequenceNumber + PAGE_SIZE)
	// console.log('going to sleep');
	// await sleep(20_000)
	// console.log('done sleeping');

	let startTimeOffsetSeconds = (startTime - nextFileTimestamps[0]) / 1000

	let playlistTags = [
		'#EXTM3U',
		'#EXT-X-VERSION:7',
		`#EXT-X-TARGETDURATION:${DURATION_SEC}`,
		'#EXT-X-PLAYLIST-TYPE:LIVE',
		// `#EXT-X-MEDIA-SEQUENCE:${nextSequenceNumber}`,
		// `#EXT-X-DISCONTINUITY-SEQUENCE:${nextSequenceNumber}`,
		`#EXT-X-MEDIA-SEQUENCE:0`,
		`#EXT-X-DISCONTINUITY-SEQUENCE:0`,
		nextSequenceNumber === 0 ? `#EXT-X-START:TIME-OFFSET=${startTimeOffsetSeconds},PRECISE=YES` : undefined,
	].filter(Boolean).join('\n')

	let nextMediaSegments = nextFileTimestamps
		.map((fileTimestamp, i) => [
			i > 0 || nextSequenceNumber > 0 ? '#EXT-X-DISCONTINUITY' : undefined,
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(fileTimestamp).toISOString()}`,
			`#EXTINF:${DURATION_SEC}`,
			`${fileTimestamp}.ts`,
		].join('\n')).join('\n')

	let playlist = playlistTags + '\n\n' + nextMediaSegments;

	res.contentType('audio/mpegurl');
	res.send(playlist)
});

app.get('/:recordingTimestamp.ts', async (req, res) => {
	// await sleep(20_000)

	const recordingTimestamp = req.params.recordingTimestamp;

	res.contentType('application/octet-stream')

	let [command, ...args] = `ffmpeg -loglevel error -i files/${recordingTimestamp}.mp4 -codec copy -bsf:v h264_mp4toannexb -f mpegts -`.split(' ')
	let ffmpegProcess = spawn(command, args)

	ffmpegProcess.stdout.pipe(res)

	ffmpegProcess.on('exit', () => {
		res.end();
	})
})

app.use((_req, res) => {
    res.status(404).send('Not Found');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
