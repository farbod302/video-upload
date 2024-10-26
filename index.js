const express = require("express")
const bodyParser = require("body-parser")
const app = express()
const cors = require("cors")
app.use(bodyParser.urlencoded({ limit: "1024mb", extended: true }))
app.use(bodyParser.json({ extended: true }))
app.use(cors())
const fs = require("fs")

app.use((req, res, next) => {
    const referer = req.headers.referer
    const accepted_refs = ["http://localhost:5173/", "https://style.nutrosal.com/", "https://nutrosalfront.netlify.app/"]
    if (!accepted_refs.includes(referer)) {
        res.send("access deny")
        return
    }
    next()
})

const https = require("https")
// const http = require("http")
const conf = {
    key: fs.readFileSync("/etc/letsencrypt/live/nutrostyle.nutrosal.com/privkey.pem"),
    cert: fs.readFileSync("/etc/letsencrypt/live/nutrostyle.nutrosal.com/fullchain.pem")
}
const server = https.createServer(conf, app)
// const server = http.createServer(app)
server.listen("4010")
const { uid } = require("uid")
const { Worker } = require('worker_threads');
const multer = require("multer")
const _packages_sessions = require("./packagesMap")
const { default: axios } = require("axios")
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

app.get("/open/:package/:session/:episode", (req, res) => {

    const dest = req.headers["sec-fetch-dest"]
    const referer = req.headers.referer
    const accepted_refs = ["http://localhost:5173/", "https://style.nutrosal.com/", "https://nutrosalfront.netlify.app/"]
    if (dest !== "video" && !accepted_refs.includes(referer)) {
        res.send("Access deny")
        return
    }
    const { package, session, episode } = req.params
    const vid = _packages_sessions[package].videos[session].episodes[episode].url
    res.redirect(vid)

})

app.delete("/delete/:id", (req, res) => {
    const json_str = fs.readFileSync(`${__dirname}/videos.json`)
    const json = JSON.parse(json_str.toString())
    const { id } = req.params
    const selected = json.find(e => e.id === id)
    if (!selected) {
        res.json({
            status: false,
            msg: "Not Fond"
        })
        return
    }
    const { folder } = selected
    fs.unlinkSync(`${__dirname}/videos/${folder}/${id}.mp4`)
    const new_json = json.filter(e => e.id !== id)
    fs.writeFileSync(`${__dirname}/videos.json`, JSON.stringify(new_json))
    res.json({ status: true })
})


app.post("/motivation", upload.single("video"), (req, res) => {
    const { path } = req.file
    console.log(req.file);
    const { start, end, user_id, token } = req.body
    const id = uid(6)
    const output_path = `${__dirname}/motivations/${id}.mp4`
    const worker = new Worker("./worker_motivation.js", { workerData: { inputFilePath: path, outputFilePath: output_path, start, end } })
    worker.on("message", async (msg) => {
        const { status } = msg
        if (status === "error") {
            res.json({ status: false })
            return
        } else {
            const output = await fs.openAsBlob(output_path)
            const new_file = new File([output], `${id}.mp4`)
            console.log({ output, new_file });
            const form_data = new FormData()
            form_data.append("files", new_file)
            form_data.append("filename", `${id}.mp4`)
            await axios.post(
                `https://www.nutrosal.com/saveMotivationImage/Nutrosal/${user_id}`,
                form_data,
                {
                    headers: {
                        "Authorization": token
                    }
                }
            )
            res.json({ status: true, name: `${id}.mp4` })
        }

        return
    })

})