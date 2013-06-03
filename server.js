var express = require("express");
var app = express();
var mysql = require("mysql");
var aggregate = require("./aggregate.js");

// Constants for indexes of properties in array format
const SOURCE = 0;
const TARGET = 1;
const TIMESTAMP = 2;
const CONTENT_TYPE = 3;
const COOKIE = 4;
const SOURCE_VISITED = 5;
const SECURE = 6;
const SOURCE_PATH_DEPTH = 7;
const SOURCE_QUERY_DEPTH = 8;
const SOURCE_SUB = 9;
const TARGET_SUB = 10;
const METHOD = 11;
const STATUS = 12;
const CACHEABLE = 13;

app.use(express.methodOverride());
 
// ## CORS middleware
// based on https://gist.github.com/cuppster/2344435
var allowCrossDomain = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "resource://jid1-7obidhpw1yapaq-at-jetpack");
    res.header("Access-Control-Allow-Methods", "POST");
    res.header("Access-Control-Allow-Headers", "Content-Type, Collusion-Share-Data");
      
    // intercept OPTIONS method
    if ("OPTIONS" == req.method) {
        res.send(200);
    }
    else {
        next();
    }
};
app.use(allowCrossDomain);

app.configure(function(){
    app.use(express.static(__dirname + "/public"));
    app.use(express.bodyParser());
});

var pool = mysql.createPool(process.env.DATABASE_URL);

app.get("/", function(req, res) {
    res.send("Hello World!");
});



/**************************************************
*   Get raw connection data
*/
function getRawData(req, callback){
    var filterArray = new Array();
    var valueArray = new Array();
    var paramNum = filterArray.length;
    if ( req.param("source") ){
        paramNum++;
        if ( req.param("source").charAt(0) == "*" ){
            filterArray.push("source LIKE ?");
            valueArray.push("%" + req.param("source").slice(2));
        }else{
            filterArray.push("source = ?");
            valueArray.push(req.param("source"));
        }
    }

    if ( req.param("target") ){
        paramNum++;
        if ( req.param("target").charAt(0) == "*" ){
            filterArray.push("target LIKE ?");
            valueArray.push("%" + req.param("target").slice(2));
        }else{
            filterArray.push("target = ?");
            valueArray.push(req.param("target"));
        }
    }

    if ( req.param("date") ){
        paramNum++;
        filterArray.push("timestamp BETWEEN TIMESTAMP(?) AND DATE_ADD( TIMESTAMP(?), INTERVAL 1 DAY ) ");
        valueArray.push(req.param("date"));
        valueArray.push(req.param("date"));
    }

    if ( req.param("dateSince") && req.param("dateBefore") ){
        paramNum++;
        filterArray.push("timestamp BETWEEN TIMESTAMP(?) AND DATE_ADD( TIMESTAMP(?), INTERVAL 1 DAY )");
        valueArray.push(req.param("dateSince"));
        valueArray.push(req.param("dateBefore"));
    }

    if ( req.param("dateSince") && !req.param("dateBefore") ){
        paramNum++;
        filterArray.push("timestamp BETWEEN TIMESTAMP(?) AND NOW()");
        valueArray.push(req.param("dateSince"));
    }

    if ( !req.param("dateSince") && req.param("dateBefore") ){
        paramNum++;
        filterArray.push("timestamp < TIMESTAMP(?)");
        valueArray.push(req.param("dateBefore"));
    }
    
    if ( !req.param("date") && !req.param("dateSince") && !req.param("dateBefore") ){
        paramNum++;
        filterArray.push("timestamp BETWEEN DATE_SUB( NOW(), INTERVAL 1 DAY ) AND NOW()");
        valueArray.push("");
    }

    if ( req.param("cookie") ){
        paramNum++;
        filterArray.push("cookie = ?" );
        valueArray.push(req.param("cookie") == "true"); // convert String to Boolean
    }

    if ( req.param("sourcevisited") ){
        paramNum++;
        filterArray.push("sourcevisited = ?");
        valueArray.push(req.param("sourcevisited") == "true" );  // convert String to Boolean
    }

    if ( req.param("secure") ){
        paramNum++;
        filterArray.push("secure = ?");
        valueArray.push(req.param("secure") == "true" );  // convert String to Boolean
    }

    if ( filterArray.length > 0 && valueArray.length > 0 ){
        pool.getConnection( function(err,dbConnection){
            console.log("========== GET RAW DATA STARTS ==========");
            var resObj = {};
            //avoid SQL Injection attacks by using ? as placeholders for values to be escaped
            var queryConfig = {
                text: "SELECT * FROM Connection WHERE " + filterArray.join(" AND ") + " ORDER BY timestamp DESC " + " LIMIT 1000",
                values: valueArray
            };
            dbConnection.query(queryConfig.text, queryConfig.values, function(err, rows){
                if (err) {
                    resObj.error = "Error encountered: " + err;
                    console.log("[ ERROR ] getRawData query execution error: " + err);
                }
                resObj.rowCount = rows.length;
                resObj.rows = rows;
                //disconnect dbConnection and send response when all queries are finished
                dbConnection.end(function(err) {
                    if (err) { console.log("[ ERROR ] end connection error: " + err); }
                    console.log("========== GET RAW DATA ENDS ==========");
                    callback(resObj);
                });
            });
        });
    }
}




