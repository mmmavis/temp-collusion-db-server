var express = require("express");
var app = express();
var pg = require("pg");

app.configure(function(){
  app.use(express.static(__dirname + "/public"));
  app.use(express.bodyParser());
});


app.get("/", function(req, res) {
  var client = new pg.Client(process.env.DATABASE_URL);
  client.connect(function(err) {
    if (err) console.log(err);
  });
  //client.query("CREATE TABLE connections( id SERIAL PRIMARY KEY, source varchar(100), target varchar(100), timestamp timestamp, contentType varchar(50), cookie boolean, sourceVisited boolean, secure boolean, sourcePathDepth int, sourceQueryDepth int )");
  client.on("drain", client.end.bind(client));
  
  res.send("Hello World! test");
});


/**************************************************
*   Reset table
*/
app.get("/resetTable", function(req, res){
  console.log("=== RESET TABLE ===");
  
  var client = new pg.Client(process.env.DATABASE_URL);
  client.connect(function(err) {
    if (err) console.log("RESET TABLE ERROR: " + err);
  });
  client.query("DELETE FROM connections");
  client.query("ALTER SEQUENCE connections_id_seq RESTART WITH 1");
  client.on("drain", client.end.bind(client));
  
  res.send("Reset Table");
});


/**************************************************
*   Donate data
*/
app.post("/donateData", function(req, res){
  console.log(req.body);
  
  var jsonObj = req.body;
  if ( jsonObj.format == "CollusionSaveFile" && jsonObj.version == "1.0" ){ // check format and version
    var connections = jsonObj.connections;
    var client = new pg.Client(process.env.DATABASE_URL);
    client.connect(function(err) {
        if (err) console.log(err);
    });
    for (var i=0; i<connections.length; i++){
      connections[i][2] = parseInt(connections[i][2]) / 1000; // converts this UNIX time format from milliseconds to seconds
      client.query({
        text: "INSERT INTO connections(source, target, timestamp, contenttype, cookie, sourcevisited, secure, sourcepathdepth, sourcequerydepth) VALUES (substr(quote_literal($1), 2, length($1)), substr(quote_literal($2), 2, length($2)), to_timestamp($3), substr(quote_literal($4), 2, length($4)), $5, $6, $7, $8, $9)",
        values: connections[i]
      }, function(err,result){
            if (err) {
              console.log("=== ERROR === " + err);
              res.send("Sorry. Error occurred. Please try again.");
            }else res.send("Thanks!");
      });
    }
  }else{
    res.send("Sorry. Format/version " + jsonObj.format + "/" + jsonObj.version + " not supported.");
  }
});


/**************************************************
*   Get SELECT query result
*/
app.get("/getData", function(req,res){

  var resObj = {};
  var client = new pg.Client(process.env.DATABASE_URL);
    client.connect(function(err) {
      if (err) console.log(err);
  });
  
  // SELECT by source ====================
  if ( req.param("source") ){
    if ( req.param("source").charAt(0) == "*" ){ // returns all matched subdomains
      var queryConfig = {
        text: "SELECT * FROM connections WHERE source LIKE substr(quote_literal($1), 2, length($1))",
        values: [ "%" + req.param("source").slice(2) ]
      };
    }else{ // exact matched domain
      var queryConfig = {
        text: "SELECT * FROM connections WHERE source = substr(quote_literal($1), 2, length($1))",
        values: [ req.param("source") ]
      };
    }
  }
  // SELECT by target ====================
  else if( req.param("target") ){
    if ( req.param("target").charAt(0) == "*" ){ // returns all matched subdomains
      var queryConfig = {
        text: "SELECT * FROM connections WHERE target LIKE substr(quote_literal($1), 2, length($1))",
        values: [ "%" + req.param("target").slice(2) ]
      };
    }else{ // exact matched domain
      var queryConfig = {
        text: "SELECT * FROM connections WHERE target = substr(quote_literal($1), 2, length($1))",
        values: [ req.param("target") ]
      };
    }
  }
  // SELECT by cookie ====================
  else if( req.param("cookie") ){
    var queryConfig = {
      text: "SELECT * FROM connections WHERE cookie = $1",
      values: [ req.param("cookie") ]
    };
  }
  // SELECT by sourcevisited ====================
  else if( req.param("sourcevisited") ){
    var queryConfig = {
      text: "SELECT * FROM connections WHERE sourcevisited = $1",
      values: [ req.param("sourcevisited") ]
    };
  }
  // SELECT by secure ====================
  else if( req.param("secure") ){
    var queryConfig = {
      text: "SELECT * FROM connections WHERE secure = $1",
      values: [ req.param("secure") ]
    };
  }

  if ( queryConfig ){
    client.query(queryConfig, function(err, result){
      if (err) {
        resObj.error = "Error encountered:" + err;
        console.log("=== ERROR === " + err);
      }
      resObj.rowCount = result.rowCount;
      resObj.rows = result.rows;
    });
  }

  //disconnect client and send response when all queries are finished
  client.on("drain", function(){
    client.end.bind(client);
    res.jsonp(resObj);
  });

});



