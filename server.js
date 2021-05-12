/*
Gneiss  - the server. 
April 10th. version 0.1
Gneiss may be freely distributed under the MIT License 
http://www.cs.cmu.edu/~shihpinc/gneiss.html
*/

// JavaScript Document
var util = require("util");
var url = require("url");
var path = require("path");
var fs = require("fs");

var https = require("https");
var http = require("http");
var zlib = require("zlib");

// for streaming data, return at most 80 docs
var RETURN_DATA_MAX_LENGTH = 80;

// Starting a web server.
var server = http.createServer(function (request, response) {
  var uri = url.parse(request.url).pathname;
  if (request.url.indexOf("/callback") == 0) {
    uri = "/callback.html";
  }

  var filename = path.join(process.cwd(), uri);

  fs.access(filename, function (err) {
    if (err) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.write("404 Not Found\n");
      response.end();
      return;
    }

    if (fs.statSync(filename).isDirectory()) filename += "/index.html";

    fs.readFile(filename, "binary", function (err, file) {
      if (err) {
        response.writeHead(500, { "Content-Type": "text/plain" });
        response.write(err + "\n");
        response.end();
        return;
      }

      response.writeHead(200);
      response.write(file, "binary");
      response.end();
    });
  });
});

// Connecting to MongoDB
var mongoose = require("mongoose");
mongoose.connect("mongodb://localhost/Gneiss");
var db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function callback() {
  console.log("connected to Mongo");
});

// docSchema is the data in MongoDB - NOT SPREADSHEET ID INFO
/*
src is the web API 
time is when the data arrived
data is the doc returned by the web API (src)
spreadsheetId is the id of the spreadsheet (number)
*/
var docSchema = mongoose.Schema({
  src: String,
  time: Number,
  data: Object,
  spreadsheetId: Number,
});

var Doc = mongoose.model("Doc", docSchema);

var webAppSchema = mongoose.Schema({
  spreadsheetId_URL: String,
  data: String,
});

var webAppData = mongoose.model("webAppSchema", webAppSchema);

var clients = 0;
// for clientside communication

