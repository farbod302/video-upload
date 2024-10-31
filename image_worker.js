const fs = require("fs")
const convertToJpeg = require('heic-convert');
const { parentPort, workerData } = require('worker_threads');
const { promisify } = require('util');
const sharp = require('sharp');

const convert = async (path, output_path, type, originalname) => {

    let inputBuffer = await promisify(fs.readFile)(path);
    
    if (originalname.indexOf(".HEIC")>-1 || originalname.indexOf(".heic")>-1 ) {
        console.log("convert");
        const converted = await convertToJpeg({
            buffer: inputBuffer,
            format: "JPEG",
            quality: 1
        })
        inputBuffer = converted
    }


    let quality = 80;
    const maxSizeKB = 300
    while (inputBuffer.length / 1024 > maxSizeKB && quality > 10) {
        inputBuffer = await sharp(inputBuffer)
            .resize({ width: Math.round(1000 * (quality / 20)) }) 
            .jpeg({ quality }) 
            .toBuffer();

        quality -= 5; 
    }
    fs.writeFileSync(output_path, inputBuffer);


}

(async () => {
    try {
        await convert(
            workerData.path, workerData.output_path, workerData.type, workerData.originalname
        );
        parentPort.postMessage({ status: 'done', outputFilePath: workerData.output_path });
    } catch (err) {
        console.log(err);
        parentPort.postMessage({ status: 'error', message: err.message });
    } finally {
        fs.unlink(workerData.path, (err) => { if (err) console.error(err); });
    }
})()