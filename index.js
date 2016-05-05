"use strict";

var assert = require('assert');
var fs = require('fs');
var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var multer = require('multer');
var io = require('socket.io')(http);


/**
 *	config should contain
 *	uploadPath: Absolute path to where uploads should be stored
 *	dbUrl: Mongo url where the messages should be stored
 *	verifyReceiver: Optional callback that returns true if the receiver should be accepted, false otherwise
 */
module.exports = function(config) {
	assert('uploadPath' in config);
	assert('mongoose' in config);
	assert('dbconn' in config);
	assert('port' in config);
	assert(!('verifyReceiver' in config) || typeof(config.verifyReceiver) === 'function');

	var upload = multer({dest: config.uploadPath});
	var Message = require('./models/message')(config.mongoose, config.dbconn);
	var validateRoom = 'verifyReceiver' in config ? verifyReceiver : function() {return true;};

	// In memory storage for connected clients
	var clients = {}; // username -> list of sockets

	function getParticipantsList(receiver) {
		var participants = [];
		for (var sid in clients) {
			if (clients.hasOwnProperty(sid)) {
				if (clients[sid].roomId == receiver) {
					participants.push(clients[sid].username);
				}
			}
		}
		return participants;
	}

	// Initialize chat
	function onClientConnect(socket) {
		console.log('[Chat]' + socket.id + ' connected');

		// Configure the socket for joining a room
		socket.on('message', function(msg) {
			console.log('[Chat]' + 'received generic message!');
			if (!validateRoom(msg.roomId)) {
				console.log('[Chat]' + "Invalid room supplied with chat message");
				return;
			}
			if (!(socket.id in clients)) {
				clients[socket.id] = {
					username: msg.username,
					roomId: msg.roomId
				};
				socket.join(msg.roomId);
			} else {
				var roomId = socket.id in clients
					? clients[socket.id].roomId
					: null;
				socket.leave(clients[socket.id].roomId);
				socket.join(msg.roomId);
				clients[socket.id].roomId = msg.roomId;
				if (roomId)
					io.to(roomId).emit('roomParticipants', getParticipantsList(roomId));
			}
			socket.send({
				status: 'OK',
				roomId: msg.roomId
			});
			io.to(msg.roomId).emit('roomParticipants', getParticipantsList(msg.roomId));
		});
		// Configure the socket for sending messages
		socket.on('postMessage', function(msg) {
			// File/Image messages are handled with a POST request
			// Only regular messages are sent via ws
			var roomId = clients[socket.id].roomId;
			var message = new Message({
				sender: clients[socket.id].username,
				receiver: roomId,
				messageType: 'text',
				message: msg.message
			});
			message.save(function(err, data) {
				if (err) {
					console.log('[Chat]' + 'message from ' + clients[socket.id].username + ' failed to save to db:');
					console.log(data);
				} else {
					io.to(roomId).emit('chatMessage', data);
				}
			});
		});
		socket.on('disconnect', function() {
			console.log('[Chat]' + socket.id + ' disconnected');
			var roomId = socket.id in clients
				? clients[socket.id].roomId
				: null;
			delete clients[socket.id];
			if (roomId)
				io.to(roomId).emit('roomParticipants', getParticipantsList(roomId));
		});
	}

	io.on('connection', onClientConnect);

	function sendMessage(roomId, msg) {
		io.to(roomId).emit('chatMessage', msg);
	}

	// Allow CORS
	var allowCrossDomain = function(req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
		next();
	};
	app.use(allowCrossDomain);
	// Add body parsers
	app.use(bodyParser.urlencoded({
	    extended: true
	}));
	app.use(bodyParser.json());

	/**
	 *	This API endpoint is used for file messages
	 */
	app.route('/upload').post(upload.single('attachment'), function(req, res, next) {
		var path = req.file.path;
		if (!validateRoom(req.body.receiver)) {
			console.log('[Chat]' + 'Invalid room ID supplied on file upload');
			if (req.file.path) {
				fs.unlink(path, function(err) {
					if (err) throw err;
					console.log('[Chat]' + 'successfully deleted ' + path);
				});
			}
			return next();
		}
		var message = new Message({
			sender: req.body.sender,
			receiver: req.body.receiver,
			messageType: req.body.messageType,
			originalFilename: req.file.originalname,
			filePath: path,
			fileMimeType: req.file.mimetype
		});
		message.save(function(err, data) {
			if (err) {
				console.log({
					error: '[Chat]Failed to save file message into DB',
					originalFilename: req.file.originalname,
					path: path,
					err: err
				});
				return next();
			} else {
				res.status(201).json({
					status: "OK",
					id: data._id
				});
				// Send the message to clients
				sendMessage(req.body.receiver, data);
				console.log('[Chat]' + '<' + req.file.originalname + '>' + ' was uploaded');
			}
		});
		
	});

	/**
	 *	This API returns the file associated with the message id
	 */
	app.route('/file/:id').get(function(req, res, next) {
		Message.findById(req.params.id, function(err, data) {
			if (err) {
				console.log('[Chat]' + "Error getting file:");
				console.log(err);
				return next();
			} else if (data) {
				var file = data.filePath;
				if (data.messageType == 'image') {
					res.header('Content-Type', data.fileMimeType);
					fs.readFile(file, function(err, data) {
						if (err) throw err;
						res.send(data);
					});
				} else if (data.messageType == 'file') {
					res.download(file, data.originalFilename);
				} else {
					return next();
				}
			} else {
				return next();
			}
		});
	});

	/**
	 *	This API returns all recorded messages for a given room/receiver
	 */
	app.route('/load_message').post(function(req, res, next) {
		var query = {
			receiver: req.body.roomId
		};
		Message.find(query).sort({timestamp: 1}).select({
			_id: 1,
			sender: 1,
			receiver: 1,
			messageType: 1,
			message: 1,
			originalFilename: 1,
			timestamp: 1
		}).exec(function(err, data) {
			if (err) throw err;
			res.json(data);
		});
	});


	app.use('/static', express.static(__dirname + '/client'));

	app.get('/', function(req, res) {
		res.json(clients);
	});


	// // 404
	// app.use(function(req, res, next) {
	// 	next('404');
	// });
	// // All errors
	// app.use(function(err, req, res, next) {
	// 	console.log(err);
	// 	res.status(500).send('Something went wrong!');
	// });

	http.listen(config.port, function() {
		console.log('[Chat]' + 'listening on ' + config.port);
	});

};