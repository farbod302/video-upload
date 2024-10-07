const { parentPort, workerData } = require('worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);
const logo = `${__dirname}/logo.png`
function convertAndCompress(inputFilePath, outputFilePath, id) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputFilePath)
            .input(logo)
            .complexFilter([
                {
                    filter: "overlay",
                    options: { x: 20, y: 'main_h - overlay_h - 20' }
                }
            ])
            .videoCodec('libx264')
            .format('mp4')
            .outputOptions('-preset fast')
            .outputOptions('-crf 28')
            .on('end', () => {
                resolve(outputFilePath);
            })
            .on('error', (err) => {
                reject(err);
            })
            .on("progress", (e) => {
                const json_str = fs.readFileSync(`${__dirname}/videos.json`)
                const json = JSON.parse(json_str.toString())
                const index = json.findIndex(e => e.id === id)
                json[index].percent = Math.floor(e.percent)
                fs.writeFileSync(`${__dirname}/videos.json`, JSON.stringify(json))
            })
            .save(outputFilePath);
    });
}

(async () => {
    try {
        await convertAndCompress(workerData.inputFilePath, workerData.outputFilePath, workerData.id);
        parentPort.postMessage({ status: 'done', outputFilePath: workerData.outputFilePath });
    } catch (err) {
        parentPort.postMessage({ status: 'error', message: err.message });
    } finally {
        fs.unlink(workerData.inputFilePath, (err) => { if (err) console.error(err); });
    }
})();