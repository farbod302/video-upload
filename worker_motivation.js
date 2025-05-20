const { parentPort, workerData } = require('worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);
function convertAndCompress(inputFilePath, outputFilePath, start, end) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputFilePath)
            .setStartTime(+start)
            .setDuration(+end - +start)
            .videoCodec('libx264')
            .format('mp4')
            .outputOptions('-preset fast')
            .outputOptions('-crf 32')
            .on('end', () => {
                resolve(outputFilePath);
            })
            .on('error', (err) => {
                reject(err);
            })
            .save(outputFilePath);
    });
}

(async () => {
    try {
        await convertAndCompress(workerData.inputFilePath, workerData.outputFilePath, workerData.start, workerData.end);
        parentPort.postMessage({ status: 'done', outputFilePath: workerData.outputFilePath });
    } catch (err) {
        parentPort.postMessage({ status: 'error', message: err.message });
    } finally {
        fs.unlink(workerData.inputFilePath, (err) => { if (err) console.error(err); });
    }
})();