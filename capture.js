var httpProxy = require("http-proxy"),
    http = require("http"),
    connect = require("connect"),
    url = require("url"),
    sqlite = require("sqlite3").verbose(),
    hashgen = require("./hashgen");

function getProxyTarget(req) {
    var targetUrl = url.parse(req.url);

    delete targetUrl.pathname;
    delete targetUrl.query;
    delete targetUrl.search;

    return url.format(targetUrl);
}

function setupBuffer(res) {
    res.on('data', function (data) {
        var dataBuf;

        if (data instanceof Buffer) {
            dataBuf = data;
        } else {
            dataBuf = new Buffer(data);
        }

        res.__buf = (res.__buf && Buffer.concat([res.__buf, dataBuf])) || dataBuf;
    });
}

function receivedResponse(hash, body, headers, db) {
    db.run("DELETE FROM cache WHERE hash = ?", [ hash ], function (e) {
        db.run("INSERT INTO cache (hash, resp, headers) VALUES (?, ?, ?)", [ hash, body, JSON.stringify(headers)], function (err) {
            if (err) {
                throw err;
            }

            console.log("[RESPONSE] Received response from server for hash " + hash);
        });
    });
}

function setupProxyServer(db) {
    var proxy = httpProxy.createProxyServer({});

    proxy.on('proxyRes', function (proxyRes, req) {
        setupBuffer(proxyRes);
    });

    proxy.on('end', function (req, res, proxyRes) {
        var reqHash = hashgen.calculateRequestHash(req.__buf, req.url),
            responseBody = proxyRes.__buf,
            responseHeaders = proxyRes.rawHeaders;

        receivedResponse(reqHash, responseBody, responseHeaders, db);
    });

    return proxy;
}

function proxyRequest(req, res, proxy) {
    setupBuffer(req);

    var target = getProxyTarget(req);

    proxy.web(req, res, {
        target: target
    }, function (e) {
        console.log(e);
    });
}

function initDatabase(cb) {
    var db = new sqlite.Database("capture.db", sqlite.OPEN_CREATE | sqlite.OPEN_READWRITE, function (e) {
        if (e) {
            throw e;
        }

        db.run("CREATE TABLE cache (hash TEXT, resp BLOB, headers TEXT)", function (e) {});
        cb.call(null, db);
    });
}

// main
(function () {
    initDatabase(function (db) {
        var proxy = setupProxyServer(db);
        var app = connect();

        app.use(function (req, res) {
            proxyRequest(req, res, proxy);
        });

        http.createServer(app).listen(4001);
    });
}());