/**************************************************
*   Get getBrowseData query result
*/
app.get("/getBrowseData", function(req,res){
  var resObj = {};
  var client = new pg.Client(process.env.DATABASE_URL);
    client.connect(function(err) {
      if (err) console.log(err);
  });
  
  client.query(req.param("trackersQuery"), function(err, result){
    if (err) {
      resObj.error = "Error encountered:" + err;
      console.log("=== ERROR === " + err);
    }
    resObj.trackers = result.rows;
  });

  client.query(req.param("websitesQuery"), function(err, result){
    if (err) {
      resObj.error = "Error encountered:" + err;
      console.log("=== ERROR === " + err);
    }
    resObj.websites = result.rows;
  });

  //disconnect client and send response when all queries are finished
  client.on("drain", function(){
    client.end.bind(client);
    res.jsonp(resObj);
  });
});


/**************************************************
*   Get getVisitedWebsite query result
*/
app.get("/getVisitedWebsite", function(req,res){
  console.log("=== getVisitedWebsite === " + req.param("source"));
  var resObj = {};
  var client = new pg.Client(process.env.DATABASE_URL);
    client.connect(function(err) {
      if (err) console.log(err);
  });

  var queryConfig = {
      text: "SELECT DISTINCT target, cookie FROM connections WHERE source LIKE substr(quote_literal($1), 2, length($1)) ORDER BY target",
      values: [ req.param("source") ]
    };
  
  client.query(queryConfig, function(err, result){
    if (err) {
      resObj.error = "Error encountered:" + err;
      console.log("=== ERROR === " + err);
    }
    resObj.rowCount = result.rowCount;
    resObj.rows = result.rows;
  });

  //disconnect client and send response when all queries are finished
  client.on("drain", function(){
    client.end.bind(client);
    res.jsonp(resObj);
  });
});



/**************************************************
*   Get getTracker query result
*/
app.get("/getTracker", function(req,res){
  console.log("=== getTracker === " + req.param("target"));
  var resObj = {};
  var client = new pg.Client(process.env.DATABASE_URL);
    client.connect(function(err) {
      if (err) console.log(err);
  });

  var queryConfig = {
      text: "SELECT DISTINCT source, cookie FROM connections WHERE target LIKE substr(quote_literal($1), 2, length($1)) ORDER BY source",
      values: [ req.param("target") ]
    };
  
  client.query(queryConfig, function(err, result){
    if (err) {
      resObj.error = "Error encountered:" + err;
      console.log("=== ERROR === " + err);
    }
    resObj.rowCount = result.rowCount;
    resObj.rows = result.rows;
  });

  //disconnect client and send response when all queries are finished
  client.on("drain", function(){
    client.end.bind(client);
    res.jsonp(resObj);
  });
});




app.listen(process.env.PORT, function() {
  console.log("Listening on " + process.env.PORT);
});
