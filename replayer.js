var http = require("http"),
    connect = require("connect"),
    sqlite = require("sqlite3").verbose(),
    streamBuffers = require("stream-buffers"),
    hashgen = require("./hashgen");

function calculateRequestHash(req, cb) {
    var out = new streamBuffers.WritableStreamBuffer({
        initialSize: (100 * 1024),
        incrementAmount: (10 * 1024)
    });

    req.on("end", function () {
        var reqHash = hashgen.calculateRequestHash(out.getContents(), req.url);
        out.destroy();
        cb(null, reqHash);
    });

    req.pipe(out);
}

function getResponse(hash, db, cb) {
    db.get("SELECT resp, headers FROM cache WHERE hash = ?", [ hash ], function (err, row) {
        if (err) {
            cb(err);
            return;
        }

        var headers,
            tmpHeaders;

        if (row && row.headers) {
            tmpHeaders = JSON.parse(row.headers);
            headers = {};

            for (var i = 0, len = tmpHeaders.length; i < len; i += 2) {
                headers[tmpHeaders[i]] = tmpHeaders[i + 1];
            }

            row.headers = headers;
        }

        cb(null, row);
    });
}

function initDatabase(cb) {
    var db = new sqlite.Database("capture.db", sqlite.OPEN_READONLY, function (e) {
        if (e) {
            console.error(e);
            throw e;
        }

        cb.call(null, db);
    });
}

function onRequest(req, res, db) {
    calculateRequestHash(req, function (err, hash) {
        if (err) {
            console.log("Error getting request: " + err);
            res.writeHead(500);
            res.end();
            return;
        }

        getResponse(hash, db, function (err, cache) {
            if (err) {
                throw err;
            }

            if (!cache) {
                console.log("Request not found: " + hash);
                res.writeHead(404);
                res.end();
                return;
            }

            res.writeHead(200, cache.headers);
            if (cache.resp) {
                res.write(cache.resp);
            }
            res.end();

            console.log("Responded to " + hash);
        });
    });
}

// main
(function () {
    initDatabase(function (db) {
        var app = connect();

        app.use(function (req, res) {
            onRequest(req, res, db);
        });

        http.createServer(app).listen(4001);
    });
}());
