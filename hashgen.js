var md5 = require("md5");

module.exports = {
    calculateRequestHash: function (data, url) {
        data = data || "{}";
        var reqHash = md5(data);
        return reqHash + ":" + url;
    }
};
