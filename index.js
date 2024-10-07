const express = require("express")
const bodyParser = require("body-parser")
const app = express()
app.use(bodyParser.urlencoded({ limit: "1024mb", extended: true }))
app.use(bodyParser.json({ extended: true }))
const fs = require("fs")

const https = require("https")
const http = require("http")
// const conf = {
//     key: fs.readFileSync("/etc/letsencrypt/live/nutrostyle.nutrosal.com/privkey.pem"),
//     cert: fs.readFileSync("/etc/letsencrypt/live/nutrostyle.nutrosal.com/fullchain.pem")
// }
// const server = https.createServer(conf, app)
const server = http.createServer(app)
server.listen("4010")
const { uid } = require("uid")
const { Worker } = require('worker_threads');
const multer = require("multer")
app.use("/videos", express.static("./videos"))
app.post("/create_folder", (req, res) => {
    const { name } = req.body
    try {
        if (!fs.existsSync(`${__dirname}/videos/${name}`)) {
            fs.mkdirSync(`${__dirname}/videos/${name}`);
            res.json({ status: true })
        } else {
            res.json({ status: false, msg: "Already exist" })
        }
    } catch (err) {
        res.json({ status: false })
    }
})

app.get("/get_folders", (req, res) => {
    const folders = fs.readdirSync(`${__dirname}/videos`)
    res.json({ status: true, folders })
})


const upload = multer({ dest: `${__dirname}/temp` })

app.post("/upload", upload.single("video"), (req, res) => {
    if (!req.file) {
        res.json({
            status: false, msg: "Invalid params"
        })
    }

    const input = req.file
    const { folder, name } = req.body
    const id = uid(8)
    const output_path = `${__dirname}/videos/${folder || "default"}/${id}.mp4`
    const { path } = input
    const to_add = {
        id,
        input_path: path,
        output_path,
        status: "queue",
        percent: 0,
        name,
        folder: folder || "default"

    }
    const json_str = fs.readFileSync(`${__dirname}/videos.json`)
    const json = JSON.parse(json_str.toString())
    json.push(to_add)
    fs.writeFileSync(`${__dirname}/videos.json`, JSON.stringify(json))
    run_queue()
    res.json({ status: true, msg: "Added to queue" })

})

const run_queue = () => {
    const json_str = fs.readFileSync(`${__dirname}/videos.json`)
    const json = JSON.parse(json_str.toString())
    const is_progress = json.some(e => e.status === "in_progress")
    if (is_progress) return
    const progress = json.find(e => e.status === "queue")
    if (!progress) return
    const index = json.findIndex(e => e.status === "queue")
    json[index].status = "in_progress"
    fs.writeFileSync(`${__dirname}/videos.json`, JSON.stringify(json))
    const { input_path, output_path, id } = progress
    const worker = new Worker("./worker.js", { workerData: { inputFilePath: input_path, outputFilePath: output_path, id } })
    worker.on("message", async (msg) => {
        const { status } = msg
        if (status === "error") {
            const json_str = fs.readFileSync(`${__dirname}/videos.json`)
            const json = JSON.parse(json_str.toString())
            const index = json.findIndex(e => e.id === id)
            json[index].status = "failed"
            fs.writeFileSync(`${__dirname}/videos.json`, JSON.stringify(json))
            run_queue()
            return
        }
        const json_str = fs.readFileSync(`${__dirname}/videos.json`)
        const json = JSON.parse(json_str.toString())
        const index = json.findIndex(e => e.id === id)
        json[index].status = "complete"
        fs.writeFileSync(`${__dirname}/videos.json`, JSON.stringify(json))
        run_queue()
        return status === "done"
    })

}

app.get("/status", (req, res) => {
    const json_str = fs.readFileSync(`${__dirname}/videos.json`)
    const json = JSON.parse(json_str.toString())
    res.json(json)
})