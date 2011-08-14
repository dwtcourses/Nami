/*!
 * Nami application.
 *
 * Copyright 2011 Marcelo Gornstein <marcelog@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
var nami = require("./nami.js");
var namiAction = require("./message/action.js");
var namiMongoModels = require("./mongomodels.js");
var util = require("util");
var events = require("events");

function MyApp(config) {
	var self = this;
	this.config = config;
    this.ami = new nami.Nami(config.amiData);
    this.ami.on('namiInvalidPeer', function () { self.onInvalidPeer(); });
    this.ami.on('namiLoginIncorrect', function () { self.onLoginIncorrect(); });
    this.ami.on('namiEvent', function (event) { self.onEventToClients(event); });
    this.ami.on('namiEvent', function (event) { self.onEventToMongo(event); });
    this.ami.on('namiEvent', function (event) { self.onAnyEvent(event); });
    this.on('Dial', function (event) { self.onDial(event); });
    this.clients = [];
    namiMongoModels.mongoose.connect(
    	'mongodb://' + config.mongo.user + ':' + config.mongo.password
    	+ '@' + config.mongo.host + ':' + config.mongo.port
    	+ '/' + config.mongo.dbname
    );
};
util.inherits(MyApp, events.EventEmitter);
MyApp.prototype.onAnyEvent = function (event) {
//    console.log(event);
    this.emit(event.Event, event);
};

MyApp.prototype.onDial = function (event) {
    if (event.SubEvent === 'Begin') {
        var callEntity = new namiMongoModels.CallModel();
        callEntity.channel1 = event.Channel;
        callEntity.uniqueId1 = event.Uniqueid;
        callEntity.channel2 = event.Destination;
        callEntity.uniqueId2 = event.DestUniqueID;
        callEntity.dialString = event.Dialstring;
        callEntity.clidNum = event.CallerIDNum;
        callEntity.clidName = event.CallerIDName;
        callEntity.save(function (err) {
            if (err !== null) {
                console.log("Error saving call: " + err);
            }
        });
    } else if (event.SubEvent === 'End') {
        console.log('End');
    }
}

MyApp.prototype.onEventToMongo = function (event) {
    var eventEntity = new namiMongoModels.EventModel();
    eventEntity.uniqueId = typeof(event.Uniqueid) !== 'undefined' ? event.Uniqueid : '';
    eventEntity.name = typeof(event.Event) !== 'undefined' ? event.Event : '';
    eventEntity.channel = typeof(event.Channel) !== 'undefined' ? event.Channel : '';
    eventEntity.event = JSON.stringify(event); 
    eventEntity.save(function (err) {
        if (err !== null) {
            console.log("Error saving event: " + err);
        }
    });
};

MyApp.prototype.onEventToClients = function (event) {
    for (client in this.clients) {
    	this.clients[client].emit('event', event);
    }
};
MyApp.prototype.onInvalidPeer = function (data) {
    console.log('invalid peer: ' + data);
    process.exit();
};
MyApp.prototype.onLoginIncorrect = function (data) {
    console.log('login incorrect');
    process.exit();
};
MyApp.prototype.onWebSocketDisconnect = function () {
	console.log('disconnect');
};
MyApp.prototype.onWebSocketMessage = function (message, socket) {
	this.ami.send(new namiAction.CoreShowChannelsAction(), function (response) { socket.emit('response', response); });
};
MyApp.prototype.onWebSocketConnect = function (socket) {
	var self = this;
	this.clients.push(socket);
    socket.on('message', function (message) { self.onWebSocketMessage(message, socket); });
    socket.on('disconnect', this.onWebSocketDisconnect);
};
MyApp.prototype.run = function() {
	var io = require('socket.io').listen(this.config.webSocket.port);
	var self = this;
	io.sockets.on('connection', function (socket) {
		self.onWebSocketConnect(socket);
	});
	this.ami.open();
};

exports.MyApp = MyApp;