/**************************************************
*   Get SELECT query result
*/
app.get("/getData", function(req,res){
    var paramsLength = req.params.length || Object.keys(req.body).length || Object.keys(req.query).length;
    // if no params, show messages explaining how the parameters should be used
    if ( paramsLength == 0 ){
        res.redirect('/help.html');
    }else{
        if ( req.param("aggregateData") == "true" ){
            aggregate.getAggregate(req,pool,function(result){
                res.jsonp(result);
            });
        }else{
            getRawData(req,function(result){
                res.jsonp(result);
            });
        }
    }
});



/**************************************************
*   Share data
*/
app.post("/shareData", function(req, res){
    function postToDB(connections,callback){
        var postResponse = {};
        postResponse.rowAdded = 0;
        postResponse.rowFailed = 0;
        pool.getConnection( function(err,dbConnection){
            console.log("========== SHARE DATA STARTS ==========");
            postResponse.timeStart = Date.now();
            for (var i=0; i<connections.length; i++){
                connections[i][TIMESTAMP] = parseInt(connections[i][TIMESTAMP]) / 1000; // converts this UNIX time format from milliseconds to seconds
                //avoid SQL Injection attacks by using ? as placeholders for values to be escaped
                dbConnection.query("INSERT INTO Connection(source, target, timestamp, contentType, cookie, sourceVisited, secure, sourcePathDepth, sourceQueryDepth, sourceSub, targetSub, method, status, cacheable) VALUES (?, ?, FROM_UNIXTIME(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", connections[i], function(err, results){
                    if (err) {
                        if (err) console.log("[ ERROR ] shareData query execution error: " + err);
                        postResponse.error = "Sorry. Error occurred. Please try again.";
                        postResponse.rowFailed++;
                    }else{
                        postResponse.rowAdded++;
                    }
                    dbConnection.end(function(err) {
                        if (err) console.log("[ ERROR ] end connection error: " + err);
                        if ( (postResponse.rowAdded+postResponse.rowFailed) == connections.length ){ // finished posting the last connection
                            postResponse.timeEnd = Date.now();
                            callback(postResponse);
                        }
                    });
                });
            }
        });
    }


    var jsonObj = req.body;
    if ( jsonObj.format === "Collusion Save File" && jsonObj.version === "1.1" ){ // check format and version
        postToDB(jsonObj.connections,function(result){
            console.log("========== SHARE DATA ENDS ==========");
            if ( result.error ){
                console.log("[ ERROR ] " + result.error);
            }else{
                console.log("[ Row Inserted into Table Connections ] " + result.rowAdded + " rows.");
                logUpload(jsonObj.token, result.rowAdded, result.timeStart, result.timeEnd);
            }
        });
        res.send('posting ' + jsonObj.connections.length + ' connections to database');
    }else{
        res.send("Sorry. Format/version " + jsonObj.format + "/" + jsonObj.version + " not supported.");
    }

});


/**************************************************
*   Log posting transaction
*/

function logUpload(token,rowInserted,timeStart,timeEnd){
    token = token.substr(1, token.length-2); // strip the curly bracket {} that wraps token
    var timestamp = timeStart;
    var processTime = timeEnd - timeStart; // in milliseconds
    pool.getConnection(function(err,dbConnection){
        var queryConfig = {
            text : "INSERT INTO LogUpload(token, rowInserted, timestamp, processTime) VALUES (?,?,FROM_UNIXTIME(?),?)",
            values : [ token, rowInserted, timestamp, processTime ]
        };
        console.log("Logging upload transaction...");
        dbConnection.query(queryConfig.text, queryConfig.values, function(err, result){
            if (err) console.log("[ ERROR ] logUpload query execution error: " + err);
            else console.log("[ Row Inserted into Table LogUpload ] Row id: " + result.insertId);
        });    
    });

}




/**************************************************
*   Get getBrowseData query result
*/
app.get("/getBrowseData", function(req,res){
    pool.getConnection( function(err,dbConnection){
        aggregate.getAggregate(req,pool,function(result){
            res.jsonp(result);
        });
    });

});


/**************************************************
*   Get getVisitedWebsite query result
*/
app.get("/getSiteProfile", function(req,res){
    console.log("=== getSiteProfile === " + req.param("name"));
    pool.getConnection( function(err,dbConnection){
        aggregate.getAggregate(req,pool,function(result){
            res.jsonp(result);
        });
    });
});


app.listen(process.env.PORT, function() {
    console.log("Listening on " + process.env.PORT);
});