const { Server } = require("socket.io");
var io = new Server(server);
io.sockets.on("connection", function (socket) {
  // a connection is a client web app instance, so this is independent for each spreadsheet opened
  // each client has an unique ID
  var spreadsheetId,
    spreadsheetInfo,
    count = 0;

  // 10/10 change queue to an object, indexed by rawURL. each client has its own queue.
  var queue = {};

  socket.on("retrieveAppData", function (data) {
    // data is spreadsheetID_URL
    var query = webAppData
      .find({ spreadsheetId_URL: data })
      .exec(function (err, docs) {
        console.log(docs);
        socket.emit("receiveAppData", docs);
      });
  });

  socket.on("clientSpreadsheetInfo", function (data) {
    // receive a spreadsheet info ojbect from client
    spreadsheetInfo = data;
    spreadsheetId = data.Id;

    console.log("new client opened (ID:" + spreadsheetId + ")");
  });

  // set up timer for sending web requests
  // current implementation - each spreadsheet client has its own timer

  var timer = setInterval(function () {
    count++;

    if (spreadsheetInfo == undefined) {
      // spreadsheetInfo not defined meaning the client is not connected yet
      return;
    }

    Object.keys(queue).forEach(function (key) {
      var obj = queue[key];
      var s = obj.params.rawURL;

      // running criteria (does not consider same second request):
      // 1) isStream - needs to run no matter what. if the streaming source is only in source pane, the source will not be in spreadsheetInfo
      // 2) not stream - only when it is currently not running (only need to run once)
      /*console.log("!!!!!!"+spreadsheetInfo.streaming[s]);	
			if(spreadsheetInfo.streaming[s]){
				console.log(spreadsheetInfo.streaming[s]["frequency"], spreadsheetInfo.streaming[s].pause);
			}*/
      if (
        (obj.params.isStream == "isStream" &&
          spreadsheetInfo.streaming[s] !== undefined &&
          count % spreadsheetInfo.streaming[s].frequency === 0 &&
          !spreadsheetInfo.streaming[s].pause) ||
        (obj.params.isStream == "isStream" &&
          spreadsheetInfo.streaming[s] == undefined &&
          count % 5 == 0) ||
        !obj.running
      ) {
        obj.running = true; // set it to be running, send the request
        var hh = http;
        if (obj.params.url.indexOf("https://") == 0) {
          hh = https;
        }
        // it's this source's time to run! send request
        var reqGet = hh.request(obj.optionsGetMsg, function (res) {
          // when it returns...
          // console.log(res);
          // store the return data in output

          var output;
          if (res.headers["content-encoding"] == "gzip") {
            var gzip = zlib.createGunzip();
            res.pipe(gzip);
            output = gzip;
          } else {
            output = res;
          }

          var d = "";
          output.on("data", function (chunk) {
            d += chunk;
          });

          output.on("end", function () {
            // the full data collected.
            //var obj = queue[res.req["host"]+res.req["path"]];
            //console.log(res.req.url+","+res.req.path+", "+obj);
            /*for(var j=0; j<queue.length; j++){
							if(res.req.path == queue[j].optionsGetMsg.path);
							obj = queue[j];
						}*/
            //console.log(obj);

            // finish getting all data, making them into the right format
            var jsonData = {};
            try {
              jsonData = JSON.parse(d);
            } catch (e) {
              var startPos = d.indexOf("({");
              var endPos = d.indexOf("})");
              try {
                jsonData = JSON.parse(d.substring(startPos + 1, endPos + 1));
              } catch (ee) {
                jsonData = { erro: "file format" };
              }
            }
            var time = Date.now();
            // jsonData is the return document
            if (obj.params.isStream == "isStream") {
              // if it's a stream source, the source needs to be kept in the queue
              // in order to run periodically.
              // and the returned data needs to be stored in the database
              var doc = new Doc({
                src: obj.params.url,
                time: time,
                data: jsonData,
                spreadsheetId: spreadsheetId,
              });
              // stored in DB. function is the callback after the document is stored
              doc.save(function () {
                // after the doc is saved, query the db for new returned doc based on sorting and filtering rules.
                // basic query - look for all document returned from this source and this spreadsheet
                var query = Doc.find({
                  src: obj.params.url,
                  spreadsheetId: spreadsheetId,
                });
                // now for sorting and filtering
                var rules = obj.params.rules;
                if (rules == undefined) {
                  // meaning the data is not in the spreadsheet at all - if it's in the spreadsheet, at least there'll be dragTime.
                  // no need to do query. send back to client immediately
                  var returnObj = {
                    // currently source pane and spreadsheet data are sent differently
                    jsonData: { sourcePanelData: jsonData },
                    option: obj.params,
                    time: time,
                  };

                  socket.emit("response", returnObj);
                } else {
                  // first: sort
                  if (rules.sort != undefined) {
                    var path = "";
                    if (rules.sortPath != undefined) {
                      path = rules.sortPath.replace("$.", "");
                      path = "data." + path;
                    }

                    if (rules.sort == "Ascending_time") {
                      query = query.sort({ time: "ascending" });
                    } else if (rules.sort == "Ascending") {
                      query = query.sort(path);
                    } else if (rules.sort == "Descending") {
                      query = query.sort("-" + path);
                    } else {
                      query = query.sort({ time: "desc" });
                    }
                  } else {
                    query = query.sort({ time: "desc" });
                  }
                  // if the data has a drag time - filter to only return the data after dragTime.
                  if (rules.dragTime != undefined) {
                    query = query.where("time").gt(rules.dragTime);
                  }
                  // needs a better way to deal with data that is streamed but only in source pane (wihtout dragTime)

                  if (rules.filterBefore != undefined) {
                    query = query.where("time").lte(rules.filterBefore);
                  }
                  if (rules.filterAfter != undefined) {
                    query = query.where("time").gte(rules.filterAfter);
                  }

                  if (rules.filterValueObj != undefined) {
                    for (var col in rules.filterValueObj) {
                      var filterObj = rules.filterValueObj[col];

                      if (filterObj.isFilterValue) {
                        var path = filterObj.path.replace("$.", "");
                        path = "data." + path;

                        if (filterObj.filterValueMethod == "=") {
                          query = query
                            .where(path)
                            .equals(filterObj.filterValueNum);
                        } else if (filterObj.filterValueMethod == ">=") {
                          query = query
                            .where(path)
                            .gte(filterObj.filterValueNum);
                        } else if (filterObj.filterValueMethod == "<=") {
                          query = query
                            .where(path)
                            .lte(filterObj.filterValueNum);
                        } else if (filterObj.filterValueMethod == ">") {
                          query = query
                            .where(path)
                            .gt(filterObj.filterValueNum);
                        } else if (filterObj.filterValueMethod == "<") {
                          query = query
                            .where(path)
                            .lt(filterObj.filterValueNum);
                        }
                      }
                      // remove duplicates somehow doesn't work here
                      /*if(filterObj.isRemoveDuplicates){
												var path = filterObj.path.replace("$.", "");
												path = "data."+path;
												query = query.where(path).distinct(path);		
											}*/
                    }
                  }

                  if (rules.windowSize != undefined) {
                    query = query.limit(rules.windowSize);
                  } else {
                    query = query.limit(RETURN_DATA_MAX_LENGTH);
                  }

                  query
                    .select("time data")
                    .lean()
                    .exec(function (err, docs) {
                      var returnObj = {
                        // currently source pane and spreadsheet data are sent differently
                        jsonData: {
                          streamData: docs,
                          sourcePanelData: jsonData,
                        },
                        option: obj.params,
                        time: time,
                      };

                      socket.emit("response", returnObj);
                    });
                }
              });
            } else {
              // if it's not a stream sorce, return data, clean queue
              var returnObj = {
                jsonData: jsonData,
                option: obj.params,
                time: time,
              };
              socket.emit("response", returnObj);

              console.log("send response to spreadsheet ID:" + spreadsheetId);
              // console.log(jsonData);

              // remove that API call from queue
              delete queue[res.req.base + res.req.path];
            }
          });
        });

        reqGet.on("error", function (e) {
          socket.emit("response_error", e);
        });

        reqGet.end();
      }
    });
  }, 1000); // tick every second

  // when the server receives a web request from the client
  socket.on("api", function (data) {
    // data format: {url:final URL with constraint values turned to constatns. rawURL:the raw API url. isStream: "isStream" if a stream source. rules: streamFilters}

    // setting up getMsg to send to the source to retreive data later in the timer
    // cut off http or https from URL - required for sending http request
    // data.url is the processed web API url (does not contain constraints)
    var url = data.url;
    if (url.indexOf("https://") == 0) {
      url = url.substring("https://".length, url.length);
    } else if (url.indexOf("http://") == 0) {
      url = url.substring("http://".length, url.length);
    }

    // cut of the domain name
    var base = "",
      path = "";
    if (url.indexOf("/") != -1) {
      base = url.substring(0, url.indexOf("/"));
      path = url.substring(url.indexOf("/"), url.length);
    } else {
      base = url;
      path = "";
    }

    base = base.replace(/\s/g, "%20");
    path = path.replace(/\s/g, "%20");
    console.log("base: " + base + ", path: " + path);

    var optionsGetMsg = {
      host: base,
      path: path,
      method: "GET", // only work for GET now.
    };

    // queue index by base+path
    // no need to check if the source is already in queue and running - this only updates queue object, doesn't fire the actual request. if the same request is fired before the other returns from the client, the server should run it twice too. no prob.
    queue[base + path] = {
      optionsGetMsg: optionsGetMsg,
      params: data,
      running: false,
      spreadsheetId: spreadsheetId,
    };
  });

  // for storing UI input data
  socket.on("saveUiValue", function (data) {
    // save value
    var value;
    if (isNaN(data.value)) {
      value = data.value;
    } else {
      value = parseFloat(data.value);
    }

    var time = Date.now();
    var doc = new Doc({
      src: data.source,
      time: time,
      data: value,
      spreadsheetId: spreadsheetId,
    });
    doc.save(function () {
      var query = Doc.find({ src: data.source, spreadsheetId: spreadsheetId });

      var rules = data.rules;

      if (rules != undefined) {
        if (rules.sort != undefined) {
          if (rules.sort == "Ascending_time") query = query.sort({ time: 1 });
          else if (rules.sort == "Ascending") {
            query = query.sort({ data: 1 });
          } else if (rules.sort == "Descending") {
            query = query.sort({ data: "desc" });
          } else query = query.sort({ time: "desc" });
        } else {
          query = query.sort({ time: "desc" });
        }

        if (rules.dragTime != undefined) {
          query = query.where("time").gt(rules.dragTime);
        }

        if (rules.filterBefore != undefined) {
          if (rules.filterBefore.trim().toLowerCase() == "now") {
            query = query.where("time").lte(Date.now());
          } else {
            query = query.where("time").lte(rules.filterBeforeTime);
          }
        }
        if (rules.filterAfter != undefined) {
          if (rules.filterAfter.trim().toLowerCase() == "now") {
            query = query.where("time").gte(Date.now());
          } else {
            query = query.where("time").gte(rules.filterAfterTime);
          }
        }

        if (rules.filterValueObj != undefined) {
          var filterObj = rules.filterValueObj;
          if (filterObj.isFilterValue) {
            if (filterObj.filterValueMethod == "=") {
              query = query.where(data).equals(filterObj.filterValueNum);
            } else if (filterObj.filterValueMethod == ">=") {
              query = query.where(path).gte(filterObj.filterValueNum);
            } else if (filterObj.filterValueMethod == "<=") {
              query = query.where(path).lte(filterObj.filterValueNum);
            } else if (filterObj.filterValueMethod == ">") {
              query = query.where(path).gt(filterObj.filterValueNum);
            } else if (filterObj.filterValueMethod == "<") {
              query = query.where(path).lt(filterObj.filterValueNum);
            }
          }
        }

        if (rules.windowSize != undefined) {
          query = query.limit(rules.windowSize);
        } else {
          query = query.limit(40);
        }
      } else {
        query = query.sort({ time: "desc" }).limit(40);
      }
      query
        .select("time data")
        .lean()
        .exec(function (err, docs) {
          var returnObj = {
            jsonData: { streamData: docs },
            option: data,
            time: time,
          };
          socket.emit("saveUiValueDone", returnObj);
        });
    });
  });

  // when a client disconnect
  socket.on("disconnect", function () {
    console.log(
      "Got disconnect! clear interval, remove itmes in queue. current setting: remove all when disconnect"
    );
    // stop timer
    clearInterval(timer);
    // remove queue items
    if (spreadsheetInfo != undefined && spreadsheetInfo.cleanUp == "close") {
      Object.keys(queue).forEach(function (key) {
        if (queue[key]["spreadsheetId"] == spreadsheetInfo.Id) {
          delete queue[key];
        }
      });
    }

    // for testing, delete all db item from this spreadsheet
    Doc.find({ spreadsheetId: spreadsheetId }).remove().exec();

    // clean data from all client
    // Doc.find().remove().exec();

    // client closed
    console.log("queue length=" + Object.keys(queue).length);
    console.log("client closed (ID:" + spreadsheetId + ")");

    // close db connection -> automatically closed when server shut down
  });

  // need to be fixed
  socket.on("export", function (data) {
    console.log(data);
    var s = JSON.stringify(data);

    var appRoot = path.join(process.cwd(), "/app/");
    var appDirectory = appRoot + data["url"];
    var spreadsheetId_URL = spreadsheetId + data["url"];

    fs.mkdir(appDirectory, function (e) {
      if (e) {
        socket.emit("export_done", "Export failed. Code: " + e);
      } else {
        // store the app data into the database
        var app = new webAppData({
          spreadsheetId_URL: spreadsheetId_URL,
          data: s,
        });

        // stored in DB. function is the callback after the document is stored
        app.save(function () {
          // when finish storing
          // copy default index.html to the specific app directory
          fs.createReadStream(appRoot + "index.html", { autoClose: true }).pipe(
            fs.createWriteStream(appDirectory + "/index.html")
          );

          var dataString = "var spreadsheetId_URL='" + spreadsheetId_URL + "';";
          fs.writeFile(
            appDirectory + "/resources.js",
            dataString,
            function (err) {
              if (err) {
                console.log(err);
                socket.emit("export_done", "Export failed. Code: " + err);
              } else {
                console.log("The file was saved!");
                socket.emit(
                  "export_done",
                  "http://localhost:8000/app/" + data["url"] + "/index.html"
                );
              }
            }
          );
        });
      }
    });
  });
});

// server listens port 8000
server.listen(8000);
